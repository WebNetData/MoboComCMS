/**
 * Redirect with a `Location` that is safe behind Docker or a reverse proxy.
 *
 * `request.url` there holds the internal address (http://0.0.0.0:3000). An
 * absolute redirect built from it sends visitors to an address they cannot
 * reach — or one the site's CSP blocks (media-src, connect-src). So a page or
 * file on this site is sent path-only and the browser resolves it against the
 * address it actually used. Only a plain string that is already an absolute
 * http(s) address (a file on another host) keeps its host.
 */
export function siteRedirect(target: URL | string, status: 301 | 302 | 303 | 307 = 303): Response {
  let location: string
  if (typeof target === 'string' && /^https?:\/\//i.test(target)) location = new URL(target).toString()
  else {
    const url = typeof target === 'string' ? new URL(target, 'http://site.invalid') : target
    location = `${url.pathname}${url.search}${url.hash}`
  }
  return new Response(null, { status, headers: { Location: location } })
}
