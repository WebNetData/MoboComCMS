import type { SectionMenuConfig } from './megamenu'

export type MenuSourceNode = { id: number; parentId: number | null; label: string; href: string; icon?: string; inMenu?: boolean }

/** A presentation override never changes category data or promotes a hidden parent's children. */
export function menuNodes<T extends MenuSourceNode>(nodes: T[], cfg: SectionMenuConfig): T[] {
  const hidden = new Set(nodes.filter(node => node.inMenu === false || cfg.hiddenItems.includes(`c${node.id}`) || cfg.nodeOverrides?.[`c${node.id}`]?.hidden).map(node => node.id))
  for (let previous = -1; previous !== hidden.size;) {
    previous = hidden.size
    for (const node of nodes) if (node.parentId !== null && hidden.has(node.parentId)) hidden.add(node.id)
  }
  const rank = new Map(cfg.itemOrder.map((key, index) => [key, index]))
  return nodes.filter(node => !hidden.has(node.id)).map((node, index) => {
    const override = cfg.nodeOverrides?.[`c${node.id}`]
    return { node: { ...node, ...(override?.label ? { label: override.label } : {}), ...(override?.icon !== undefined ? { icon: override.icon } : {}) }, index }
  }).sort((a, b) => (rank.get(`c${a.node.id}`) ?? 10000 + a.index) - (rank.get(`c${b.node.id}`) ?? 10000 + b.index)).map(entry => entry.node)
}
