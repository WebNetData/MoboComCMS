/** Journal URLs keep an explicit first archive page separate from the editorial homepage. */
export function journalBrowseUrl({ category = '', query = '', page = 1, archive = false }: { category?: string; query?: string; page?: number; archive?: boolean } = {}) {
  const params = new URLSearchParams()
  if (category) params.set('category', category)
  if (query) params.set('q', query)
  if (page > 1 || (archive && !category && !query)) params.set('page', String(page))
  return `/blog${params.size ? '?' + params.toString() : ''}`
}

export function journalPagination(total: number, pageSize: number, requested: unknown) {
  const pages = Math.max(1, Math.ceil(total / pageSize)), value = Number(requested)
  const page = Math.min(pages, Math.max(1, Number.isSafeInteger(value) ? value : 1))
  return { page, pages, skip: (page - 1) * pageSize, first: total ? (page - 1) * pageSize + 1 : 0, last: Math.min(page * pageSize, total) }
}

/** Bounded navigation even for a large archive; first/last and current neighbours remain reachable. */
export function journalPageNumbers(page: number, pages: number): (number | 'gap-before' | 'gap-after')[] {
  const selected = new Set([1, pages, page - 1, page, page + 1])
  if (page <= 3) for (let n = 1; n <= Math.min(5, pages); n++) selected.add(n)
  if (page >= pages - 2) for (let n = Math.max(1, pages - 4); n <= pages; n++) selected.add(n)
  const numbers = [...selected].filter(n => n >= 1 && n <= pages).sort((a, b) => a - b), result: (number | 'gap-before' | 'gap-after')[] = []
  for (const [index, n] of numbers.entries()) {
    const previous = numbers[index - 1]
    if (previous && n - previous === 2) result.push(previous + 1)
    else if (previous && n - previous > 2) result.push(n <= page ? 'gap-before' : 'gap-after')
    result.push(n)
  }
  return result
}
