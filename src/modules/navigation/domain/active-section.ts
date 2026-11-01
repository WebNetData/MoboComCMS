/** Pick one active section entry, including its query facets. Unrelated search/paging parameters are allowed. */
export function activeSectionItem(items: readonly { key: string; href: string }[], pathname: string, search: string): string | null {
  const current = new URLSearchParams(search)
  let active: string | null = null, best = -1
  for (const item of items) {
    if (!item.href.startsWith('/') || item.href.startsWith('//')) continue
    try {
      const target = new URL(item.href, 'https://navigation.invalid'), path = decodeURIComponent(target.pathname)
      if (target.origin !== 'https://navigation.invalid') continue
      const here = decodeURIComponent(pathname)
      if (here !== path && (path === '/' || !here.startsWith(path.replace(/\/$/, '') + '/'))) continue
      if ([...target.searchParams].some(([key, value]) => !current.getAll(key).includes(value))) continue
      const score = path.length + target.searchParams.size * 10000
      if (score > best) { active = item.key; best = score }
    } catch { /* A malformed configured address is never selected. */ }
  }
  return active
}
