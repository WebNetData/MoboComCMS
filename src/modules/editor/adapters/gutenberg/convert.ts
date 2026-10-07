/**
 * Between a MoboCom document and the block list Gutenberg edits.
 *
 * Gutenberg is given plain block objects (name, attributes, inner blocks) and gives such objects
 * back. Nothing it serializes is stored. This file imports nothing from WordPress: it only knows
 * the shape of those objects, so it is tested without a browser.
 *
 *  - A MoboCom type `owner.name` is the Gutenberg block `mobocom/owner-name` (camelCase as kebab).
 *  - The MoboCom id and version travel in the attributes `mcId` and `mcVersion`.
 *  - A block MoboCom does not know is carried as `mobocom/unsupported`, holding the stored block
 *    whole, and comes back out exactly as it went in.
 */
import { DOCUMENT_VERSION, jsonCopy, newBlockId, type MoboComBlock, type MoboComDocument } from '@/modules/editor/domain/document'
import { defaultProps } from '@/modules/editor/domain/fields'
import type { BlockRegistry } from '@/modules/editor/domain/registry'

export interface EngineBlock { clientId?: string; name: string; attributes: Record<string, unknown>; innerBlocks: EngineBlock[]; isValid?: boolean }

export const UNSUPPORTED_BLOCK = 'mobocom/unsupported'

/** `content.richText` -> `mobocom/content-rich-text`. */
export const engineName = (type: string) => `mobocom/${type.replace('.', '-').replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`

/** The MoboCom type of an engine block name, for the types the registry holds. */
export function typeOfEngineName(name: string, registry: BlockRegistry): string | null {
  for (const definition of registry.list()) if (engineName(definition.type) === name) return definition.type
  return null
}

export function toEngineBlocks(document: MoboComDocument, registry: BlockRegistry): EngineBlock[] {
  const convert = (block: MoboComBlock): EngineBlock => {
    const definition = registry.get(block.type)
    // Unknown, or of a version this code does not know: carried whole, never opened.
    if (!definition || block.version !== definition.version) return { name: UNSUPPORTED_BLOCK, attributes: { mcId: block.id, stored: jsonCopy(block) }, innerBlocks: [], isValid: true }
    return { name: engineName(block.type), attributes: { ...(jsonCopy(block.props) as Record<string, unknown>), mcId: block.id, mcVersion: block.version }, innerBlocks: definition.children ? (block.children || []).map(convert) : [], isValid: true }
  }
  return document.blocks.map(convert)
}

/**
 * The document for what the engine holds now. Ids are kept; a block the engine made (inserted,
 * duplicated or pasted) has no id of its own or shares one, and gets a new one. The result is not
 * yet checked: the server checks every document it is given.
 */
export function fromEngineBlocks(blocks: readonly EngineBlock[], registry: BlockRegistry, makeId: () => string = newBlockId): MoboComDocument {
  const taken = new Set<string>()
  // Ids inside carried blocks are taken first, so a new block never lands on one of them.
  const claim = (block: unknown) => { const item = block as MoboComBlock; if (typeof item?.id === 'string') taken.add(item.id); if (Array.isArray(item?.children)) item.children.forEach(claim) }
  const scan = (list: readonly EngineBlock[]) => { for (const block of list) { if (block.name === UNSUPPORTED_BLOCK) claim(block.attributes?.stored); scan(block.innerBlocks || []) } }
  scan(blocks)
  const used = new Set<string>()
  const idFor = (wanted: unknown) => {
    let id = typeof wanted === 'string' && wanted && !used.has(wanted) ? wanted : ''
    while (!id || used.has(id) || (id !== wanted && taken.has(id))) id = makeId()
    used.add(id)
    return id
  }
  const convert = (block: EngineBlock): MoboComBlock | null => {
    if (block.name === UNSUPPORTED_BLOCK) {
      const stored = jsonCopy(block.attributes?.stored) as MoboComBlock | null
      if (!stored || typeof stored.id !== 'string') return null
      // A carried block that was duplicated in the editor cannot keep the ids it holds twice; the copy is left out and the original stays.
      if (used.has(stored.id)) return null
      used.add(stored.id)
      return stored
    }
    const type = typeOfEngineName(block.name, registry)
    if (!type) return null
    const definition = registry.get(type)!
    const { mcId, mcVersion: _version, ...props } = block.attributes || {}
    const out: MoboComBlock = { id: idFor(mcId), type, version: definition.version, props: jsonCopy(props) as Record<string, unknown> }
    if (definition.children) out.children = (block.innerBlocks || []).map(convert).filter((child): child is MoboComBlock => child !== null)
    return out
  }
  return { version: DOCUMENT_VERSION, blocks: blocks.map(convert).filter((block): block is MoboComBlock => block !== null) }
}

/** The attributes a new block of a type starts with. */
export const newEngineAttributes = (type: string, registry: BlockRegistry): Record<string, unknown> => {
  const definition = registry.get(type)
  return definition ? { ...defaultProps(definition.fields), mcVersion: definition.version } : {}
}
