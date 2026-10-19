import { BlockRegistry, type BlockDefinition } from '@/modules/editor/domain/registry'

/** Only declarative metadata crosses HTTP; executable migrations and renderers stay server-owned. */
export type BlockDescriptor = Omit<BlockDefinition, 'migrate'>
export function blockDescriptors(registry: BlockRegistry): BlockDescriptor[] {
  return registry.list().map(({ migrate: _migrations, ...definition }) => definition)
}
export function registryFromDescriptors(definitions: readonly BlockDescriptor[]): BlockRegistry {
  // The loaded document is already migrated by the server. An older pasted block is preserved as
  // unsupported, never "migrated" by an invented identity function in the browser.
  const registry = new BlockRegistry({ requireMigrations: false })
  for (const definition of definitions) registry.register(definition)
  return registry
}
