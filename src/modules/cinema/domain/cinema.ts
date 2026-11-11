// Film & series section rules: home layout settings and content health.
// Pure — shared by the admin API, the public home page and tests.

import { clampInt, normalizeIds, normalizeRails, parseSettingsInput } from '@/shared/section-layout'

export const CINEMA_RAILS = {
  hero: 'اسلایدر بالای صفحه',
  genres: 'ژانرها (چیپ‌ها)',
  movies: 'جدیدترین فیلم‌ها',
  series: 'سریال‌های تازه',
  formatShelves: 'قفسهٔ انواع (انیمه، مستند… هر نوعی که قفسه دارد)',
  topRated: 'برترین‌ها از نگاه IMDb',
  dubbed: 'دوبله فارسی',
  members: 'ویژهٔ اعضای VIP',
  genreShelves: 'قفسه‌های ژانر',
  vipStrip: 'نوار دعوت به اشتراک ویژه',
} as const
export type CinemaRail = keyof typeof CINEMA_RAILS

export type CinemaSettings = {
  rails: { key: CinemaRail; enabled: boolean }[]
  /** Hand-picked slider titles in order; empty = featured, then newest. */
  heroIds: number[]
  /** How many titles each shelf shows. */
  shelfSize: number
  /** How many genre shelves to render (the most used genres). */
  genreShelfCount: number
  /** Only titles at or above this IMDb score enter the top-rated shelf. */
  topRatedMin: number
  showImdb: boolean
  personFollowEnabled: boolean
  showPersonBiography: boolean
  enableAssSubtitles: boolean
  enableSeparateAudio: boolean
  /** Look for subtitles beside and inside each video file and offer them in the player (media/server/found-subtitles). */
  findSubtitles: boolean
  /**
   * Also take out the subtitles inside a video file (MKV/MP4). That reads the whole file once (its traffic, and a
   * temporary copy on a slow host); off, only subtitle files beside the video are looked for (owner 2026-11-12).
   */
  readEmbeddedSubtitles: boolean
  /** The largest video file read whole to take out the subtitles inside it, in GB. */
  subtitleScanMaxGB: number
  /** The site's intro clip before a film or episode in the player ('' = none): an MP4/WebM address. */
  introUrl: string
  /** Seconds before the intro may be skipped (0 = it plays out). */
  introSkipAfter: number
  /** Once per browser session, or before every film. */
  introFrequency: 'SESSION' | 'ALWAYS'
}

/** An intro the player can play: an MP4 or WebM file at an http(s) address or on this site; '' otherwise. */
export function introVideoUrl(value: unknown): string {
  const raw = String(value ?? '').trim()
  if (!raw || raw.length > 2000 || /[\s<>"'\\\u0000-\u001f]/.test(raw)) return ''
  if (!/^(https?:\/\/[^/]|\/(?!\/))/i.test(raw)) return ''
  return /\.(mp4|webm)$/i.test(raw.split(/[?#]/)[0]) ? raw : ''
}

export const DEFAULT_CINEMA_SETTINGS: CinemaSettings = {
  rails: (Object.keys(CINEMA_RAILS) as CinemaRail[]).map((key) => ({ key, enabled: true })),
  heroIds: [],
  shelfSize: 16,
  genreShelfCount: 3,
  topRatedMin: 0,
  showImdb: true,
  personFollowEnabled: true,
  showPersonBiography: true,
  enableAssSubtitles: true,
  enableSeparateAudio: true,
  findSubtitles: true,
  readEmbeddedSubtitles: true,
  subtitleScanMaxGB: 10,
  introUrl: '',
  introSkipAfter: 3,
  introFrequency: 'SESSION',
}

export function normalizeCinemaSettings(input: unknown): CinemaSettings {
  const raw = parseSettingsInput(input)
  const d = DEFAULT_CINEMA_SETTINGS
  const min = Number(raw.topRatedMin)
  return {
    rails: normalizeRails(raw.rails, CINEMA_RAILS),
    heroIds: normalizeIds(raw.heroIds, 8),
    shelfSize: clampInt(raw.shelfSize, 6, 24, d.shelfSize),
    genreShelfCount: clampInt(raw.genreShelfCount, 0, 6, d.genreShelfCount),
    topRatedMin: Number.isFinite(min) ? Math.min(10, Math.max(0, Math.round(min * 10) / 10)) : d.topRatedMin,
    showImdb: raw.showImdb !== false,
    personFollowEnabled: raw.personFollowEnabled !== false,
    showPersonBiography: raw.showPersonBiography !== false,
    enableAssSubtitles: raw.enableAssSubtitles !== false,
    enableSeparateAudio: raw.enableSeparateAudio !== false,
    findSubtitles: raw.findSubtitles !== false,
    readEmbeddedSubtitles: raw.readEmbeddedSubtitles !== false,
    subtitleScanMaxGB: clampInt(raw.subtitleScanMaxGB, 1, 100, d.subtitleScanMaxGB),
    introUrl: introVideoUrl(raw.introUrl),
    introSkipAfter: clampInt(raw.introSkipAfter, 0, 30, d.introSkipAfter),
    introFrequency: raw.introFrequency === 'ALWAYS' ? 'ALWAYS' : 'SESSION',
  }
}

// ------------------------------------------------------------------ content health

export const CINEMA_HEALTH = {
  poster: 'بدون پوستر',
  backdrop: 'بدون تصویر افقی',
  summary: 'بدون خلاصهٔ داستان',
  links: 'بدون لینک دانلود/پخش',
  seasons: 'سریال بدون فصل',
  episodeLinks: 'قسمت بدون لینک',
  imdb: 'بدون امتیاز IMDb',
  trailer: 'بدون تریلر',
  genres: 'بدون ژانر',
} as const
export type CinemaHealth = keyof typeof CINEMA_HEALTH

export type CinemaHealthInput = {
  kind: string; poster: string; backdrop: string; summary: string; imdbRating: number | null; trailerUrl: string; genres: string
  links: number; seasons: number; episodes: number; episodesWithoutLinks: number
}

export function cinemaIssues(title: CinemaHealthInput): CinemaHealth[] {
  const issues: CinemaHealth[] = []
  if (!title.poster.trim()) issues.push('poster')
  if (!title.backdrop.trim()) issues.push('backdrop')
  if (title.summary.trim().length < 40) issues.push('summary')
  if (title.kind === 'SERIES') {
    if (!title.seasons || !title.episodes) issues.push('seasons')
    else if (title.episodesWithoutLinks > 0) issues.push('episodeLinks')
  } else if (!title.links) issues.push('links')
  if (title.imdbRating === null) issues.push('imdb')
  if (!title.trailerUrl.trim()) issues.push('trailer')
  if (!title.genres.trim()) issues.push('genres')
  return issues
}
