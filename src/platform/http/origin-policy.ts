/**
 * Where a state-changing API request may come from.
 *
 * A browser says where a request was made: `Origin` on every write, and
 * `Sec-Fetch-Site`, which a page cannot set or remove. A forged request from
 * another site therefore either names that site or, in the rare case that the
 * browser sends neither header, cannot be told from a same-site one. So:
 *
 *  - `Origin` present: it must be this site. `Origin: null` (a sandboxed frame,
 *    a redirect across sites) is not this site.
 *  - no `Origin`, `Sec-Fetch-Site` present: only `same-origin` passes.
 *  - neither: an old browser still sends `Referer`; a same-site one passes.
 *  - nothing at all: the request is not from a current browser. It passes only
 *    when it carries no cookies, because a request without cookies cannot act
 *    as somebody who is signed in here: scripts, callbacks and API-key clients
 *    keep working, and a session cookie alone is never enough to write.
 */
export type OriginVerdict = 'allow' | 'foreign-origin' | 'origin-required'

export interface MutationSource {
  origin: string | null
  secFetchSite: string | null
  referer: string | null
  hasCookies: boolean
  /** The hosts this site answers on: the request's own Host, and the configured public address. */
  hosts: Array<string | null | undefined>
}

const hostOf = (value: string): string | null => {
  try { return new URL(value).host || null } catch { return null }
}

export function mutationOrigin(source: MutationSource): OriginVerdict {
  const ours = new Set(source.hosts.filter((host): host is string => Boolean(host)).map((host) => host.toLowerCase()))
  const isOurs = (value: string) => { const host = hostOf(value); return Boolean(host && ours.has(host.toLowerCase())) }
  const origin = source.origin?.trim()
  if (origin) return isOurs(origin) ? 'allow' : 'foreign-origin'
  const site = source.secFetchSite?.trim().toLowerCase()
  if (site) return site === 'same-origin' ? 'allow' : 'foreign-origin'
  const referer = source.referer?.trim()
  if (referer) return isOurs(referer) ? 'allow' : 'foreign-origin'
  return source.hasCookies ? 'origin-required' : 'allow'
}

/**
 * A route's own second look at `Origin` (uploads): is it one of the hosts this site answers on? The request's
 * `Host` header and the configured public address are compared — never the address Next rebuilt for the request,
 * which is the bind address (0.0.0.0, an internal name) behind a proxy or in a container and matches no browser.
 * No `Origin` at all is left to the middleware's policy above.
 */
export function originIsThisSite(origin: string | null, host: string | null, publicUrl: string | undefined = process.env.NEXTAUTH_URL): boolean {
  if (!origin) return true
  const configured = publicUrl ? hostOf(publicUrl) : null
  return mutationOrigin({ origin, secFetchSite: null, referer: null, hasCookies: true, hosts: [host, configured] }) === 'allow'
}
