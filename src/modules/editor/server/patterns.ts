import type { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { auditAdminStrict } from '@/platform/audit/server'
import { err, ok } from '@/platform/http/response'
import { originIsThisSite } from '@/platform/http/origin-policy'
import { JsonBodyError, readJsonObject } from '@/platform/http/read-json'
import { requireContentScope, requirePerm } from '@/modules/identity/server/access'
import { hasPermission } from '@/modules/identity/rbac'
import { checkDocument } from '@/modules/editor/domain/validate'
import { moduleBlocks, MODULE_BLOCK_LIMIT, syncedPatternIds } from '@/modules/editor/domain/module-blocks'
import type { Prisma } from '@prisma/client'
import { recordRevision, RevisionError, type RestoreCommit } from '@/modules/content/server/revisions'
import { restoreValues, type Snapshot } from '@/modules/content/domain/revisions'
import { activeEditorRegistry } from './blocks/registry'
import { blockEditorEnabled, documentAuthorPermission, documentPermission, isDocumentEntity } from './documents'

const KINDS = ['pattern', 'template', 'synced'] as const
/** History type of a section's patterns: their versions live with the other content revisions. */
export const patternHistoryType = (entity: string) => `patterns-${entity}`
const revisionActor = (admin: { id: number; email: string }) => ({ id: admin.id, email: admin.email })
const purgePublished = () => void import('@/modules/performance/server/pagecache').then(cache => cache.purgeSoon('editor-pattern')).catch(() => undefined)

/** The History page's owner for one section's patterns: the current row, and putting an earlier version back. */
export function patternHistoryOwner(entity: 'pages' | 'posts') {
  return {
    current: (id: number) => db.editorPattern.findFirst({ where: { id, entity } }),
    async restore(id: number, snapshot: Snapshot, commit: RestoreCommit) {
      const result = await db.$transaction(async tx => {
        const before = await tx.editorPattern.findFirst({ where: { id, entity } })
        if (!before) throw new RevisionError('الگو پیدا نشد', 404)
        // Name and blocks come back; the section and the kind of a pattern never change by a restore.
        const values = restoreValues(snapshot, before)
        const title = typeof values.title === 'string' && values.title.trim() ? values.title.trim().slice(0, 100) : before.title
        const contentDocument = typeof values.contentDocument === 'string' ? values.contentDocument : before.contentDocument
        let blocks: unknown
        try { blocks = JSON.parse(contentDocument)?.blocks } catch { blocks = null }
        if (!Array.isArray(blocks) || !blocks.length || Buffer.byteLength(contentDocument) > 200_000) throw new RevisionError('نسخهٔ الگو معتبر نیست؛ چیزی تغییر نکرد', 422)
        if (before.kind === 'synced' && syncedPatternIds(blocks).length) throw new RevisionError('الگوی همگام نمی‌تواند الگوی همگام دیگری داشته باشد.', 422)
        const after = await tx.editorPattern.update({ where: { id }, data: { title, contentDocument, updatedAt: new Date(Math.max(Date.now(), before.updatedAt.getTime() + 1)) } })
        await commit(tx, before, after)
        return { before, after }
      }, { isolationLevel: 'Serializable' })
      if (result.after.kind === 'synced') purgePublished()
      return result
    },
  }
}

/** How many stored documents (pages, articles, other patterns) still point at this synced pattern. Bounded scan. */
async function syncedPatternUses(tx: Prisma.TransactionClient, id: number): Promise<number> {
  const marker = { contains: '"content.pattern"' }
  const [pages, posts, patterns] = await Promise.all([
    tx.page.findMany({ where: { contentDocument: marker }, select: { contentDocument: true }, take: 5000 }),
    tx.post.findMany({ where: { contentDocument: marker }, select: { contentDocument: true }, take: 5000 }),
    tx.editorPattern.findMany({ where: { contentDocument: marker, NOT: { id } }, select: { contentDocument: true }, take: 500 }),
  ])
  return [...pages, ...posts, ...patterns].filter(row => { try { return syncedPatternIds(JSON.parse(row.contentDocument)?.blocks).includes(id) } catch { return false } }).length
}

/** Patterns and full templates share the editor's canonical document and section permission. */
export async function editorPatterns(req: NextRequest) {
  const entity = req.nextUrl.searchParams.get('entity')
  if (!isDocumentEntity(entity)) return err('not found', 404)
  const permission = documentPermission(entity)
  const scope = await requireContentScope(req, permission, documentAuthorPermission(entity))
  if (!scope) return err('forbidden', 403)
  if (!await blockEditorEnabled()) return err('ویرایشگر غیرفعال است', 404)
  if (req.method === 'GET') {
    const rows = await db.editorPattern.findMany({ where: { entity, ...(entity === 'posts' ? { kind: { not: 'template' } } : {}) }, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], take: 100, select: { id: true, title: true, kind: true, contentDocument: true, updatedAt: true } })
    const response = ok({ patterns: rows.map(({ contentDocument, ...row }) => ({ ...row, document: JSON.parse(contentDocument) })) })
    response.headers.set('Cache-Control', 'private, no-store'); return response
  }
  if (!req.headers.get('origin') || !originIsThisSite(req.headers.get('origin'), req.headers.get('host') || req.nextUrl.host)) return err('forbidden', 403)
  const admin = await requirePerm(req, permission)
  if (!admin) return err('فقط مدیر همین بخش الگوها را مدیریت می‌کند.', 403)
  try {
    const body = await readJsonObject(req, 210_000)
    if (req.method === 'POST') {
      const title = typeof body.title === 'string' ? body.title.trim() : '', kind = KINDS.find(value => value === body.kind)
      if (!title || title.length > 100 || !kind) return err('نام و نوع الگو معتبر نیست.', 422)
      if (entity === 'posts' && kind === 'template') return err('قالب نوشته بازنشسته شده است؛ از بلوک‌های زیباسازی و استایل صفحه استفاده کنید', 410)
      const registry = await activeEditorRegistry(), checked = checkDocument(body.document, registry, { permissions: key => admin.roleId == null || hasPermission(admin.permissions ?? [], key) })
      if (!checked.ok || !checked.document.blocks.length || checked.unsupported.length || moduleBlocks(checked.document, registry).length > MODULE_BLOCK_LIMIT) return err('الگو باید شامل بلوک‌های معتبر و فعال باشد.', 422)
      if (kind === 'synced' && syncedPatternIds(checked.document.blocks).length) return err('الگوی همگام نمی‌تواند الگوی همگام دیگری داشته باشد.', 422)
      const contentDocument = JSON.stringify(checked.document)
      if (Buffer.byteLength(contentDocument) > 200_000) return err('الگو بیش از حد بزرگ است.', 413)
      const created = await db.$transaction(async tx => {
        if (!await requirePerm(req, permission, tx)) throw new JsonBodyError('forbidden', 403)
        if (await tx.editorPattern.count({ where: { entity } }) >= 100) throw new JsonBodyError('حداکثر ۱۰۰ الگو برای هر بخش؛ ابتدا الگوهای اضافی را حذف کنید.', 422)
        const row = await tx.editorPattern.create({ data: { entity, kind, title, contentDocument, createdById: admin.id } })
        await recordRevision({ entityType: patternHistoryType(entity), entityId: row.id, before: null, after: row, actor: revisionActor(admin), client: tx, strict: true })
        await auditAdminStrict({ req, actor: admin, action: 'editor.pattern.create', targetType: 'EditorPattern', targetId: row.id, metadata: { entity, kind } }, tx)
        return row
      }, { isolationLevel: 'Serializable' })
      return ok({ id: created.id, updatedAt: created.updatedAt }, 201)
    }
    const id = Number(body.id), updatedAt = typeof body.updatedAt === 'string' ? new Date(body.updatedAt) : null
    if (!Number.isSafeInteger(id) || id <= 0 || !updatedAt || !Number.isFinite(+updatedAt)) return err('نسخهٔ الگو الزامی است.', 400)
    if (req.method === 'PATCH') {
      // Edit in place: a new name and/or new blocks, claimed on the version the editor opened. Synced uses update live.
      const title = body.title === undefined ? undefined : typeof body.title === 'string' ? body.title.trim() : ''
      if (title !== undefined && (!title || title.length > 100)) return err('نام الگو معتبر نیست.', 422)
      let contentDocument: string | undefined
      const current = await db.editorPattern.findFirst({ where: { id, entity }, select: { kind: true } })
      if (!current) return err('الگو پیدا نشد.', 404)
      if (body.document !== undefined) {
        const registry = await activeEditorRegistry(), checked = checkDocument(body.document, registry, { permissions: key => admin.roleId == null || hasPermission(admin.permissions ?? [], key) })
        if (!checked.ok || !checked.document.blocks.length || checked.unsupported.length || moduleBlocks(checked.document, registry).length > MODULE_BLOCK_LIMIT) return err('الگو باید شامل بلوک‌های معتبر و فعال باشد.', 422)
        if (current.kind === 'synced' && syncedPatternIds(checked.document.blocks).length) return err('الگوی همگام نمی‌تواند الگوی همگام دیگری داشته باشد.', 422)
        contentDocument = JSON.stringify(checked.document)
        if (Buffer.byteLength(contentDocument) > 200_000) return err('الگو بیش از حد بزرگ است.', 413)
      }
      if (title === undefined && contentDocument === undefined) return err('تغییری فرستاده نشد.', 422)
      const updated = await db.$transaction(async tx => {
        if (!await requirePerm(req, permission, tx)) throw new JsonBodyError('forbidden', 403)
        const prior = await tx.editorPattern.findFirst({ where: { id, entity } })
        const claimed = await tx.editorPattern.updateMany({ where: { id, entity, updatedAt }, data: { ...(title !== undefined ? { title } : {}), ...(contentDocument !== undefined ? { contentDocument } : {}), updatedAt: new Date(Math.max(Date.now(), updatedAt.getTime() + 1)) } })
        if (claimed.count !== 1) throw new JsonBodyError('الگو تغییر کرده یا حذف شده است؛ دوباره بارگذاری کنید.', 409)
        const row = (await tx.editorPattern.findUnique({ where: { id } }))!
        await recordRevision({ entityType: patternHistoryType(entity), entityId: id, before: prior, after: row, actor: revisionActor(admin), client: tx, strict: true })
        await auditAdminStrict({ req, actor: admin, action: 'editor.pattern.update', targetType: 'EditorPattern', targetId: id, metadata: { entity, kind: row.kind, title: title !== undefined, blocks: contentDocument !== undefined } }, tx)
        return row
      }, { isolationLevel: 'Serializable' })
      if (updated.kind === 'synced') purgePublished()
      return ok({ id: updated.id, updatedAt: updated.updatedAt })
    }
    if (req.method !== 'DELETE') return err('method not allowed', 405)
    await db.$transaction(async tx => {
      if (!await requirePerm(req, permission, tx)) throw new JsonBodyError('forbidden', 403)
      const row = await tx.editorPattern.findFirst({ where: { id, entity }, select: { kind: true } })
      if (row?.kind === 'synced') {
        const uses = await syncedPatternUses(tx, id)
        if (uses) throw new JsonBodyError(`این الگوی همگام در ${uses.toLocaleString('fa-IR')} صفحه، نوشته یا الگو استفاده شده است؛ ابتدا آن‌ها را جدا کنید.`, 409)
      }
      const removed = await tx.editorPattern.deleteMany({ where: { id, entity, updatedAt } })
      if (removed.count !== 1) throw new JsonBodyError('الگو تغییر کرده یا حذف شده است؛ دوباره بارگذاری کنید.', 409)
      await tx.contentRevision.deleteMany({ where: { entityType: patternHistoryType(entity), entityId: id } })
      await auditAdminStrict({ req, actor: admin, action: 'editor.pattern.delete', targetType: 'EditorPattern', targetId: id, metadata: { entity } }, tx)
    }, { isolationLevel: 'Serializable' })
    return ok({ deleted: true })
  } catch (error) {
    if (error instanceof JsonBodyError) return err(error.message, error.status)
    if ((error as { code?: string }).code === 'P2034') return err('تغییر هم‌زمان؛ دوباره تلاش کنید.', 409)
    console.error('[editor.patterns]', error); return err('الگو ذخیره نشد.', 500)
  }
}
