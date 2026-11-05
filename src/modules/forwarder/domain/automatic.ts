import { normalizeTarget } from './forwarder'

/** Safe public projection only; no ad code or private configuration leaves the server. */
export type AutomaticForwarderPolicy = { enabled: boolean; siteHost: string }

export function automaticLinksAllowed(pathname: string): boolean {
  return !['/admin', '/forwarder', '/builder-preview'].some(path => pathname === path || pathname.startsWith(`${path}/`))
}

/** Original anchors remain canonical. Only absolute/protocol-relative public web destinations are wrapped. */
export function automaticForwardHref(href: string, origin: string, policy: AutomaticForwarderPolicy): string {
  if (!policy.enabled || !/^(https?:\/\/|\/\/)/i.test(href.trim())) return href
  let url: URL
  try { url = new URL(href, origin) } catch { return href }
  const ours = new URL(origin).hostname.toLowerCase().replace(/\.$/, '')
  const host = url.hostname.toLowerCase().replace(/\.$/, '')
  if (host === ours || host === policy.siteHost.toLowerCase().replace(/\.$/, '')) return href
  const target = normalizeTarget(url.href)
  if (!target.ok) return href
  return `/forwarder?auto=1&url=${encodeURIComponent(target.url)}`
}
