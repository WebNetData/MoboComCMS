import { db } from '@/platform/database/prisma'
import { extensionCatalog } from '@/extensions/generated/catalog'
import { setRouteAliases, validateAliases, type RouteAliases } from '@/platform/routing/aliases'

// Section addresses: which public base each section is published under.

const KEY = 'site.routes.v1'
const TTL = 5_000
let cache: { at: number; map: RouteAliases } | null = null

export type RoutableSection = { module: string; name: string; base: string }

/** Every single-segment public base a feature module owns (/games, /forum …). */
export function routableSections(): RoutableSection[] {
  const out: RoutableSection[] = []
  const seen = new Set<string>()
  for (const manifest of extensionCatalog) {
    for (const path of manifest.publicPaths || []) {
      if (!/^\/[a-z0-9-]+$/.test(path) || seen.has(path)) continue
      seen.add(path)
      out.push({ module: manifest.id, name: manifest.name, base: path })
    }
  }
  return out
}

/** The alias table (cached a few seconds; the middleware calls this on every page request). */
export async function loadRouteAliases(): Promise<RouteAliases> {
  if (cache && Date.now() - cache.at < TTL) return cache.map
  let map: RouteAliases = {}
  try {
    const row = await db.setting.findUnique({ where: { key: KEY } })
    const parsed = row ? JSON.parse(row.value) : {}
    const checked = validateAliases(parsed, routableSections().map((section) => section.base))
    map = checked.ok ? checked.aliases : {}
  } catch { map = cache?.map || {} }
  cache = { at: Date.now(), map }
  setRouteAliases(map)
  return map
}

export async function saveRouteAliases(input: unknown): Promise<RouteAliases> {
  const sections = routableSections()
  const checked = validateAliases(input, sections.map((section) => section.base))
  if (!checked.ok) throw new RouteAliasError(checked.error)
  await db.setting.upsert({ where: { key: KEY }, create: { key: KEY, value: JSON.stringify(checked.aliases) }, update: { value: JSON.stringify(checked.aliases) } })
  cache = { at: Date.now(), map: checked.aliases }
  setRouteAliases(checked.aliases)
  return checked.aliases
}

export class RouteAliasError extends Error {}
