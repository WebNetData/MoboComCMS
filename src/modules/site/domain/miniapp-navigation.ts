/** Exact segment matching avoids selecting several tabs with similar prefixes. */
export function miniAppTab(path: string): string {
  if (/^\/miniapp\/(explore|plans)(\/|$)/.test(path)) return 'explore'
  if (/^\/miniapp\/(library|purchases)(\/|$)/.test(path)) return 'library'
  if (/^\/miniapp\/(wallet|payments)(\/|$)/.test(path)) return 'wallet'
  if (path === '/miniapp' || path === '/miniapp/') return 'home'
  return 'account'
}

/** Safe parent, including a direct launch: Back never exits into an unrelated browser history. */
export function miniAppParent(path: string): string {
  if (/^\/miniapp\/orders\/[^/]+\/?$/.test(path)) return '/miniapp/orders'
  if (/^\/miniapp\/support\/[^/]+\/?$/.test(path)) return '/miniapp/support'
  return '/miniapp'
}

const NATIVE: [RegExp, string][] = [
  [/^\/plans(?=[/?#]|$)/, '/miniapp/plans'],
  [/^\/dashboard\/wallet(?=[/?#]|$)/, '/miniapp/wallet'],
  [/^\/dashboard\/tickets(?=[/?#]|$)/, '/miniapp/support'],
  [/^\/dashboard\/notifications(?=[/?#]|$)/, '/miniapp/notifications'],
  [/^\/dashboard\/subscriptions(?=[/?#]|$)/, '/miniapp/subscriptions'],
  [/^\/dashboard\/orders(?=[/?#]|$)/, '/miniapp/orders'],
  [/^\/dashboard\/purchases(?=[/?#]|$)/, '/miniapp/purchases'],
  [/^\/dashboard\/library(?=[/?#]|$)/, '/miniapp/library'],
  [/^\/dashboard(?=[?#]|$)/, '/miniapp/account'],
]

export function miniAppHref(href: string): string {
  for (const [pattern, target] of NATIVE) if (pattern.test(href)) return href.replace(pattern, target)
  return href || '/miniapp'
}
