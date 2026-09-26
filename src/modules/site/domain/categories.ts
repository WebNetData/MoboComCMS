export type CategoryNode = { id: number; parentId?: number | null; name: string; nameEn?: string; slug?: string }

export function categoryDescendants(nodes: CategoryNode[], id: number): number[] {
  const found = new Set<number>([id])
  const queue = [id]
  for (let i = 0; i < queue.length; i++) {
    for (const node of nodes) if (node.parentId === queue[i] && !found.has(node.id)) {
      found.add(node.id)
      queue.push(node.id)
    }
  }
  return [...found]
}

export function categoryOptions(nodes: CategoryNode[], locale = 'en', excluded?: number) {
  const byId = new Map(nodes.map(node => [node.id, node]))
  const blocked = new Set(excluded ? categoryDescendants(nodes, excluded) : [])
  return nodes.filter(node => !blocked.has(node.id)).map(node => {
    const path: string[] = []
    const visited = new Set<number>()
    let current: CategoryNode | undefined = node
    while (current && !visited.has(current.id)) {
      visited.add(current.id)
      path.unshift(locale === 'fa' ? current.name : current.nameEn || current.name)
      current = current.parentId ? byId.get(current.parentId) : undefined
    }
    return { value: String(node.id), label: path.join(' / ') }
  }).sort((a, b) => a.label.localeCompare(b.label, locale))
}

export function parseCategoryIds(value: unknown): number[] {
  if (!Array.isArray(value) || value.length > 100) throw new Error('حداکثر ۱۰۰ دسته‌بندی معتبر انتخاب کنید')
  const ids = value.map(id => {
    if ((typeof id !== 'string' && typeof id !== 'number') || !/^\d+$/.test(String(id))) throw new Error('دسته‌بندی معتبر نیست')
    const number = Number(id)
    if (!Number.isSafeInteger(number) || number < 1) throw new Error('دسته‌بندی معتبر نیست')
    return number
  })
  return [...new Set(ids)]
}

export function postCategories<T extends { id: number }>(post: { category?: T | null; categories?: { category: T }[] }): T[] {
  const values = [...(post.categories || []).map(item => item.category), ...(post.category ? [post.category] : [])]
  return values.filter((item, index) => values.findIndex(other => other.id === item.id) === index)
}
