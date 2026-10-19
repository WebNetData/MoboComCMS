/**
 * Storing and reading block documents. Pages and magazine articles are written in blocks; the HTML
 * column of such an item holds a copy generated from the document, so search, feeds and anything
 * else that only knows HTML keep working. The document is the source; the copy never is.
 */
import { TRASHED } from '@/modules/content/domain/trash'
import { db } from '@/platform/database/prisma'
import type { Prisma } from '@prisma/client'
import { logEvent } from '@/platform/observability/logger'
import { isModuleEnabled } from '@/extensions/server/modules'
import { hasPermission } from '@/modules/identity/rbac'
import { recordRevision, type RestoreCommit } from '@/modules/content/server/revisions'
import { contentChanged } from '@/modules/content/server/events'
import { DOCUMENT_VERSION, walkBlocks, type DocumentIssue, type MoboComDocument } from '@/modules/editor/domain/document'
import { blockDescriptors, type BlockDescriptor } from '@/modules/editor/domain/descriptors'
import { moduleBlocks, MODULE_BLOCK_LIMIT } from '@/modules/editor/domain/module-blocks'
import { editorRegistry, activeEditorRegistry } from '@/modules/editor/server/blocks/registry'
export { restoredDocumentFields } from '@/modules/editor/server/restore'
import { documentFacts, documentHtml } from '@/modules/editor/domain/render'
import { checkDocument, readDocument, type UnsupportedBlock } from '@/modules/editor/domain/validate'
import { lockSignature, structureViolation } from '@/modules/editor/domain/structure'

export class EditorError extends Error {
  constructor(message: string, readonly status = 400, readonly code = 'EDITOR_INVALID', readonly details: Record<string, unknown> = {}) { super(message) }
}

// ------------------------------------------------------------------ the registry in use

export { registerModuleBlocks, editorRegistry, activeEditorRegistry } from '@/modules/editor/server/blocks/registry'

// ------------------------------------------------------------------ the switch

/** The block editor is a plugin (src/plugins/block-editor), switched on and off on the extensions page like any other. */
export const BLOCK_EDITOR_PLUGIN = 'block-editor'

/**
 * Whether the plugin is on. Off stops saving and brings the old editor back to the forms; what was
 * written in blocks is kept and keeps rendering either way.
 */
export async function blockEditorEnabled(): Promise<boolean> {
  return isModuleEnabled(BLOCK_EDITOR_PLUGIN)
}

// ------------------------------------------------------------------ items written in blocks

export const DOCUMENT_ENTITIES = ['pages', 'posts'] as const
export type DocumentEntity = (typeof DOCUMENT_ENTITIES)[number]
export const isDocumentEntity = (value: unknown): value is DocumentEntity => (DOCUMENT_ENTITIES as readonly unknown[]).includes(value)

interface StoredRow { id: number; slug: string; title: string; status: string; editorFormat: string; contentDocument: string; content: string; updatedAt: Date }
type Row = StoredRow & Record<string, unknown>
interface Store {
  /** The permission of the section the item belongs to: one permission per section, as everywhere. */
  permission: string
  /** The section's author permission, when the section has authors: an author writes only the items they created. */
  authorPermission?: string
  /** Whether this staff member created the item. */
  writtenBy?(id: number, userId: number): Promise<boolean>
  find(id: number, tx?: Prisma.TransactionClient): Promise<Row | null>
  /** Writes the document only when the row is still at `expected`; the number of rows written. */
  claim(id: number, expected: Date, data: { editorFormat: string; contentDocument: string; content: string; updatedAt: Date }, tx?: Prisma.TransactionClient): Promise<number>
  /** What else the site does when this kind of item changes. */
  changed?(before: Row, after: Row): void
}

const STORES: Record<DocumentEntity, Store> = {
  pages: {
    permission: 'cms.pages',
    find: (id, tx = db) => tx.page.findUnique({ where: { id } }),
    claim: (id, expected, data, tx = db) => tx.page.updateMany({ where: { id, updatedAt: expected }, data }).then((result) => result.count),
  },
  posts: {
    permission: 'cms.posts',
    authorPermission: 'journal.author',
    writtenBy: (id, userId) => db.post.count({ where: { id, authorId: userId } }).then((count) => count > 0),
    find: (id, tx = db) => tx.post.findUnique({ where: { id } }),
    claim: (id, expected, data, tx = db) => tx.post.updateMany({ where: { id, updatedAt: expected }, data }).then((result) => result.count),
    changed: (before, after) => contentChanged({ type: 'post', id: after.id }, before, after),
  },
}

export const documentPermission = (entity: DocumentEntity) => STORES[entity].permission
export const documentAuthorPermission = (entity: DocumentEntity) => STORES[entity].authorPermission ?? null
/** Whether this staff member created the item (an author opens and saves only those). */
export const documentWrittenBy = async (entity: DocumentEntity, id: number, userId: number) => (await STORES[entity].writtenBy?.(id, userId)) === true

export interface EditorActor { id: number; email: string; roleId: number | null; permissions: string[] | null }

/** Staff without a role have full access (the platform rule); otherwise the role's permissions decide. */
const may = (actor: EditorActor) => (permission: string) => (actor.permissions === null || actor.permissions.length === 0 ? actor.roleId == null : hasPermission(actor.permissions, permission))

const stamp = (date: Date) => date.toISOString()

export interface LoadedDocument {
  blockDefinitions: BlockDescriptor[]
  entity: DocumentEntity
  id: number; slug: string; title: string; status: string
  editorFormat: string
  /** The version to save against: a save names the one it was opened at. */
  updatedAt: string
  document: MoboComDocument
  unsupported: UnsupportedBlock[]
  issues: DocumentIssue[]
  /** The item's HTML when it is still written the old way: the editor turns it into blocks for the writer to look at; nothing is stored until they save. */
  legacyHtml: string
}

export async function loadDocument(entity: DocumentEntity, id: number): Promise<LoadedDocument> {
  const row = await STORES[entity].find(id)
  if (!row) throw new EditorError('not found', 404, 'NOT_FOUND')
  const blocks = row.editorFormat === 'blocks-v1'
  const registry = await activeEditorRegistry()
  const read = blocks ? readDocument(row.contentDocument, registry) : { document: { version: DOCUMENT_VERSION, blocks: [] }, unsupported: [], issues: [] }
  return { blockDefinitions: blockDescriptors(registry), entity, id: row.id, slug: row.slug, title: row.title, status: row.status, editorFormat: row.editorFormat, updatedAt: stamp(row.updatedAt), document: read.document, unsupported: read.unsupported, issues: read.issues, legacyHtml: blocks ? '' : row.content }
}

/**
 * Saves an item's document. The document is checked here, whatever the editor did; the save names
 * the version the item was opened at and is refused when it changed since (somebody else saved
 * it), so one editor never silently overwrites another.
 */
export async function saveDocument(input: { entity: DocumentEntity; id: number; document: unknown; expectedUpdatedAt: unknown; actor: EditorActor; commit?: RestoreCommit }) {
  const store = STORES[input.entity]
  if (!await blockEditorEnabled()) throw new EditorError('the block editor is switched off', 404, 'EDITOR_OFF')
  const expected = typeof input.expectedUpdatedAt === 'string' ? new Date(input.expectedUpdatedAt) : null
  if (!expected || Number.isNaN(expected.getTime())) throw new EditorError('the save does not say which version of the item it was made from', 400, 'VERSION_REQUIRED')
  const registry = await activeEditorRegistry()
  const checked = checkDocument(input.document, registry, { permissions: may(input.actor) })
  if (!checked.ok) throw new EditorError('the document has errors and was not saved', 422, 'DOCUMENT_INVALID', { issues: checked.issues.filter((issue) => issue.level === 'error').slice(0, 50) })
  if (moduleBlocks(checked.document, registry).length > MODULE_BLOCK_LIMIT) throw new EditorError('حداکثر ۲۰ بلوک ماژول در هر نوشته مجاز است', 422, 'BLOCK_LIMIT')
  const html = documentHtml(checked.document, registry)
  const { before, after } = await db.$transaction(async tx => {
    const before = await store.find(input.id, tx)
    if (!before) throw new EditorError('not found', 404, 'NOT_FOUND')
    if (before.status === TRASHED) throw new EditorError('this item is in the trash and cannot be edited until a manager decides', 409, 'IN_TRASH')
    if (!may(input.actor)(store.permission)) {
      const approved = new Set<string>()
      for (const pattern of await tx.editorPattern.findMany({ where: { entity: input.entity }, select: { contentDocument: true }, take: 100 })) {
        const stored = readDocument(pattern.contentDocument, registry)
        if (stored.ok) walkBlocks(stored.document.blocks, block => { if (block.lock) approved.add(lockSignature(block)) })
      }
      const violation = structureViolation(readDocument(before.contentDocument, registry).document, checked.document, approved)
      if (violation) throw new EditorError(violation, 403, 'STRUCTURE_LOCKED')
    }
    // Claimed on the version it was opened at: updatedAt moves with every write of the row.
    const claimed = await store.claim(input.id, expected, { editorFormat: 'blocks-v1', contentDocument: JSON.stringify(checked.document), content: html, updatedAt: new Date(Math.max(Date.now(), before.updatedAt.getTime() + 1)) }, tx)
    if (claimed !== 1) {
      const now = await store.find(input.id, tx)
      throw new EditorError('the item was changed after this editor opened it', 409, 'CHANGED', { updatedAt: now ? stamp(now.updatedAt) : null })
    }
    const after = (await store.find(input.id, tx))!
    await recordRevision({ entityType: input.entity, entityId: after.id, before, after, actor: { id: input.actor.id, email: input.actor.email }, client: tx, strict: true })
    await input.commit?.(tx, before, after)
    return { before, after }
  }, { isolationLevel: 'Serializable', timeout: 30_000 }).catch(error => {
    if (error?.code === 'P2034') throw new EditorError('محتوا هم‌زمان تغییر کرده است؛ دوباره بررسی کنید', 409, 'CHANGED')
    throw error
  })
  store.changed?.(before, after)
  logEvent('info', 'editor.document_saved', { entity: input.entity, id: after.id, actorId: input.actor.id, blocks: documentFacts(checked.document, registry).blocks.length, unsupported: checked.unsupported.length, migrated: checked.migrated })
  return { updatedAt: stamp(after.updatedAt), unsupported: checked.unsupported, warnings: checked.issues.filter((issue) => issue.level === 'warning').slice(0, 50), migrated: checked.migrated }
}

/** The HTML of an item written in blocks, for its public page; null when it is not written in blocks. */
export function blocksHtml(row: { id: number; editorFormat: string; contentDocument: string }): string | null {
  if (row.editorFormat !== 'blocks-v1') return null
  const read = readDocument(row.contentDocument, editorRegistry())
  if (!read.ok) logEvent('warn', 'editor.document_unreadable', { id: row.id, issues: read.issues.slice(0, 5) })
  return documentHtml(read.document, editorRegistry())
}

/** Public and preview rendering resolves module data now; generated storage HTML remains a plain copy. */
export async function publicBlocksHtml(row: { id: number; editorFormat: string; contentDocument: string }): Promise<string | null> {
  if (row.editorFormat !== 'blocks-v1') return null
  const registry = await activeEditorRegistry(), read = readDocument(row.contentDocument, registry)
  if (!read.ok) logEvent('warn', 'editor.document_unreadable', { id: row.id, issues: read.issues.slice(0, 5) })
  const { publicDocumentHtml } = await import('@/modules/editor/server/blocks/render')
  return publicDocumentHtml(read.document, registry)
}

// Pages, by name: the first callers of this service.
export const loadPageDocument = (id: number) => loadDocument('pages', id)
export const savePageDocument = (input: { id: number; document: unknown; expectedUpdatedAt: unknown; actor: EditorActor }) => saveDocument({ entity: 'pages', ...input })
export const pageBlocksHtml = blocksHtml
