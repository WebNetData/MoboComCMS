/**
 * Checking a document: the only way one gets into storage, and the first thing done to one that
 * comes out of it.
 *
 * A block whose type is not registered (its module or extension is off) or whose version is newer
 * than the one this code knows is kept exactly as it was stored and reported as unsupported. It is
 * never dropped and never read as if it were something else.
 */
import { BLOCK_ID, BLOCK_TYPE, DOCUMENT_LIMITS, DOCUMENT_VERSION, jsonCopy, type DocumentIssue, type MoboComBlock, type MoboComDocument } from '@/modules/editor/domain/document'
import { checkProps } from '@/modules/editor/domain/fields'
import type { BlockDefinition, BlockRegistry } from '@/modules/editor/domain/registry'

export interface UnsupportedBlock { id: string; type: string; version: number; reason: 'unknown-type' | 'newer-version' | 'missing-migration'; path: string }

export interface DocumentCheck {
  /** No error: the document may be stored. Warnings do not stop a save. */
  ok: boolean
  document: MoboComDocument
  issues: DocumentIssue[]
  unsupported: UnsupportedBlock[]
  /** Blocks whose props were brought up from an older version of their type. */
  migrated: number
}

/** Props of an older version of a block type, brought to the current one step by step; null when a step is missing. */
export function migrateProps(definition: BlockDefinition, version: number, props: Record<string, unknown>): Record<string, unknown> | null {
  let current = props
  for (let from = version; from < definition.version; from += 1) {
    const step = definition.migrate?.[from]
    if (!step) return null
    current = step(jsonCopy(current) as Record<string, unknown>)
  }
  return current
}

export function checkDocument(input: unknown, registry: BlockRegistry, options: { permissions?: (permission: string) => boolean } = {}): DocumentCheck {
  const issues: DocumentIssue[] = [], unsupported: UnsupportedBlock[] = []
  const error = (path: string, code: string, message: string) => { if (issues.length < 200) issues.push({ level: 'error', path, code, message }) }
  const empty: MoboComDocument = { version: DOCUMENT_VERSION, blocks: [] }
  if (!input || typeof input !== 'object' || Array.isArray(input)) { error('', 'document.shape', 'a document must be an object'); return { ok: false, document: empty, issues, unsupported, migrated: 0 } }
  const raw = input as Record<string, unknown>
  if (raw.version !== DOCUMENT_VERSION) {
    // A document of a format this code does not know is not guessed at.
    error('version', 'document.version', `document version ${String(raw.version).slice(0, 12)} is not supported (this is version ${DOCUMENT_VERSION})`)
    return { ok: false, document: empty, issues, unsupported, migrated: 0 }
  }
  if (!Array.isArray(raw.blocks)) { error('blocks', 'document.blocks', 'blocks must be a list'); return { ok: false, document: empty, issues, unsupported, migrated: 0 } }
  let size = 0
  try { size = JSON.stringify(raw).length } catch { size = Infinity }
  if (size > DOCUMENT_LIMITS.maxBytes) { error('', 'document.size', 'the document is too large'); return { ok: false, document: empty, issues, unsupported, migrated: 0 } }

  const ids = new Set<string>()
  let count = 0, migrated = 0
  const keep = (block: Record<string, unknown>, path: string, reason: UnsupportedBlock['reason']): MoboComBlock => {
    // Kept as stored. Its ids still count, so a block added later cannot take one of them.
    const copy = jsonCopy(block) as unknown as MoboComBlock
    const claim = (node: MoboComBlock) => { if (typeof node?.id === 'string') ids.add(node.id); if (Array.isArray(node?.children)) node.children.forEach(claim) }
    claim({ ...copy, id: '' })
    unsupported.push({ id: String(block.id), type: String(block.type), version: Number(block.version) || 0, reason, path })
    return copy
  }
  const walk = (list: unknown[], base: string, depth: number, parent: BlockDefinition | null): MoboComBlock[] => {
    const out: MoboComBlock[] = []
    list.forEach((item, index) => {
      const path = `${base}[${index}]`
      if (++count > DOCUMENT_LIMITS.maxBlocks) { if (count === DOCUMENT_LIMITS.maxBlocks + 1) error(path, 'document.blocks.count', `a document holds at most ${DOCUMENT_LIMITS.maxBlocks} blocks`); return }
      if (!item || typeof item !== 'object' || Array.isArray(item)) { error(path, 'block.shape', 'a block must be an object'); return }
      const block = item as Record<string, unknown>
      const id = typeof block.id === 'string' ? block.id : '', type = typeof block.type === 'string' ? block.type : ''
      if (!BLOCK_ID.test(id)) { error(`${path}.id`, 'block.id', 'a block needs an id of 4 to 40 letters, digits, - or _'); return }
      if (ids.has(id)) { error(`${path}.id`, 'block.id.duplicate', `the id "${id}" is used by more than one block`); return }
      ids.add(id)
      if (!BLOCK_TYPE.test(type)) { error(`${path}.type`, 'block.type', 'a block type is written owner.name'); return }
      const version = block.version
      if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) { error(`${path}.version`, 'block.version', 'a block needs the version of its type'); return }
      if (depth > DOCUMENT_LIMITS.maxDepth) { error(path, 'document.depth', `blocks nest at most ${DOCUMENT_LIMITS.maxDepth} deep`); return }
      const definition = registry.get(type)
      if (!definition) { out.push(keep(block, path, 'unknown-type')); return }
      if (version > definition.version) { out.push(keep(block, path, 'newer-version')); return }
      if (!registry.accepts(parent, definition)) error(path, 'block.place', parent ? `"${type}" cannot sit inside "${parent.type}"` : `"${type}" cannot sit at the top of a document`)
      if (definition.permission && options.permissions && !options.permissions(definition.permission)) error(path, 'block.permission', `adding or changing "${type}" needs the permission ${definition.permission}`)
      let props = (block.props && typeof block.props === 'object' && !Array.isArray(block.props) ? block.props : {}) as Record<string, unknown>
      if (version < definition.version) {
        const moved = migrateProps(definition, version, props)
        if (!moved) { out.push(keep(block, path, 'missing-migration')); return }
        props = moved; migrated += 1
      }
      const checked: MoboComBlock = { id, type, version: definition.version, props: checkProps(definition.fields, props, `${path}.props`, issues) }
      const children = block.children
      if (definition.children) {
        const kids = Array.isArray(children) ? children : []
        if (children !== undefined && !Array.isArray(children)) error(`${path}.children`, 'block.children', 'children must be a list')
        if (definition.children.max !== undefined && kids.length > definition.children.max) error(`${path}.children`, 'block.children.count', `"${type}" holds at most ${definition.children.max} blocks`)
        checked.children = walk(kids, `${path}.children`, depth + 1, definition)
      } else if (Array.isArray(children) && children.length) error(`${path}.children`, 'block.children', `"${type}" does not hold blocks`)
      out.push(checked)
    })
    return out
  }
  const blocks = walk(raw.blocks, 'blocks', 1, null)
  return { ok: !issues.some((issue) => issue.level === 'error'), document: { version: DOCUMENT_VERSION, blocks }, issues, unsupported, migrated }
}

/**
 * A stored document, read for showing. What cannot be read gives an empty document and the reasons;
 * a page never fails to render because one of its blocks is wrong.
 */
export function readDocument(stored: unknown, registry: BlockRegistry): DocumentCheck {
  let value = stored
  if (typeof stored === 'string') { try { value = stored.trim() ? JSON.parse(stored) : { version: DOCUMENT_VERSION, blocks: [] } } catch { value = null } }
  return checkDocument(value, registry)
}
