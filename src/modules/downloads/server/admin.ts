import { db } from '@/platform/database/prisma'
import { rateLimitHit } from '@/platform/http/rate-limit'
import { tehranDay, lastDays } from '@/shared/time/day'
import { normalizeReportReason } from '@/modules/downloads/domain/downloads'

export class DownloadError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}

/** Public "report a problem" for a download link. One open report per reporter and link. */
export async function reportLink(input: { linkId: number; userId: number | null; visitor: string; reason: unknown; note: unknown }) {
  const who = input.userId ? `u${input.userId}` : `v${input.visitor}`
  if (!rateLimitHit(`link-report:${who}`, 10, 3_600_000).ok) throw new DownloadError('گزارش‌های زیادی ثبت کرده‌اید؛ کمی بعد دوباره امتحان کنید.', 429)
  const link = await db.mediaLink.findUnique({ where: { id: input.linkId }, select: { id: true } })
  if (!link) throw new DownloadError('لینک پیدا نشد', 404)
  const note = String(input.note ?? '').replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, 500)
  const since = new Date(Date.now() - 86_400_000)
  const duplicate = await db.linkReport.findFirst({ where: { linkId: link.id, status: 'OPEN', createdAt: { gte: since }, ...(input.userId ? { userId: input.userId } : { visitor: input.visitor }) } })
  if (duplicate) return { reported: true, duplicate: true }
  await db.linkReport.create({ data: { linkId: link.id, userId: input.userId, visitor: input.visitor, reason: normalizeReportReason(input.reason), note } })
  return { reported: true, duplicate: false }
}

const OWNER_PATH: Record<string, (slug: string) => string> = { software: (s) => `/software/${s}`, game: (s) => `/games/${s}`, title: (s) => `/cinema/${s}` }

/** Human label and page for link owners (episodes resolve to their series). */
async function ownerLabels(links: { ownerType: string; ownerId: number }[]) {
  const ids = (type: string) => [...new Set(links.filter((link) => link.ownerType === type).map((link) => link.ownerId))]
  const [software, games, titles, episodes, updates, releases] = await Promise.all([
    db.softwareTitle.findMany({ where: { id: { in: ids('software') } }, select: { id: true, title: true, slug: true } }),
    db.gameTitle.findMany({ where: { id: { in: ids('game') } }, select: { id: true, title: true, slug: true } }),
    db.cinemaTitle.findMany({ where: { id: { in: ids('title') } }, select: { id: true, title: true, slug: true } }),
    db.cinemaEpisode.findMany({ where: { id: { in: ids('episode') } }, select: { id: true, number: true, season: { select: { number: true, title: { select: { title: true, slug: true } } } } } }),
    db.gameUpdate.findMany({ where: { id: { in: ids('gameupdate') } }, select: { id: true, title: true, game: { select: { id: true, title: true, slug: true } } } }),
    db.softwareRelease.findMany({ where: { id: { in: ids('softwarerelease') } }, select: { id: true, version: true, software: { select: { id: true, title: true, slug: true } } } }),
  ])
  const map = new Map<string, { title: string; path: string; admin: string }>()
  for (const row of software) map.set(`software:${row.id}`, { title: row.title, path: OWNER_PATH.software(row.slug), admin: '/admin/software/titles' })
  for (const row of games) map.set(`game:${row.id}`, { title: row.title, path: OWNER_PATH.game(row.slug), admin: '/admin/games' })
  for (const row of updates) map.set(`gameupdate:${row.id}`, { title: `${row.game.title} — ${row.title}`, path: OWNER_PATH.game(row.game.slug), admin: `/admin/games/${row.game.id}` })
  for (const row of releases) map.set(`softwarerelease:${row.id}`, { title: `${row.software.title} — ${row.version}`, path: OWNER_PATH.software(row.software.slug), admin: `/admin/software/releases?softwareId=${row.software.id}` })
  for (const row of titles) map.set(`title:${row.id}`, { title: row.title, path: OWNER_PATH.title(row.slug), admin: '/admin/cinema/titles' })
  for (const row of episodes) map.set(`episode:${row.id}`, { title: `${row.season.title.title} — فصل ${row.season.number} قسمت ${row.number}`, path: OWNER_PATH.title(row.season.title.slug), admin: '/admin/cinema/titles' })
  return map
}

/** Open reports grouped by link, worst first. */
export async function reportQueue() {
  const reports = await db.linkReport.findMany({ where: { status: 'OPEN' }, orderBy: { createdAt: 'desc' }, take: 500, include: { link: true } })
  const owners = await ownerLabels(reports.map((row) => row.link))
  const byLink = new Map<number, { link: { id: number; label: string; quality: string; url: string; disabled: boolean; clicks: number; kind: string }; owner: { title: string; path: string; admin: string }; reports: { id: number; reason: string; note: string; createdAt: Date; userId: number | null }[] }>()
  for (const row of reports) {
    const entry = byLink.get(row.linkId) || {
      link: { id: row.link.id, label: row.link.label, quality: row.link.quality, url: row.link.url, disabled: row.link.disabled, clicks: row.link.clicks, kind: row.link.kind },
      owner: owners.get(`${row.link.ownerType}:${row.link.ownerId}`) || { title: `${row.link.ownerType} #${row.link.ownerId}`, path: '/', admin: '/admin' },
      reports: [],
    }
    entry.reports.push({ id: row.id, reason: row.reason, note: row.note, createdAt: row.createdAt, userId: row.userId })
    byLink.set(row.linkId, entry)
  }
  return [...byLink.values()].sort((a, b) => b.reports.length - a.reports.length)
}

/** fixed: the link was repaired · dismiss: not a problem · disable: hide the link on the site. */
export async function resolveLinkReports(linkId: number, action: 'fixed' | 'dismiss' | 'disable' | 'enable') {
  const link = await db.mediaLink.findUnique({ where: { id: linkId }, select: { id: true } })
  if (!link) throw new DownloadError('لینک پیدا نشد', 404)
  if (action === 'disable' || action === 'enable') await db.mediaLink.update({ where: { id: linkId }, data: { disabled: action === 'disable' } })
  if (action !== 'enable') await db.linkReport.updateMany({ where: { linkId, status: 'OPEN' }, data: { status: action === 'dismiss' ? 'DISMISSED' : 'FIXED', resolvedAt: new Date() } })
  return { linkId, action }
}

/** Checks whether a link's file answers (HEAD, then a 1-byte GET), without following to the user. */
export async function probeLink(linkId: number): Promise<{ ok: boolean; status: number; detail: string; size?: string }> {
  const link = await db.mediaLink.findUnique({ where: { id: linkId }, select: { url: true } })
  if (!link) throw new DownloadError('لینک پیدا نشد', 404)
  return (await import('@/modules/downloads/server/remote')).probePublicFile(link.url)
}

/** Download numbers for the admin page: daily series, top items and today's total. */
export async function downloadStats(days = 14) {
  const since = new Date(Date.now() - days * 86_400_000)
  const rows = await db.downloadLog.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true, ownerType: true, ownerId: true, userId: true } })
  const series = new Map(lastDays(days).map((day) => [day, 0]))
  const perItem = new Map<string, number>()
  for (const row of rows) {
    const day = tehranDay(row.createdAt)
    if (series.has(day)) series.set(day, (series.get(day) || 0) + 1)
    const key = `${row.ownerType}:${row.ownerId}`
    perItem.set(key, (perItem.get(key) || 0) + 1)
  }
  const top = [...perItem].sort((a, b) => b[1] - a[1]).slice(0, 10)
  const owners = await ownerLabels(top.map(([key]) => ({ ownerType: key.split(':')[0], ownerId: Number(key.split(':')[1]) })))
  const tracks = await db.musicTrack.findMany({ where: { id: { in: top.filter(([key]) => key.startsWith('track:')).map(([key]) => Number(key.split(':')[1])) } }, select: { id: true, title: true, slug: true } })
  for (const track of tracks) owners.set(`track:${track.id}`, { title: track.title, path: `/music/track/${track.slug}`, admin: '/admin/music/library' })
  return {
    series: [...series].map(([day, count]) => ({ day, count })),
    today: series.get(tehranDay()) || 0,
    total: rows.length,
    members: rows.filter((row) => row.userId).length,
    top: top.map(([key, count]) => ({ key, count, ...(owners.get(key) || { title: key, path: '/', admin: '/admin' }) })),
    openReports: await db.linkReport.count({ where: { status: 'OPEN' } }),
    disabledLinks: await db.mediaLink.count({ where: { disabled: true } }),
  }
}
