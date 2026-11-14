import { db } from '@/platform/database/prisma'
import { getPublicExtensionRuntime } from '@/extensions/server/state'
import { pathDisabled } from '@/platform/extensions/contracts'
import { livePostWhere } from '@/modules/journal/domain/journal'
import type { ProblemKind } from '@/modules/support/domain/report-problem'

export type PublicProblemContext = { title: string; path: string }

const safeSlug = (value: string) => /^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/.test(value)

/** Resolve only canonical public detail routes. No user-supplied IDs, queries, hashes or external URLs are accepted. */
export async function resolvePublicProblemContext(input: unknown): Promise<PublicProblemContext | null> {
  if (typeof input !== 'string' || input.length > 256 || !input.startsWith('/') || input.includes('?') || input.includes('#') || input.includes('\\') || input.includes('%')) return null
  const path = input.replace(/\/$/, '') || '/'
  const match = /^(\/blog|\/music\/(?:track|album)|\/cinema|\/games|\/software|\/p)\/([A-Za-z0-9][A-Za-z0-9_-]{0,119})$/.exec(path)
  if (!match) return null
  const [, route, slug] = match
  if (!safeSlug(slug)) return null
  const runtime = await getPublicExtensionRuntime().catch(() => null)
  if (!runtime || pathDisabled(path, runtime)) return null
  const now = new Date()

  if (route === '/blog') {
    const post = await db.post.findFirst({ where: { ...livePostWhere(now), slug, access: 'PUBLIC' }, select: { title: true, slug: true } })
    return post ? { title: post.title, path: `/blog/${encodeURIComponent(post.slug)}` } : null
  }
  if (route === '/music/track') {
    const track = await db.musicTrack.findFirst({ where: { slug, status: 'PUBLISHED', publishedAt: { lte: now }, access: 'PUBLIC', audienceGroups: '' }, select: { title: true, slug: true } })
    return track ? { title: track.title, path: `/music/track/${encodeURIComponent(track.slug)}` } : null
  }
  if (route === '/music/album') {
    const album = await db.musicAlbum.findFirst({ where: { slug, status: 'PUBLISHED', publishedAt: { lte: now }, access: 'PUBLIC', audienceGroups: '' }, select: { title: true, slug: true } })
    return album ? { title: album.title, path: `/music/album/${encodeURIComponent(album.slug)}` } : null
  }
  if (route === '/cinema') {
    const title = await db.cinemaTitle.findFirst({ where: { slug, status: 'PUBLISHED', publishedAt: { lte: now }, access: 'PUBLIC', audienceGroups: '' }, select: { title: true, slug: true } })
    return title ? { title: title.title, path: `/cinema/${encodeURIComponent(title.slug)}` } : null
  }
  if (route === '/games') {
    const title = await db.gameTitle.findFirst({ where: { slug, status: 'PUBLISHED', access: 'PUBLIC', audienceGroups: '' }, select: { title: true, slug: true } })
    return title ? { title: title.title, path: `/games/${encodeURIComponent(title.slug)}` } : null
  }
  if (route === '/software') {
    const title = await db.softwareTitle.findFirst({ where: { slug, status: 'PUBLISHED', access: 'PUBLIC', audienceGroups: '' }, select: { title: true, slug: true } })
    return title ? { title: title.title, path: `/software/${encodeURIComponent(title.slug)}` } : null
  }
  const page = await db.page.findFirst({ where: { slug, status: 'PUBLISHED' }, select: { title: true, slug: true } })
  return page ? { title: page.title, path: `/p/${encodeURIComponent(page.slug)}` } : null
}
