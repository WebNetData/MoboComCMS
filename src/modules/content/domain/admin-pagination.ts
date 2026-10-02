export type AdminPageSize = 20 | 50 | 100 | 500 | 'all'

export function adminPageParams(params: URLSearchParams) {
  const rawSize = params.get('limit') || '20'
  if (!['20', '50', '100', '500', 'all'].includes(rawSize)) throw new Error('invalid page size')
  const size: AdminPageSize = rawSize === 'all' ? 'all' : Number(rawSize) as Exclude<AdminPageSize, 'all'>
  const page = Number(params.get('page') || 1)
  if (!Number.isSafeInteger(page) || page < 1 || page > 100_000) throw new Error('invalid page')
  const query = (params.get('q') || '').trim()
  if (query.length > 150) throw new Error('search is too long')
  return { size, page, query }
}

export function adminPageSlice(total: number, page: number, size: AdminPageSize) {
  const pages = size === 'all' ? 1 : Math.max(1, Math.ceil(total / size))
  const current = size === 'all' ? 1 : Math.min(page, pages)
  return { page: current, pages, skip: size === 'all' ? 0 : (current - 1) * size, take: size === 'all' ? undefined : size }
}
