import { db } from '@/platform/database/prisma'
import { routeDecision } from '@/platform/routing/aliases'
import { applySectionAlias, matchPermalink, permalinkPath } from '@/shared/routing/permalinks'
import { loadRoutingState, publicRouteAliases } from './state'

/** Canonical page guards still execute on the internal route after every rewrite. */
export async function resolvePublicRoute(path: string) {
  const state = await loadRoutingState()
  const aliases = publicRouteAliases(state.aliases)
  const match = matchPermalink(path, state.permalinks, aliases)
  if (match) {
    let artist: string | undefined
    if (match.kind === 'page') {
      const page = await db.page.findUnique({ where: { slug: match.slug }, select: { status: true } })
      if (!page || page.status !== 'PUBLISHED') return null
    }
    if (match.kind === 'track' || match.kind === 'album') {
      const select = { artist: { select: { slug: true } } }
      const item = match.kind === 'track' ? await db.musicTrack.findUnique({ where: { slug: match.slug }, select }) : await db.musicAlbum.findUnique({ where: { slug: match.slug }, select })
      if (!item) return null
      artist = item.artist.slug
    }
    const canonical = permalinkPath(match.kind, match.slug, { artist }, state.permalinks, aliases)
    if (canonical !== path) return { kind: 'redirect' as const, path: canonical }
    return canonical !== match.internal ? { kind: 'rewrite' as const, path: match.internal } : null
  }
  for (const [base, history] of Object.entries(state.permalinks.aliasHistory)) for (const old of history) if (path === old || path.startsWith(old + '/')) return { kind: 'redirect' as const, path: applySectionAlias(base + path.slice(old.length), state.aliases) }
  return routeDecision(path, state.aliases)
}
