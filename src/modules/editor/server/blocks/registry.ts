import { getModuleStates } from '@/extensions/server/modules'
import { createRegistry } from '@/modules/editor/domain/core-blocks'
import type { MoboComBlock } from '@/modules/editor/domain/document'
import type { BlockDefinition, BlockRegistry } from '@/modules/editor/domain/registry'
import { MODULE_BLOCKS } from '@/modules/editor/server/blocks/contributions'

export type ModuleBlockRenderer = (block: MoboComBlock, definition: BlockDefinition) => string | Promise<string>
const extra: BlockDefinition[] = []
const renderers = new Map<string, ModuleBlockRenderer>()

/** Trusted code registration only. Validate everything before changing the installed registry. */
export function registerModuleBlocks(definitions: readonly BlockDefinition[], supplied: Readonly<Record<string, ModuleBlockRenderer>> = {}) {
  createRegistry([...MODULE_BLOCKS, ...extra, ...definitions])
  for (const [type, renderer] of Object.entries(supplied)) {
    if (!definitions.some(definition => definition.type === type && definition.owner) || typeof renderer !== 'function') throw Error('a renderer must belong to a registered module block')
  }
  extra.push(...definitions)
  for (const [type, renderer] of Object.entries(supplied)) renderers.set(type, renderer)
}
export const moduleBlockRenderer = (type: string) => renderers.get(type)
/** Compatibility address for code inspecting installed definitions. Request paths use activeEditorRegistry. */
export function editorRegistry(): BlockRegistry { return createRegistry([...MODULE_BLOCKS, ...extra]) }
export async function activeEditorRegistry(): Promise<BlockRegistry> {
  const states = await getModuleStates()
  return createRegistry([...MODULE_BLOCKS, ...extra].filter(definition => !definition.owner || states[definition.owner] === true))
}
