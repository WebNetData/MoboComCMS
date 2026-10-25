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
