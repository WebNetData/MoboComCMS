import { db } from '@/platform/database/prisma'
import { getRouteAliases } from '@/platform/routing/aliases'
import { getPermalinks, matchPermalink, permalinkPath, type PermalinkConfig } from '@/shared/routing/permalinks'
import { loadRoutingState } from './state'

/**
 * Stored links (page-builder buttons, rich text, menus) and code that knows only a slug write a track or album as
 * /music/track/{slug}. When the address of tracks or albums names the artist, such a link costs every visitor a 308.
 * This resolves those links to the final address before the page is sent: one query per kind for the whole page.
 * Only published items are looked up; anything unknown is left as written (the router still redirects it).
 */
const ARTIST_KINDS = ['track', 'album'] as const
type ArtistKind = typeof ARTIST_KINDS[number]
const LIMIT = 300
const HREF = /href=(["'])(\/[^"'\s<>]{1,500})\1/g

function needsArtist(config: PermalinkConfig) { return ARTIST_KINDS.filter((kind) => config.templates[kind].includes('{artist}')) }

/** The track/album paths in `paths` that lack an artist, keyed by kind and slug. */
function candidates(paths: Iterable<string>, kinds: readonly ArtistKind[], config: PermalinkConfig, aliases: Record<string, string>) {
  const found = new Map<string, { kind: ArtistKind; slug: string; suffix: string }>()
  for (const path of paths) {
    if (found.size >= LIMIT) break
    if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || found.has(path)) continue
    const cut = path.search(/[?#]/), pathname = cut < 0 ? path : path.slice(0, cut)
    const match = matchPermalink(pathname, config, aliases)
    if (!match || match.artist || !(kinds as readonly string[]).includes(match.kind)) continue
    found.set(path, { kind: match.kind as ArtistKind, slug: match.slug, suffix: cut < 0 ? '' : path.slice(cut) })
  }
  return found
}

/** Maps each given link that names a published track or album without its artist to the item's final address. */
export async function canonicalContentLinks(paths: Iterable<string>): Promise<Map<string, string>> {
  await loadRoutingState()
  const config = getPermalinks(), aliases = getRouteAliases(), kinds = needsArtist(config)
  const out = new Map<string, string>()
  if (!kinds.length) return out
  const wanted = candidates(paths, kinds, config, aliases)
  if (!wanted.size) return out
  const slugs = (kind: ArtistKind) => [...new Set([...wanted.values()].filter((w) => w.kind === kind).map((w) => w.slug))]
  const [tracks, albums] = await Promise.all([
    slugs('track').length ? db.musicTrack.findMany({ where: { slug: { in: slugs('track') }, status: 'PUBLISHED' }, select: { slug: true, artist: { select: { slug: true } } } }) : [],
    slugs('album').length ? db.musicAlbum.findMany({ where: { slug: { in: slugs('album') }, status: 'PUBLISHED' }, select: { slug: true, artist: { select: { slug: true } } } }) : [],
  ])
  const artistOf = new Map<string, string>([...tracks.map((row) => [`track:${row.slug}`, row.artist.slug] as const), ...albums.map((row) => [`album:${row.slug}`, row.artist.slug] as const)])
  for (const [path, item] of wanted) {
    const artist = artistOf.get(`${item.kind}:${item.slug}`)
    if (artist) out.set(path, permalinkPath(item.kind, item.slug, { artist }, config, aliases) + item.suffix)
  }
  return out
}

/** Every link-shaped string in a JSON value: whole internal paths and href attributes inside HTML. */
function collect(value: unknown, into: Set<string>, depth = 0): void {
  if (depth > 40 || into.size > LIMIT * 4) return
  if (typeof value === 'string') {
    if (value.startsWith('/') && !value.startsWith('//') && value.length <= 500 && !/\s/.test(value)) into.add(value)
    else if (value.includes('href=')) for (const match of value.matchAll(HREF)) into.add(match[2])
  } else if (Array.isArray(value)) for (const item of value) collect(item, into, depth + 1)
  else if (value && typeof value === 'object') for (const item of Object.values(value)) collect(item, into, depth + 1)
}

function rewrite<T>(value: T, map: Map<string, string>, depth = 0): T {
  if (depth > 40) return value
  if (typeof value === 'string') {
    const direct = map.get(value)
    if (direct) return direct as T
    if (!value.includes('href=')) return value
    return value.replace(HREF, (whole, quote: string, path: string) => { const to = map.get(path); return to ? `href=${quote}${to}${quote}` : whole }) as T
  }
  if (Array.isArray(value)) { let changed = false; const next = value.map((item) => { const r = rewrite(item, map, depth + 1); if (r !== item) changed = true; return r }); return (changed ? next : value) as T }
  if (value && typeof value === 'object') {
    let changed = false
    const next: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) { const r = rewrite(item, map, depth + 1); if (r !== item) changed = true; next[key] = r }
    return (changed ? next : value) as T
  }
  return value
}

/** A copy of a stored document (builder page, menu, settings) with its track/album links at their final address. */
export async function withCanonicalContentLinks<T>(value: T): Promise<T> {
  const paths = new Set<string>()
  collect(value, paths)
  if (!paths.size) return value
  const map = await canonicalContentLinks(paths).catch(() => new Map<string, string>())
  return map.size ? rewrite(value, map) : value
}
