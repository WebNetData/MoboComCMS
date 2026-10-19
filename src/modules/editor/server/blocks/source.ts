import { ITEM_MODULE, isItemType, type ItemType } from '@/modules/content/domain/items'
import { isStoreEnabled } from '@/modules/catalog/server/storefront'
import { closedSectionPlugins } from '@/modules/site/server/maintenance'
import type { BlockDefinition } from '@/modules/editor/domain/registry'

/** This provider can only read its declared public owner; maintenance/storefront gates apply too. */
export async function publicItemSource(definition: BlockDefinition, closed?: ReadonlySet<string>): Promise<ItemType | null> {
  const type = definition.dataSource?.itemType
  if (definition.dataSource?.kind !== 'public-items' || !isItemType(type) || definition.owner !== ITEM_MODULE[type]) return null
  if ((closed || await closedSectionPlugins()).has(definition.owner)) return null
  if (type === 'product' && !await isStoreEnabled()) return null
  return type
}
