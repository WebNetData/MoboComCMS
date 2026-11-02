import { db } from '@/platform/database/prisma'
import { toTrack } from '@/modules/media/server/queries'

const PAGE_SIZE = 24

export class HistoryError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}

export function historyTrackId(value: unknown) {
  const id = Number(value)
  if (!Number.isSafeInteger(id) || id <= 0) throw new HistoryError('invalid track')
  return id
}

/** A start of audible playback, bounded so media events and retries do not inflate counts. */
export async function recordListen(userId: number, rawTrackId: unknown) {
  const trackId = historyTrackId(rawTrackId)
  const now = new Date()
  const track = await db.musicTrack.findFirst({ where: {album: { isNot: { audienceGroups: { not: '' } } },  id: trackId, status: 'PUBLISHED', audienceGroups: '', publishedAt: { lte: now }, audioUrl: { not: '' } }, select: { id: true } })
  if (!track) throw new HistoryError('track unavailable', 404)
  const changed = await db.musicListenHistory.updateMany({
    where: { userId, trackId, lastPlayedAt: { lte: new Date(now.getTime() - 30_000) } },
    data: { playCount: { increment: 1 }, lastPlayedAt: now },
  })
  if (changed.count) return { recorded: true }
  if (await db.musicListenHistory.findUnique({ where: { userId_trackId: { userId, trackId } }, select: { trackId: true } })) return { recorded: false }
  try {
    await db.musicListenHistory.create({ data: { userId, trackId, lastPlayedAt: now, firstPlayedAt: now } })
    return { recorded: true }
  } catch (error) {
    if ((error as { code?: string })?.code === 'P2002') return { recorded: false }
    throw error
  }
}

export async function listListeningHistory(userId: number, rawPage: unknown) {
  const requested = Number(rawPage)
  const page = Number.isSafeInteger(requested) ? Math.min(1000, Math.max(1, requested)) : 1
  const where = { userId, track: { is: { album: { isNot: { audienceGroups: { not: '' } } },  status: 'PUBLISHED', publishedAt: { lte: new Date() }, audienceGroups: '' } } }
  const total = await db.musicListenHistory.count({ where })
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const current = Math.min(page, pages)
  const rows = await db.musicListenHistory.findMany({
    where, orderBy: [{ lastPlayedAt: 'desc' }, { trackId: 'desc' }], skip: (current - 1) * PAGE_SIZE, take: PAGE_SIZE,
    include: { track: { include: { artist: { select: { id: true, slug: true, name: true, nameEn: true, image: true } }, album: { select: { id: true, slug: true, title: true, titleEn: true, cover: true } } } } },
  })
  return { items: rows.map((row) => ({ track: toTrack(row.track), playCount: row.playCount, lastPlayedAt: row.lastPlayedAt, positionSeconds: row.positionSeconds, durationSeconds: row.durationSeconds, completedAt: row.completedAt })), total, page: current, pages }
}

export async function continueListening(userId: number) {
  const rows = await db.musicListenHistory.findMany({
    where: { userId, completedAt: null, positionSeconds: { gte: 5 }, durationSeconds: { gt: 0 }, track: { is: { album: { isNot: { audienceGroups: { not: '' } } },  status: 'PUBLISHED', publishedAt: { lte: new Date() }, audienceGroups: '' } } },
    orderBy: { progressUpdatedAt: 'desc' }, take: 24,
    include: { track: { include: { artist: { select: { id: true, slug: true, name: true, nameEn: true, image: true } }, album: { select: { id: true, slug: true, title: true, titleEn: true, cover: true } } } } },
  })
  return rows.filter((row) => row.durationSeconds - row.positionSeconds > 5).slice(0, 12).map((row) => ({ track: toTrack(row.track), positionSeconds: row.positionSeconds, durationSeconds: row.durationSeconds }))
}

export async function clearListeningHistory(userId: number) {
  return db.musicListenHistory.deleteMany({ where: { userId } })
}

export async function listeningHistoryCount(userId: number) {
  return db.musicListenHistory.count({ where: { userId, track: { is: { album: { isNot: { audienceGroups: { not: '' } } },  status: 'PUBLISHED', publishedAt: { lte: new Date() }, audienceGroups: '' } } } })
}

export async function getListeningProgress(userId: number, rawTrackId: unknown) {
  const trackId = historyTrackId(rawTrackId)
  const row = await db.musicListenHistory.findFirst({
    where: { userId, trackId, track: { is: { album: { isNot: { audienceGroups: { not: '' } } },  status: 'PUBLISHED', publishedAt: { lte: new Date() }, audienceGroups: '' } } },
    select: { positionSeconds: true, durationSeconds: true, completedAt: true, progressUpdatedAt: true },
  })
  return row || { positionSeconds: 0, durationSeconds: 0, completedAt: null, progressUpdatedAt: null }
}

function seconds(value: unknown) {
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0 || number > 86_400) throw new HistoryError('invalid progress')
  return Math.floor(number)
}

export async function saveListeningProgress(userId: number, input: { trackId: unknown; position: unknown; duration: unknown; completed: unknown }) {
  const trackId = historyTrackId(input.trackId)
  const durationSeconds = seconds(input.duration)
  const positionSeconds = seconds(input.position)
  if (!durationSeconds || positionSeconds > durationSeconds || typeof input.completed !== 'boolean') throw new HistoryError('invalid progress')
  const track = await db.musicTrack.findFirst({ where: {album: { isNot: { audienceGroups: { not: '' } } },  id: trackId, status: 'PUBLISHED', audienceGroups: '', publishedAt: { lte: new Date() }, audioUrl: { not: '' } }, select: { id: true } })
  if (!track) throw new HistoryError('track unavailable', 404)
  const now = new Date()
  const progress = { positionSeconds, durationSeconds, progressUpdatedAt: now, completedAt: input.completed ? now : null }
  await db.musicListenHistory.upsert({
    where: { userId_trackId: { userId, trackId } },
    create: { userId, trackId, ...progress }, update: progress,
  })
  return { saved: true }
}
