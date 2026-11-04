import { presentContentPath, matchPermalink, getPermalinks, permalinkPath, type PermalinkType } from '@/shared/routing/permalinks'
/**
 * Section path aliases: every public section keeps its internal route
 * (/games, /forum …) while the site owner can publish it under another
 * address (/game, /discourse …). The middleware rewrites the public address
 * to the internal route and redirects old addresses; links rendered by the
 * app go straight to the public address through toPublicPath().
 *
 * Isomorphic and dependency-free: the current map is process-global on the
 * server (loaded by the root layout and the middleware) and page-global in
 * the browser (set by RouteAliasProvider before any link renders).
 */

export type RouteAliases = Record<string, string> // internal base → public base, e.g. { '/games': '/game' }

// Kept on globalThis so the middleware bundle and the app bundles of one
// server process (and every chunk in the browser) share a single table.
const store = globalThis as unknown as { __mcRouteAliases?: RouteAliases }

export function setRouteAliases(map: RouteAliases) {
  store.__mcRouteAliases = map
}

export function getRouteAliases(): RouteAliases {
  return store.__mcRouteAliases || {}
}

import { RESERVED_SEGMENTS } from '@/shared/routing/reserved'
export { RESERVED_SEGMENTS } from '@/shared/routing/reserved'

const SEGMENT = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/

function baseOf(path: string, base: string): string | null {
  if (path === base) return ''
  if (path.startsWith(`${base}/`) || path.startsWith(`${base}?`) || path.startsWith(`${base}#`)) return path.slice(base.length)
  return null
}

/** "/games/elden?x=1" → "/game/elden?x=1" when /games is published as /game. Other paths are returned as is. */
export function toPublicPath(path: string, map: RouteAliases = getRouteAliases()): string {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) return path
  return presentContentPath(path, getPermalinks(), map)
}

/** Inverse of toPublicPath: "/game/elden" → "/games/elden". */
export function toInternalPath(path: string, map: RouteAliases = getRouteAliases()): string {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) return path
  const matched = matchPermalink(path, getPermalinks(), map)
  const cut = path.search(/[?#]/), suffix = cut < 0 ? '' : path.slice(cut)
  if (matched) return matched.internal + suffix
  for (const [internal, alias] of Object.entries(map)) {
    const rest = baseOf(path, alias)
    if (rest !== null) return internal + rest
  }
  return path
}

export function contentPath(kind: PermalinkType, slug: string, values: { artist?: string } = {}) { return permalinkPath(kind, slug, values, getPermalinks(), getRouteAliases()) }

export type AliasCheck = { ok: true; aliases: RouteAliases } | { ok: false; error: string }

/**
 * Validates an admin's alias table against the routable bases. An empty or
 * identical alias removes the entry. Aliases must be one lowercase latin
 * segment, not reserved, not another section's internal base and unique.
 */
export function validateAliases(input: unknown, bases: readonly string[], extraReserved: readonly string[] = []): AliasCheck {
  const raw = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {}
  const reserved = new Set([...RESERVED_SEGMENTS, ...extraReserved.map((s) => s.replace(/^\//, ''))])
  const out: RouteAliases = {}
  const used = new Map<string, string>()
  for (const base of bases) {
    const value = String(raw[base] ?? '').trim().toLowerCase().replace(/^\/+|\/+$/g, '')
    if (!value || `/${value}` === base) continue
    if (!SEGMENT.test(value)) return { ok: false, error: `مسیر «${value}» نامعتبر است؛ فقط حروف کوچک انگلیسی، عدد و خط تیره (۱ تا ۴۰ نویسه)` }
    if (reserved.has(value)) return { ok: false, error: `مسیر «/${value}» رزرو شده است و نمی‌تواند برای یک بخش استفاده شود` }
    if (bases.includes(`/${value}`)) return { ok: false, error: `مسیر «/${value}» مسیر اصلی بخش دیگری است` }
    if (used.has(value)) return { ok: false, error: `مسیر «/${value}» هم برای ${used.get(value)} و هم برای ${base} انتخاب شده است` }
    used.set(value, base)
    out[base] = `/${value}`
  }
  return { ok: true, aliases: out }
}

/** Where the middleware sends a request: rewrite a public alias, redirect an old internal address, or nothing. */
export function routeDecision(pathname: string, map: RouteAliases): { kind: 'rewrite' | 'redirect'; path: string } | null {
  for (const [internal, alias] of Object.entries(map)) {
    const viaAlias = baseOf(pathname, alias)
    if (viaAlias !== null) return { kind: 'rewrite', path: `${internal}${viaAlias}` }
    const viaInternal = baseOf(pathname, internal)
    if (viaInternal !== null) return { kind: 'redirect', path: `${alias}${viaInternal}` }
  }
  return null
}
