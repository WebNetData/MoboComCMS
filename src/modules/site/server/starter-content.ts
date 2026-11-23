import { createHash } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import type { NextRequest } from 'next/server'
import { requirePerm } from '@/modules/identity/server/access'
import { auditAdminStrict } from '@/platform/audit/server'
import { prepareDocument, validateDocumentRelations } from '@/modules/editor/server/document-validation'
import { syncedPatternIds } from '@/modules/editor/domain/module-blocks'
import { EditorError } from '@/modules/editor/server/errors'
import type { EditorActor } from '@/modules/editor/server/documents'
import { createPage } from './page-commands'

export interface StarterContent { key: string; slug: string; title: string; document: Record<string, unknown> }
export interface StarterContentBinding { key: string; pageId: number }
export interface StarterContentItem {
  key: string; slug: string; title: string; action: 'create' | 'preserve' | 'removed'; pageId?: number
  /** Only package-created pages have a binding. A slug collision stays somebody else's page. */
  owned: boolean
}
export interface StarterContentPlan { revision: string; items: StarterContentItem[] }

const keyPattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
const slugPattern = /^[a-z0-9][a-z0-9-]{0,99}$/
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')

/** A portable pack cannot refer to local synced pattern IDs or smuggle arbitrary page fields. */
function validateInputs(input: readonly StarterContent[], bindings: readonly StarterContentBinding[]) {
  if (!Array.isArray(input) || input.length > 10 || !Array.isArray(bindings) || bindings.length > 100) throw new EditorError('فهرست صفحه‌های اولیه معتبر نیست.', 422)
  const keys = new Set<string>(), slugs = new Set<string>(), boundKeys = new Set<string>(), boundIds = new Set<number>()
  for (const item of input) {
    if (!item || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).some(key => !['key', 'slug', 'title', 'document'].includes(key)) || typeof item.key !== 'string' || item.key.length < 2 || item.key.length > 50 || !keyPattern.test(item.key) || keys.has(item.key) || typeof item.slug !== 'string' || !slugPattern.test(item.slug) || slugs.has(item.slug) || typeof item.title !== 'string' || !item.title.trim() || item.title.length > 160 || !item.document || typeof item.document !== 'object' || Array.isArray(item.document)) throw new EditorError('صفحهٔ اولیه معتبر نیست.', 422)
    keys.add(item.key); slugs.add(item.slug)
  }
  for (const binding of bindings) {
    if (!binding || typeof binding !== 'object' || Object.keys(binding).some(key => !['key', 'pageId'].includes(key)) || typeof binding.key !== 'string' || binding.key.length < 2 || binding.key.length > 50 || !keyPattern.test(binding.key) || boundKeys.has(binding.key) || !Number.isSafeInteger(binding.pageId) || binding.pageId < 1 || boundIds.has(binding.pageId)) throw new EditorError('رسید صفحه‌های اولیه معتبر نیست.', 422)
    boundKeys.add(binding.key); boundIds.add(binding.pageId)
  }
}

async function currentActor(req: NextRequest, tx: Prisma.TransactionClient): Promise<EditorActor> {
  const actor = await requirePerm(req, 'cms.pages', tx)
  if (!actor) throw new EditorError('دسترسی مدیریت صفحه‌ها لازم است.', 403, 'FORBIDDEN')
  return { id: actor.id, email: actor.email, roleId: actor.roleId ?? null, permissions: actor.permissions }
}

async function buildPlan(req: NextRequest, input: readonly StarterContent[], bindings: readonly StarterContentBinding[], tx: Prisma.TransactionClient, plannedModules?: ReadonlySet<string>) {
  validateInputs(input, bindings)
  const actor = await currentActor(req, tx)
  const byKey = new Map(bindings.map(binding => [binding.key, binding.pageId]))
  const items: StarterContentItem[] = []
  const prepared = new Map<string, Awaited<ReturnType<typeof prepareDocument>>>()
  const snapshots: unknown[] = []
  for (const item of input) {
    const checked = await prepareDocument(item.document, actor, tx, plannedModules)
    if (!checked.checked.document.blocks.length || checked.checked.unsupported.length || syncedPatternIds(checked.checked.document.blocks).length || Buffer.byteLength(JSON.stringify(checked.checked.document), 'utf8') > 200_000) throw new EditorError('سند صفحهٔ اولیه باید بلوک‌های معتبر و فعال داشته باشد و به الگوی محلی وابسته نباشد.', 422, 'STARTER_DOCUMENT_INVALID')
    await validateDocumentRelations(tx, 'pages', { contentDocument: '' }, checked.checked.document, actor, checked.registry)
    prepared.set(item.key, checked)
    const priorId = byKey.get(item.key)
    const page = priorId ? await tx.page.findUnique({ where: { id: priorId } }) : await tx.page.findUnique({ where: { slug: item.slug } })
    const action = priorId ? page ? 'preserve' : 'removed' : page ? 'preserve' : 'create'
    items.push({ key: item.key, slug: item.slug, title: item.title, action, ...(page ? { pageId: page.id } : priorId ? { pageId: priorId } : {}), owned: !!priorId })
    // Hash actual identity and version, without returning existing customer content to the client.
    snapshots.push({ key: item.key, requestedSlug: item.slug, priorId: priorId ?? null, page: page ? { id: page.id, slug: page.slug, updatedAt: page.updatedAt.toISOString(), status: page.status } : null, document: checked.checked.document })
  }
  return { plan: { revision: digest({ snapshots, plannedModules: [...(plannedModules || [])].sort() }), items }, actor, prepared }
}

/** Read-only plan; a missing or renamed bound page never causes customer data to be overwritten. */
export async function planStarterContent(req: NextRequest, input: readonly StarterContent[], bindings: readonly StarterContentBinding[], tx: Prisma.TransactionClient, plannedModules?: ReadonlySet<string>): Promise<StarterContentPlan> {
  return (await buildPlan(req, input, bindings, tx, plannedModules)).plan
}

/** Save canonical documents, layout, revision and strict audit in the caller's transaction. */
export async function applyStarterContent(req: NextRequest, input: readonly StarterContent[], bindings: readonly StarterContentBinding[], tx: Prisma.TransactionClient): Promise<StarterContentPlan> {
  const { plan, actor, prepared } = await buildPlan(req, input, bindings, tx)
  const items: StarterContentItem[] = []
  for (const item of plan.items) {
    if (item.action !== 'create') { items.push(item); continue }
    const content = prepared.get(item.key)!
    const row = await createPage({}, { slug: item.slug, title: item.title.trim(), status: 'DRAFT', showInNav: false, editorFormat: 'blocks-v1', contentDocument: JSON.stringify(content.checked.document), content: content.html }, actor, async (client) => {
      const current = await requirePerm(req, 'cms.pages', client)
      if (!current || current.id !== actor.id) throw new EditorError('دسترسی مدیریت صفحه‌ها تغییر کرده است.', 403, 'FORBIDDEN')
      await auditAdminStrict({ req, actor: current, action: 'cms.create', targetType: 'pages', targetId: item.slug, metadata: { starterKey: item.key, status: 'DRAFT' } }, client)
    }, tx)
    items.push({ ...item, pageId: row.id, owned: true })
  }
  return { revision: plan.revision, items }
}
