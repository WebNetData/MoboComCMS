import type { PlayerTrack } from './player-types'

export type PlaybackSource = { kind: 'protected-track'; trackId: number; quality: 'standard' | 'hq' }

export function trackSource(track: PlayerTrack, preferHq: boolean): PlaybackSource {
  return { kind: 'protected-track', trackId: track.id, quality: preferHq && track.hasHq ? 'hq' : 'standard' }
}

export function sourceUrl(source: PlaybackSource, check = false): string {
  const params = new URLSearchParams()
  if (check) params.set('check', '1')
  if (source.quality === 'hq') params.set('q', 'hq')
  const query = params.toString()
  return `/api/media/track/${source.trackId}${query ? `?${query}` : ''}`
}

export type PlaybackSession = { queue: PlayerTrack[]; index: number; time: number }
const SESSION_KEY = 'mu.session.v1'
const MAX_QUEUE = 500
const safeSlug = (value: unknown): value is string => typeof value === 'string' && /^[\p{L}\p{N}_-]{1,160}$/u.test(value)

export function parsePlaybackSession(value: unknown): PlaybackSession | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  if (!Array.isArray(raw.queue)) return null
  const queue: PlayerTrack[] = []
  for (const candidate of raw.queue.slice(0, MAX_QUEUE)) {
    if (!candidate || typeof candidate !== 'object') continue
    const row = candidate as Record<string, unknown>
    if (!Number.isSafeInteger(row.id) || Number(row.id) <= 0 || !safeSlug(row.slug)) continue
    const title = typeof row.title === 'string' ? row.title.slice(0, 200) : ''
    const artist = typeof row.artist === 'string' ? row.artist.slice(0, 200) : ''
    const artistSlug = safeSlug(row.artistSlug) ? row.artistSlug : ''
    const cover = typeof row.cover === 'string' && (row.cover.startsWith('/') && !row.cover.startsWith('//') || /^https:\/\//.test(row.cover)) ? row.cover.slice(0, 500) : ''
    if (!title) continue
    queue.push({ id: Number(row.id), slug: row.slug, title, artist, artistSlug, cover, access: row.access === 'MEMBERS' ? 'MEMBERS' : 'PUBLIC', hasHq: row.hasHq === true, duration: typeof row.duration === 'number' && Number.isFinite(row.duration) ? Math.max(0, Math.min(row.duration, 86_400)) : 0 })
  }
  if (!queue.length) return null
  const index = Number.isSafeInteger(raw.index) ? Math.max(0, Math.min(Number(raw.index), queue.length - 1)) : 0
  const time = typeof raw.time === 'number' && Number.isFinite(raw.time) ? Math.max(0, Math.min(raw.time, queue[index].duration || 86_400)) : 0
  return { queue, index, time }
}

export function readPlaybackSession(): PlaybackSession | null {
  try { return parsePlaybackSession(JSON.parse(localStorage.getItem(SESSION_KEY) || 'null')) } catch { return null }
}

export function writePlaybackSession(session: PlaybackSession | null): void {
  try {
    if (session?.queue.length) localStorage.setItem(SESSION_KEY, JSON.stringify({ queue: session.queue.slice(0, MAX_QUEUE), index: session.index, time: Math.floor(session.time) }))
    else localStorage.removeItem(SESSION_KEY)
  } catch { /* storage unavailable */ }
}
