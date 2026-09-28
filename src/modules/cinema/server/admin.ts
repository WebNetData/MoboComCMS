import { db } from '@/platform/database/prisma'
import { readJsonSetting, writeJsonSetting } from '@/modules/settings/server'
import { splitList } from '@/modules/media/domain/media'
import { CINEMA_HEALTH, cinemaIssues, normalizeCinemaSettings, type CinemaHealth, type CinemaSettings } from '@/modules/cinema/domain/cinema'

// Film & series admin: home layout settings, dashboard and title picker.

const SETTINGS_KEY = 'cinema.portal.v1'
const DAY = 86_400_000
const tehranDay = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)

export async function getCinemaSettings(): Promise<CinemaSettings> {
  return normalizeCinemaSettings(await readJsonSetting(SETTINGS_KEY))
}

export async function saveCinemaSettings(input: unknown): Promise<CinemaSettings> {
  const next = normalizeCinemaSettings(input)
  await writeJsonSetting(SETTINGS_KEY, next)
  return next
}

export async function cinemaDashboard(now = new Date()) {
  const since = new Date(now.getTime() - 30 * DAY)
  const [titles, seasons, links, reports, downloads] = await Promise.all([
    db.cinemaTitle.findMany({ select: { id: true, slug: true, kind: true, title: true, poster: true, backdrop: true, summary: true, imdbRating: true, trailerUrl: true, genres: true, status: true, publishedAt: true, views: true, access: true, dubbed: true, subtitle: true, seriesStatus: true, featured: true } }),
    db.cinemaSeason.findMany({ select: { titleId: true, number: true, episodes: { select: { id: true, number: true, airDate: true } } } }),
    db.mediaLink.findMany({ where: { ownerType: { in: ['title', 'episode'] } }, select: { ownerType: true, ownerId: true, clicks: true, disabled: true } }),
    db.linkReport.count({ where: { status: 'OPEN', link: { ownerType: { in: ['title', 'episode'] } } } }).catch(() => 0),
    db.downloadLog.findMany({ where: { ownerType: { in: ['title', 'episode'] }, createdAt: { gte: since } }, select: { createdAt: true } }).catch(() => []),
  ])
  const titleLinks = new Map<number, number>()
  const episodeLinks = new Set<number>()
  for (const link of links) {
    if (link.disabled) continue
    if (link.ownerType === 'title') titleLinks.set(link.ownerId, (titleLinks.get(link.ownerId) || 0) + 1)
    else episodeLinks.add(link.ownerId)
  }
  const bySeries = new Map<number, { seasons: number; episodes: number; missing: number; last: { season: number; episode: number; airDate: Date | null } | null }>()
  for (const season of seasons) {
    const row = bySeries.get(season.titleId) || { seasons: 0, episodes: 0, missing: 0, last: null }
    row.seasons++
    for (const episode of season.episodes) {
      row.episodes++
      if (!episodeLinks.has(episode.id)) row.missing++
      if (!row.last || season.number > row.last.season || (season.number === row.last.season && episode.number > row.last.episode)) row.last = { season: season.number, episode: episode.number, airDate: episode.airDate }
    }
    bySeries.set(season.titleId, row)
  }
  const live = titles.filter((title) => title.status === 'PUBLISHED' && title.publishedAt <= now)
  const health = Object.fromEntries(Object.keys(CINEMA_HEALTH).map((key) => [key, 0])) as Record<CinemaHealth, number>
  const worst: { id: number; title: string; poster: string; kind: string; issues: CinemaHealth[] }[] = []
  for (const title of live) {
    const series = bySeries.get(title.id)
    const issues = cinemaIssues({ ...title, links: titleLinks.get(title.id) || 0, seasons: series?.seasons || 0, episodes: series?.episodes || 0, episodesWithoutLinks: series?.missing || 0 })
    for (const issue of issues) health[issue]++
    // Missing IMDb/trailer alone is minor; list titles with a real gap first.
    if (issues.some((issue) => issue !== 'imdb' && issue !== 'trailer')) worst.push({ id: title.id, title: title.title, poster: title.poster, kind: title.kind, issues })
  }
  worst.sort((a, b) => b.issues.length - a.issues.length)
  const days = Array.from({ length: 30 }, (_, i) => tehranDay(new Date(now.getTime() - (29 - i) * DAY)))
  const counts = new Map(days.map((day) => [day, 0]))
  for (const row of downloads) { const key = tehranDay(row.createdAt); if (counts.has(key)) counts.set(key, counts.get(key)! + 1) }
  const genres = new Map<string, number>()
  for (const title of live) for (const genre of splitList(title.genres, 8)) genres.set(genre, (genres.get(genre) || 0) + 1)
  const movies = live.filter((title) => title.kind === 'MOVIE')
  const series = live.filter((title) => title.kind === 'SERIES')
  return {
    kpis: {
      movies: movies.length, series: series.length, episodes: [...bySeries.values()].reduce((sum, row) => sum + row.episodes, 0),
      drafts: titles.filter((title) => title.status !== 'PUBLISHED').length, scheduled: titles.filter((title) => title.status === 'PUBLISHED' && title.publishedAt > now).length,
      views: live.reduce((sum, title) => sum + title.views, 0), clicks: links.reduce((sum, link) => sum + link.clicks, 0), downloads30: downloads.length,
      openReports: reports, disabledLinks: links.filter((link) => link.disabled).length,
      vip: live.filter((title) => title.access === 'MEMBERS').length, dubbed: live.filter((title) => title.dubbed).length, subtitled: live.filter((title) => title.subtitle).length,
      featured: live.filter((title) => title.featured).length, ongoing: series.filter((title) => title.seriesStatus === 'ONGOING').length,
    },
    series: days.map((day) => ({ day, downloads: counts.get(day)! })),
    health: Object.entries(health).map(([key, count]) => ({ key, label: CINEMA_HEALTH[key as CinemaHealth], count })).filter((row) => row.count).sort((a, b) => b.count - a.count),
    worst: worst.slice(0, 8),
    topViewed: [...live].sort((a, b) => b.views - a.views).slice(0, 8).map((title) => ({ id: title.id, slug: title.slug, title: title.title, poster: title.poster, kind: title.kind, views: title.views, imdb: title.imdbRating })),
    ongoing: series.filter((title) => title.seriesStatus === 'ONGOING').map((title) => ({ id: title.id, slug: title.slug, title: title.title, poster: title.poster, seasons: bySeries.get(title.id)?.seasons || 0, episodes: bySeries.get(title.id)?.episodes || 0, last: bySeries.get(title.id)?.last || null }))
      .sort((a, b) => +(b.last?.airDate || 0) - +(a.last?.airDate || 0)).slice(0, 8).map((row) => ({ ...row, last: row.last ? { ...row.last, airDate: row.last.airDate?.toISOString() || null } : null })),
    genres: [...genres].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([name, count]) => ({ name, count })),
  }
}

/** Published titles for the slider picker. */
export async function cinemaPicker() {
  const rows = await db.cinemaTitle.findMany({ where: { status: 'PUBLISHED' }, orderBy: { publishedAt: 'desc' }, take: 800, select: { id: true, title: true, poster: true, kind: true, year: true } })
  return rows
}
