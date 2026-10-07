/**
 * Storing and reading block documents. A page is the first kind of item that can be written in
 * blocks; its HTML column then holds a copy generated from the document, so search, feeds and
 * anything else that only knows HTML keep working. The document is the source; the copy never is.
 */
import { db } from '@/platform/database/prisma'
import { logEvent } from '@/platform/observability/logger'
import { readJsonSetting, writeJsonSetting } from '@/modules/settings/server'
import { hasPermission } from '@/modules/identity/rbac'
import { recordRevision } from '@/modules/content/server/revisions'
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

/** Off until an administrator turns it on. Pages already written in blocks keep rendering either way. */
export async function blockEditorEnabled(): Promise<boolean> {
  return (await readJsonSetting(SETTING).catch(() => undefined))?.enabled === true
}

export async function setBlockEditorEnabled(enabled: boolean) {
  await writeJsonSetting(SETTING, { enabled: enabled === true })
  return { enabled: enabled === true }
}

// ------------------------------------------------------------------ pages

export interface EditorActor { id: number; email: string; roleId: number | null; permissions: string[] | null }

/** Staff without a role have full access (the platform rule); otherwise the role's permissions decide. */
const may = (actor: EditorActor) => (permission: string) => (actor.permissions === null || actor.permissions.length === 0 ? actor.roleId == null : hasPermission(actor.permissions, permission))

const stamp = (date: Date) => date.toISOString()

export interface LoadedDocument {
  id: number; slug: string; title: string; status: string
  editorFormat: string
  /** The version to save against: a save names the one it was opened at. */
  updatedAt: string
  document: MoboComDocument
  unsupported: UnsupportedBlock[]
  issues: DocumentIssue[]
  /** The page's HTML when it is still written the old way: shown to the editor, never converted silently. */
  legacyHtml: string
}

export async function loadPageDocument(id: number): Promise<LoadedDocument> {
  const page = await db.page.findUnique({ where: { id } })
  if (!page) throw new EditorError('page not found', 404, 'NOT_FOUND')
  const blocks = page.editorFormat === 'blocks-v1'
  const read = blocks ? readDocument(page.contentDocument, editorRegistry()) : { document: { version: DOCUMENT_VERSION, blocks: [] }, unsupported: [], issues: [] }
  return { id: page.id, slug: page.slug, title: page.title, status: page.status, editorFormat: page.editorFormat, updatedAt: stamp(page.updatedAt), document: read.document, unsupported: read.unsupported, issues: read.issues, legacyHtml: blocks ? '' : page.content }
}

/**
 * Saves a page's document. The document is checked here, whatever the editor did; the save names
 * the version the page was opened at and is refused when the page changed since (somebody else
 * saved it), so one editor never silently overwrites another.
 */
export async function savePageDocument(input: { id: number; document: unknown; expectedUpdatedAt: unknown; actor: EditorActor }) {
  if (!await blockEditorEnabled()) throw new EditorError('the block editor is switched off', 404, 'EDITOR_OFF')
  const expected = typeof input.expectedUpdatedAt === 'string' ? new Date(input.expectedUpdatedAt) : null
  if (!expected || Number.isNaN(expected.getTime())) throw new EditorError('the save does not say which version of the page it was made from', 400, 'VERSION_REQUIRED')
  const before = await db.page.findUnique({ where: { id: input.id } })
  if (!before) throw new EditorError('page not found', 404, 'NOT_FOUND')
  const checked = checkDocument(input.document, editorRegistry(), { permissions: may(input.actor) })
  if (!checked.ok) throw new EditorError('the document has errors and was not saved', 422, 'DOCUMENT_INVALID', { issues: checked.issues.filter((issue) => issue.level === 'error').slice(0, 50) })
  const html = documentHtml(checked.document, editorRegistry())
  // Claimed on the version it was opened at: updatedAt moves with every write of the row.
  const claimed = await db.page.updateMany({ where: { id: input.id, updatedAt: expected }, data: { editorFormat: 'blocks-v1', contentDocument: JSON.stringify(checked.document), content: html } })
  if (claimed.count !== 1) {
    const now = await db.page.findUnique({ where: { id: input.id }, select: { updatedAt: true } })
    throw new EditorError('the page was changed after this editor opened it', 409, 'CHANGED', { updatedAt: now ? stamp(now.updatedAt) : null })
  }
  const after = await db.page.findUniqueOrThrow({ where: { id: input.id } })
  await recordRevision({ entityType: 'pages', entityId: after.id, before, after, actor: { id: input.actor.id, email: input.actor.email } })
  logEvent('info', 'editor.page_saved', { pageId: after.id, actorId: input.actor.id, blocks: documentFacts(checked.document, editorRegistry()).blocks.length, unsupported: checked.unsupported.length, migrated: checked.migrated })
  return { updatedAt: stamp(after.updatedAt), unsupported: checked.unsupported, warnings: checked.issues.filter((issue) => issue.level === 'warning').slice(0, 50), migrated: checked.migrated }
}

/** The HTML of a page written in blocks, for the public page; null when the page is not written in blocks. */
export function pageBlocksHtml(page: { id: number; editorFormat: string; contentDocument: string }): string | null {
  if (page.editorFormat !== 'blocks-v1') return null
  const read = readDocument(page.contentDocument, editorRegistry())
  if (!read.ok) logEvent('warn', 'editor.page_document_unreadable', { pageId: page.id, issues: read.issues.slice(0, 5) })
  return documentHtml(read.document, editorRegistry())
}
