/** Public menus never advertise private merchant entry; payment capability links keep their addresses. */
export function isMerchantEntry(href: string, publicUrl?: string) {
  let path = href.split(/[?#]/)[0].replace(/\/+$/, '')
  if (/^https?:\/\//i.test(href)) {
    try { const url = new URL(href); if (!publicUrl || url.origin !== new URL(publicUrl).origin) return false; path = url.pathname.replace(/\/+$/, '') } catch { return false }
  }
  return path === '/pay' || path === '/pay/merchant' || path.startsWith('/pay/merchant/') || path === '/dashboard/pay' || path.startsWith('/dashboard/pay/')
}
export function publicPayNavigation<T extends { href: string; children?: T[] }>(links: T[], publicUrl?: string): T[] {
  return links.filter(link => !isMerchantEntry(link.href, publicUrl)).map(link => link.children ? { ...link, children: publicPayNavigation(link.children, publicUrl) } : link)
}
