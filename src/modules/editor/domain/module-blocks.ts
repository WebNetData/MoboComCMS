import type { MoboComBlock, MoboComDocument } from '@/modules/editor/domain/document'
import type { BlockCategory, BlockDefinition, BlockRegistry } from '@/modules/editor/domain/registry'

export const MODULE_BLOCK_LIMIT = 20

/** Modules supply their own definition; catalogue data is never a stored block prop. */
export function publicItemsBlock(type: string, owner: string, category: BlockCategory, itemType: string, label: { fa: string; en: string }): BlockDefinition {
  return { type, owner, category, label, kind: 'dynamic', version: 1, icon: 'grid', dataSource: { kind: 'public-items', itemType }, fields: {
    title: { kind: 'string', max: 120, role: 'heading', default: label.fa },
    source: { kind: 'enum', values: ['latest', 'selected'], default: 'latest' },
    items: { kind: 'list', max: 24, item: { id: { kind: 'int', min: 1, max: 2147483647, default: 1 } } },
    limit: { kind: 'int', min: 1, max: 24, default: 6 },
    columns: { kind: 'responsive', of: { kind: 'int', min: 1, max: 6, default: 3 }, default: { desktop: 3, tablet: 2, mobile: 1 } },
    showSummary: { kind: 'boolean', default: true },
  } }
}

/** Do not inspect children of unsupported blocks. Work remains bounded even after an owner is re-enabled. */
export function moduleBlocks(document: MoboComDocument, registry: BlockRegistry): MoboComBlock[] {
  const found: MoboComBlock[] = []
  const visit = (blocks: readonly MoboComBlock[]) => {
    for (const block of blocks) {
      const definition = registry.get(block.type)
      if (!definition || block.version !== definition.version) continue
      if (definition.owner) found.push(block)
      if (found.length > MODULE_BLOCK_LIMIT) return
      if (definition.children) visit(block.children || [])
      if (found.length > MODULE_BLOCK_LIMIT) return
    }
  }
  visit(document.blocks)
  return found
}
