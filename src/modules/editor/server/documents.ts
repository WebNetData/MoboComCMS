/**
 * Storing and reading block documents. Pages and magazine articles are written in blocks; the HTML
 * column of such an item holds a copy generated from the document, so search, feeds and anything
 * else that only knows HTML keep working. The document is the source; the copy never is.
 */
import { db } from '@/platform/database/prisma'
import { logEvent } from '@/platform/observability/logger'
import { readJsonSetting, writeJsonSetting } from '@/modules/settings/server'
import { hasPermission } from '@/modules/identity/rbac'
import { recordRevision } from '@/modules/content/server/revisions'
import { contentChanged } from '@/modules/content/server/events'
import { createRegistry } from '@/modules/editor/domain/core-blocks'
import { DOCUMENT_VERSION, type DocumentIssue, type MoboComDocument } from '@/modules/editor/domain/document'
import type { BlockDefinition, BlockRegistry } from '@/modules/editor/domain/registry'
import { documentFacts, documentHtml } from '@/modules/editor/domain/render'
import { checkDocument, readDocument, type UnsupportedBlock } from '@/modules/editor/domain/validate'

export class EditorError extends Error {
  constructor(message: string, readonly status = 400, readonly code = 'EDITOR_INVALID', readonly details: Record<string, unknown> = {}) { super(message) }
}

// ------------------------------------------------------------------ the registry in use

const moduleBlocks: BlockDefinition[] = []
let registry: BlockRegistry | null = null

/** A module hands in its block types once, when its own code is loaded. The editor core is not changed for them. */
export function registerModuleBlocks(definitions: readonly BlockDefinition[]) {
  moduleBlocks.push(...definitions)
  registry = null
}

export function editorRegistry(): BlockRegistry {
  return (registry ??= createRegistry(moduleBlocks))
}

// ------------------------------------------------------------------ the switch

const SETTING = 'editor.blocks'

/**
 * The block editor is the site's editor: on unless an administrator switched it off. Off stops
 * saving; items already written in blocks keep rendering either way.
 */
export async function blockEditorEnabled(): Promise<boolean> {
  return (await readJsonSetting(SETTING).catch(() => undefined))?.enabled !== false
}

export async function setBlockEditorEnabled(enabled: boolean) {
  await writeJsonSetting(SETTING, { enabled: enabled === true })
  return { enabled: enabled === true }
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
  find(id: number): Promise<Row | null>
  /** Writes the document only when the row is still at `expected`; the number of rows written. */
  claim(id: number, expected: Date, data: { editorFormat: string; contentDocument: string; content: string }): Promise<number>
  /** What else the site does when this kind of item changes. */
  changed?(before: Row, after: Row): void
}

const STORES: Record<DocumentEntity, Store> = {
  pages: {
    permission: 'cms.pages',
    find: (id) => db.page.findUnique({ where: { id } }),
    claim: (id, expected, data) => db.page.updateMany({ where: { id, updatedAt: expected }, data }).then((result) => result.count),
  },
  posts: {
    permission: 'cms.posts',
    find: (id) => db.post.findUnique({ where: { id } }),
    claim: (id, expected, data) => db.post.updateMany({ where: { id, updatedAt: expected }, data }).then((result) => result.count),
    changed: (before, after) => contentChanged({ type: 'post', id: after.id }, before, after),
  },
}

export const documentPermission = (entity: DocumentEntity) => STORES[entity].permission

export interface EditorActor { id: number; email: string; roleId: number | null; permissions: string[] | null }

/** Staff without a role have full access (the platform rule); otherwise the role's permissions decide. */
const may = (actor: EditorActor) => (permission: string) => (actor.permissions === null || actor.permissions.length === 0 ? actor.roleId == null : hasPermission(actor.permissions, permission))

const stamp = (date: Date) => date.toISOString()

export interface LoadedDocument {
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
  const read = blocks ? readDocument(row.contentDocument, editorRegistry()) : { document: { version: DOCUMENT_VERSION, blocks: [] }, unsupported: [], issues: [] }
  return { entity, id: row.id, slug: row.slug, title: row.title, status: row.status, editorFormat: row.editorFormat, updatedAt: stamp(row.updatedAt), document: read.document, unsupported: read.unsupported, issues: read.issues, legacyHtml: blocks ? '' : row.content }
}

/**
 * Saves an item's document. The document is checked here, whatever the editor did; the save names
 * the version the item was opened at and is refused when it changed since (somebody else saved
 * it), so one editor never silently overwrites another.
 */
export async function saveDocument(input: { entity: DocumentEntity; id: number; document: unknown; expectedUpdatedAt: unknown; actor: EditorActor }) {
  const store = STORES[input.entity]
  if (!await blockEditorEnabled()) throw new EditorError('the block editor is switched off', 404, 'EDITOR_OFF')
  const expected = typeof input.expectedUpdatedAt === 'string' ? new Date(input.expectedUpdatedAt) : null
  if (!expected || Number.isNaN(expected.getTime())) throw new EditorError('the save does not say which version of the item it was made from', 400, 'VERSION_REQUIRED')
  const before = await store.find(input.id)
  if (!before) throw new EditorError('not found', 404, 'NOT_FOUND')
  const checked = checkDocument(input.document, editorRegistry(), { permissions: may(input.actor) })
  if (!checked.ok) throw new EditorError('the document has errors and was not saved', 422, 'DOCUMENT_INVALID', { issues: checked.issues.filter((issue) => issue.level === 'error').slice(0, 50) })
  const html = documentHtml(checked.document, editorRegistry())
  // Claimed on the version it was opened at: updatedAt moves with every write of the row.
  const claimed = await store.claim(input.id, expected, { editorFormat: 'blocks-v1', contentDocument: JSON.stringify(checked.document), content: html })
  if (claimed !== 1) {
    const now = await store.find(input.id)
    throw new EditorError('the item was changed after this editor opened it', 409, 'CHANGED', { updatedAt: now ? stamp(now.updatedAt) : null })
  }
  const after = (await store.find(input.id))!
  await recordRevision({ entityType: input.entity, entityId: after.id, before, after, actor: { id: input.actor.id, email: input.actor.email } })
  store.changed?.(before, after)
  logEvent('info', 'editor.document_saved', { entity: input.entity, id: after.id, actorId: input.actor.id, blocks: documentFacts(checked.document, editorRegistry()).blocks.length, unsupported: checked.unsupported.length, migrated: checked.migrated })
  return { updatedAt: stamp(after.updatedAt), unsupported: checked.unsupported, warnings: checked.issues.filter((issue) => issue.level === 'warning').slice(0, 50), migrated: checked.migrated }
}

/** The HTML of an item written in blocks, for its public page; null when it is not written in blocks. */
export function blocksHtml(row: { id: number; editorFormat: string; contentDocument: string }): string | null {
  if (row.editorFormat !== 'blocks-v1') return null
  const read = readDocument(row.contentDocument, editorRegistry())
  if (!read.ok) logEvent('warn', 'editor.document_unreadable', { id: row.id, issues: read.issues.slice(0, 5) })
  return documentHtml(read.document, editorRegistry())
}

// Pages, by name: the first callers of this service.
export const loadPageDocument = (id: number) => loadDocument('pages', id)
export const savePageDocument = (input: { id: number; document: unknown; expectedUpdatedAt: unknown; actor: EditorActor }) => saveDocument({ entity: 'pages', ...input })
export const pageBlocksHtml = blocksHtml
