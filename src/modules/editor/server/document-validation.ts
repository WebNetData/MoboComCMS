import type { Prisma } from '@prisma/client'
import { hasPermission } from '@/modules/identity/rbac'
import { isModuleEnabled } from '@/extensions/server/modules'
import { walkBlocks, type MoboComDocument } from '@/modules/editor/domain/document'
import { documentHtml } from '@/modules/editor/domain/render'
import { checkDocument, readDocument } from '@/modules/editor/domain/validate'
import { moduleBlocks, MODULE_BLOCK_LIMIT, syncedPatternIds } from '@/modules/editor/domain/module-blocks'
import { lockSignature, structureViolation } from '@/modules/editor/domain/structure'
import { activeEditorRegistry } from '@/modules/editor/server/blocks/registry'
import { EditorError } from '@/modules/editor/server/errors'
import type { DocumentEntity, EditorActor } from './documents'

export const editorMay = (actor: EditorActor) => (permission: string) => actor.permissions === null || actor.permissions.length === 0 ? actor.roleId == null : hasPermission(actor.permissions, permission)

/** The same canonical validation for direct saves, submitted bodies and apply. */
export async function prepareDocument(document: unknown, actor: EditorActor) {
  if (!await isModuleEnabled('block-editor')) throw new EditorError('ویرایشگر بلوکی غیرفعال است', 404, 'EDITOR_OFF')
  const registry = await activeEditorRegistry()
  const checked = checkDocument(document, registry, { permissions: editorMay(actor) })
  if (!checked.ok) throw new EditorError('متن معتبر نیست و ذخیره نشد', 422, 'DOCUMENT_INVALID', { issues: checked.issues.filter(issue => issue.level === 'error').slice(0, 50) })
  if (moduleBlocks(checked.document, registry).length > MODULE_BLOCK_LIMIT) throw new EditorError('حداکثر ۲۰ بلوک ماژول در هر نوشته مجاز است', 422, 'BLOCK_LIMIT')
  return { checked, registry, html: documentHtml(checked.document, registry) }
}

export async function validateDocumentRelations(tx: Prisma.TransactionClient, entity: DocumentEntity, before: { contentDocument: string }, document: MoboComDocument, actor: EditorActor, registry: Awaited<ReturnType<typeof activeEditorRegistry>>, enforceLocks = !editorMay(actor)(entity === 'posts' ? 'cms.posts' : 'cms.pages')) {
  const ids = syncedPatternIds(document.blocks)
  if (ids.length && await tx.editorPattern.count({ where: { id: { in: ids }, entity, kind: 'synced' } }) !== ids.length) throw new EditorError('الگوی همگام انتخاب‌شده در این بخش پیدا نشد؛ آن را دوباره از کتابخانهٔ الگوها درج کنید', 422, 'PATTERN_MISSING')
  if (!enforceLocks) return
  const approved = new Set<string>()
  for (const pattern of await tx.editorPattern.findMany({ where: { entity }, select: { contentDocument: true }, take: 100 })) {
    const stored = readDocument(pattern.contentDocument, registry)
    if (stored.ok) walkBlocks(stored.document.blocks, block => { if (block.lock) approved.add(lockSignature(block)) })
  }
  const violation = structureViolation(readDocument(before.contentDocument, registry).document, document, approved)
  if (violation) throw new EditorError(violation, 403, 'STRUCTURE_LOCKED')
}
