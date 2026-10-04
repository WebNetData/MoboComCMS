import { clampInt, normalizeIds, normalizeRails, parseSettingsInput } from '@/shared/section-layout'

// Music section rules: home layout settings and catalogue health. Pure.

export const MUSIC_RAILS = {
  hero: 'آهنگ ویژه و صف پخش',
  genres: 'سبک‌ها (چیپ‌ها)',
  charts: 'جدیدترین‌ها و چارت برتر',
  featuredAlbums: 'آلبوم‌های ویژه',
  latestAlbums: 'آلبوم‌های تازه',
  artists: 'خوانندگان محبوب',
  playlists: 'پلی‌لیست‌ها',
  vipStrip: 'نوار دعوت به اشتراک ویژه',
} as const
export type MusicRail = keyof typeof MUSIC_RAILS

export const CHART_SOURCES = { plays: 'بیشترین پخش', downloads: 'بیشترین دانلود', recent: 'تازه‌ترین‌ها' } as const
export type ChartSource = keyof typeof CHART_SOURCES

export type MusicSettings = {
  rails: { key: MusicRail; enabled: boolean }[]
  /** Hand-picked hero tracks in order; empty = featured tracks, then newest. */
  heroTrackIds: number[]
  /** Hand-picked albums for the featured shelf; empty = albums marked featured. */
  featuredAlbumIds: number[]
  chartSize: number
  chartSource: ChartSource
  latestSize: number
  showLyrics: boolean
  showRelatedTracks: boolean
}

export const DEFAULT_MUSIC_SETTINGS: MusicSettings = {
  rails: (Object.keys(MUSIC_RAILS) as MusicRail[]).map((key) => ({ key, enabled: true })),
  heroTrackIds: [],
  featuredAlbumIds: [],
  chartSize: 10,
  chartSource: 'plays',
  latestSize: 12,
  showLyrics: true,
  showRelatedTracks: true,
}

export function normalizeMusicSettings(input: unknown): MusicSettings {
  const raw = parseSettingsInput(input)
  const d = DEFAULT_MUSIC_SETTINGS
  const source = String(raw.chartSource || '')
  return {
    rails: normalizeRails(raw.rails, MUSIC_RAILS),
    heroTrackIds: normalizeIds(raw.heroTrackIds, 5),
    featuredAlbumIds: normalizeIds(raw.featuredAlbumIds, 12),
    chartSize: clampInt(raw.chartSize, 5, 30, d.chartSize),
    chartSource: Object.prototype.hasOwnProperty.call(CHART_SOURCES, source) ? source as ChartSource : d.chartSource,
    latestSize: clampInt(raw.latestSize, 6, 30, d.latestSize),
    showLyrics: raw.showLyrics !== false,
    showRelatedTracks: raw.showRelatedTracks !== false,
  }
}

// ------------------------------------------------------------------ catalogue health

export const MUSIC_HEALTH = {
  audio: 'بدون فایل صوتی',
  hq: 'بدون کیفیت ۳۲۰',
  cover: 'بدون کاور',
  duration: 'بدون مدت زمان',
  lyrics: 'بدون متن ترانه',
  genre: 'بدون سبک',
} as const
export type MusicHealth = keyof typeof MUSIC_HEALTH

export function trackIssues(track: { audioUrl: string; audioHqUrl: string; cover: string; albumCover: string; duration: number; lyrics: string; genre: string }): MusicHealth[] {
  const issues: MusicHealth[] = []
  if (!track.audioUrl.trim()) issues.push('audio')
  if (!track.audioHqUrl.trim()) issues.push('hq')
  if (!track.cover.trim() && !track.albumCover.trim()) issues.push('cover')
  if (track.duration <= 0) issues.push('duration')
  if (!track.lyrics.trim()) issues.push('lyrics')
  if (!track.genre.trim()) issues.push('genre')
  return issues
}

/** Hero tracks: picked ids first (in order, only those still live), then fallback. */
export function pickInOrder<T extends { id: number }>(ids: number[], rows: T[], fallback: T[], max: number): T[] {
  const byId = new Map(rows.map((row) => [row.id, row]))
  const picked = ids.map((id) => byId.get(id)).filter((row): row is T => !!row)
  return (picked.length ? picked : fallback).slice(0, max)
}
