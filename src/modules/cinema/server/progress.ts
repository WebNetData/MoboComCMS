import { db } from '@/platform/database/prisma'
import { playbackKind } from '@/modules/media/domain/media'
import { linkHref } from '@/modules/downloads/server/guard'
import { toEmbedUrl } from '@/modules/site/domain/builder'

/** Private, bounded Continue Watching read model. Drafts and removed links stay hidden. */
export async function continueWatching(userId: number, take = 8) {
  const progress = await db.cinemaWatchProgress.findMany({
    where: { userId, completedAt: null, positionSeconds: { gt: 0 } },
    orderBy: { updatedAt: 'desc' }, take: Math.min(Math.max(take * 3, 12), 60),
  })
  if (!progress.length) return []
  const titleIds = progress.filter((row) => row.ownerType === 'title').map((row) => row.ownerId)
  const episodeIds = progress.filter((row) => row.ownerType === 'episode').map((row) => row.ownerId)
  const now = new Date()
  const [titles, episodes, links] = await Promise.all([
    db.cinemaTitle.findMany({ where: { id: { in: titleIds }, status: 'PUBLISHED', publishedAt: { lte: now } }, select: { id: true, slug: true, title: true, titleEn: true, poster: true } }),
    db.cinemaEpisode.findMany({ where: { id: { in: episodeIds }, season: { title: { status: 'PUBLISHED', publishedAt: { lte: now } } } }, select: { id: true, number: true, title: true, titleEn: true, season: { select: { number: true, title: { select: { slug: true, title: true, titleEn: true, poster: true } } } } } }),
    db.mediaLink.findMany({ where: { disabled: false, OR: [{ ownerType: 'title', ownerId: { in: titleIds } }, { ownerType: 'episode', ownerId: { in: episodeIds } }] }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], select: { id: true, ownerType: true, ownerId: true, kind: true, url: true } }),
  ])
  const titleById = new Map(titles.map((row) => [row.id, row]))
  const episodeById = new Map(episodes.map((row) => [row.id, row]))
  const linkByOwner = new Map<string, number>()
  for (const link of links) {
    const key = `${link.ownerType}:${link.ownerId}`
    if (!linkByOwner.has(key) && ['hls', 'video', 'maybe'].includes(playbackKind(link.url, link.kind, toEmbedUrl))) linkByOwner.set(key, link.id)
  }
  const rows = progress.flatMap((row) => {
    const title = row.ownerType === 'title' ? titleById.get(row.ownerId) : null
    const episode = row.ownerType === 'episode' ? episodeById.get(row.ownerId) : null
    const linkId = linkByOwner.get(`${row.ownerType}:${row.ownerId}`)
    if ((!title && !episode) || !linkId) return []
    const parent = title || episode!.season.title
    return [{ key: `${row.ownerType}:${row.ownerId}`, title: parent.title, titleEn: parent.titleEn, poster: parent.poster,
      subtitle: episode ? `S${episode.season.number}E${episode.number}${episode.title ? ` · ${episode.title}` : ''}` : '',
      path: `/cinema/${parent.slug}`, linkId, percent: row.durationSeconds ? Math.min(100, Math.round(row.positionSeconds / row.durationSeconds * 100)) : 0 }]
  }).slice(0, take)
  return Promise.all(rows.map(async (row) => {
    const protectedHref = await linkHref(row.linkId, userId)
    const token = new URL(protectedHref, 'http://localhost').searchParams.get('t')
    return { ...row, href: `/watch/${row.linkId}${token ? `?t=${encodeURIComponent(token)}` : ''}` }
  }))
}
