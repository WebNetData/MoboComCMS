import { createHash } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { extensionCatalog } from '@/extensions/generated/catalog'
import { setRouteAliases, validateAliases, type RouteAliases } from '@/platform/routing/aliases'
import { defaultPermalinks, normalizePermalinks, setPermalinks, validatePermalinks, type PermalinkConfig } from '@/shared/routing/permalinks'

export const ALIASES_KEY = 'site.routes.v1'
export const PERMALINKS_KEY = 'site.permalinks.v1'
export type RoutingState = { aliases: RouteAliases; permalinks: PermalinkConfig; revision: string }
export class RouteAliasError extends Error { constructor(message: string, readonly status = 400) { super(message) } }
export type RoutableSection = { module: string; name: string; base: string }
let cache: { at: number; state: RoutingState } | null = null
export function routableSections(): RoutableSection[] {
  const seen = new Set<string>(), out: RoutableSection[] = []
  for (const manifest of extensionCatalog) for (const path of manifest.publicPaths || []) if (/^\/[a-z0-9-]+$/.test(path) && !seen.has(path)) { seen.add(path); out.push({ module: manifest.id, name: manifest.name, base: path }) }
  return out
}
/** Identity entries reserve module roots without changing their stored/custom alias values. */
export function publicRouteAliases(aliases: RouteAliases): RouteAliases { return { ...Object.fromEntries(routableSections().map(section => [section.base, section.base])), ...aliases } }
export const routingRevision = (aliases: object, permalinks: object) => createHash('sha256').update(JSON.stringify({ aliases, permalinks })).digest('hex')
const parse = (value?: string) => { if (value === undefined) return {}; try { const result = JSON.parse(value); if (result && typeof result === 'object' && !Array.isArray(result)) return result } catch {} throw new RouteAliasError('تنظیمات آدرس‌ها معتبر نیست؛ چیزی تغییر نکرد.', 409) }
export async function readRoutingState(client: Prisma.TransactionClient = db) {
  const [a, p] = await Promise.all([client.setting.findUnique({ where: { key: ALIASES_KEY } }), client.setting.findUnique({ where: { key: PERMALINKS_KEY } })])
  const aliases = validateAliases(parse(a?.value), routableSections().map(t => t.base))
  if (!aliases.ok) throw new RouteAliasError(aliases.error, 409)
  const permalinks = normalizePermalinks(parse(p?.value)), invalid = validatePermalinks(permalinks, publicRouteAliases(aliases.aliases))
  if (invalid) throw new RouteAliasError(invalid, 409)
  return { aliases: aliases.aliases, permalinks, revision: routingRevision(aliases.aliases, permalinks), rawAliases: a?.value, rawPermalinks: p?.value }
}
export function publishRoutingState(state: RoutingState) { cache = { at: Date.now(), state }; setRouteAliases(publicRouteAliases(state.aliases)); setPermalinks(state.permalinks); return state }
export async function loadRoutingState(fresh = false): Promise<RoutingState> {
  if (!fresh && cache && Date.now() - cache.at < 5000) { setRouteAliases(publicRouteAliases(cache.state.aliases)); setPermalinks(cache.state.permalinks); return cache.state }
  try { return publishRoutingState(await readRoutingState()) }
  catch (error) { if (fresh) throw error; const fallback = cache?.state || { aliases: {}, permalinks: defaultPermalinks(), revision: '' }; setRouteAliases(fallback.aliases); setPermalinks(fallback.permalinks); return fallback }
}
export async function loadRouteAliases(): Promise<RouteAliases> { return (await loadRoutingState()).aliases }
