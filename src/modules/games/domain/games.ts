import { JALALI_MONTHS, fromJalali as sharedFromJalali, jalaliMonthLength, toJalali } from '@/shared/time/jalali'

/**
 * Games section rules (GameUp-style portal): library states, localization and
 * play modes, per-platform releases, store links, updates/DLC, the Persian
 * release calendar, content health and the portal settings. Pure functions.
 */

export class GameError extends Error {
  constructor(message: string, readonly status = 400, readonly code = 'INVALID') { super(message) }
}

// ------------------------------------------------------------------ library

export const LIBRARY_STATUSES = ['PLAYING', 'PLAYED', 'WANT', 'DROPPED'] as const
export type LibraryStatus = typeof LIBRARY_STATUSES[number]
export const LIBRARY_LABELS: Record<LibraryStatus, { label: string; verb: string; icon: string }> = {
  PLAYING: { label: 'در حال بازی', verb: 'دارم بازی می‌کنم', icon: '🎮' },
  PLAYED: { label: 'بازی کرده‌ام', verb: 'بازی کرده‌ام', icon: '✓' },
  WANT: { label: 'می‌خواهم بازی کنم', verb: 'می‌خواهم بازی کنم', icon: '★' },
  DROPPED: { label: 'رها کرده‌ام', verb: 'رها کردم', icon: '⏸' },
}

export function normalizeLibraryStatus(value: unknown): LibraryStatus | null {
  const status = String(value || '').toUpperCase()
  return (LIBRARY_STATUSES as readonly string[]).includes(status) ? status as LibraryStatus : null
}

export function cleanHours(value: unknown): number {
  const hours = Math.round(Number(toLatinDigits(String(value ?? '0'))))
  if (!Number.isFinite(hours) || hours < 0) return 0
  return Math.min(hours, 20000)
}

// ------------------------------------------------------------------ codes

export const GAME_MODES = { SINGLE: 'تک‌نفره', MULTI: 'چندنفره', COOP: 'همکاری (Co-op)', ONLINE: 'آنلاین' } as const
export const LOCALIZATIONS = { FA_SUB: 'زیرنویس فارسی', FA_DUB: 'دوبله فارسی', FA_UI: 'منوی فارسی' } as const
export const UPDATE_KINDS = { UPDATE: 'آپدیت', PATCH: 'پچ', DLC: 'DLC / بسته الحاقی', EDITION: 'نسخه ویژه' } as const
export type UpdateKind = keyof typeof UPDATE_KINDS

/** "single, COOP ,x" → "SINGLE, COOP" (known codes only, in declaration order). */
export function normalizeCodes(value: unknown, allowed: Record<string, string>): string {
  const input = Array.isArray(value) ? value.map(String) : String(value || '').split(/[,،|\s]+/)
  const wanted = new Set(input.map((code) => code.trim().toUpperCase()).filter(Boolean))
  return Object.keys(allowed).filter((code) => wanted.has(code)).join(', ')
}

export function codesOf(value: string | null | undefined): string[] {
  return String(value || '').split(',').map((code) => code.trim()).filter(Boolean)
}

export function normalizeUpdateKind(value: unknown): UpdateKind {
  const kind = String(value || '').toUpperCase()
  return kind in UPDATE_KINDS ? kind as UpdateKind : 'UPDATE'
}

// ------------------------------------------------------------------ dates

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹'
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩'
export function toLatinDigits(value: string): string {
  return value.replace(/[۰-۹٠-٩]/g, (d) => String(PERSIAN_DIGITS.indexOf(d) >= 0 ? PERSIAN_DIGITS.indexOf(d) : ARABIC_DIGITS.indexOf(d)))
}

/** "2026-03-01" (or a Date) → Date at 00:00 UTC; throws on an invalid day. */
export function parseDay(value: unknown): Date {
  const raw = value instanceof Date ? value.toISOString().slice(0, 10) : toLatinDigits(String(value || '')).trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new GameError('تاریخ باید به شکل YYYY-MM-DD باشد')
  const date = new Date(`${raw}T00:00:00Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== raw) throw new GameError(`تاریخ نامعتبر: ${raw}`)
  return date
}

export type PlatformRelease = { platform: string; date: string }

/** Per-platform release dates: unique platforms, valid days, sorted by date. */
export function cleanReleases(input: unknown): PlatformRelease[] {
  const list = typeof input === 'string' ? safeJson(input, []) : Array.isArray(input) ? input : []
  const seen = new Set<string>()
  const out: PlatformRelease[] = []
  for (const raw of (list as unknown[]).slice(0, 16)) {
    if (!raw || typeof raw !== 'object') continue
    const platform = String((raw as Record<string, unknown>).platform || '').trim().slice(0, 40)
    const value = (raw as Record<string, unknown>).date
    if (!platform || !value || seen.has(platform.toLowerCase())) continue
    seen.add(platform.toLowerCase())
    out.push({ platform, date: parseDay(value).toISOString().slice(0, 10) })
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

export const STORES = ['Steam', 'Epic Games', 'PlayStation Store', 'Xbox Store', 'Nintendo eShop', 'GOG', 'Google Play', 'App Store', 'سایت رسمی'] as const
export type StoreLink = { store: string; url: string }

/** Official store links: https/http only, one per store, at most 10. */
export function cleanStoreLinks(input: unknown): StoreLink[] {
  const list = typeof input === 'string' ? safeJson(input, []) : Array.isArray(input) ? input : []
  const seen = new Set<string>()
  const out: StoreLink[] = []
  for (const raw of (list as unknown[]).slice(0, 10)) {
    if (!raw || typeof raw !== 'object') continue
    const store = String((raw as Record<string, unknown>).store || '').trim().slice(0, 40)
    const url = String((raw as Record<string, unknown>).url || '').trim().slice(0, 1000)
    if (!store || !url) continue
    let parsed: URL
    try { parsed = new URL(url) } catch { throw new GameError(`نشانی فروشگاه نامعتبر است: ${url.slice(0, 60)}`) }
    if (!['https:', 'http:'].includes(parsed.protocol)) throw new GameError('نشانی فروشگاه باید http یا https باشد')
    if (seen.has(store)) continue
    seen.add(store)
    out.push({ store, url: parsed.toString() })
  }
  return out
}

export type ReleaseState = { state: 'released' | 'upcoming' | 'tba'; days: number | null }

/** Released, coming in N days, or date unknown. Days count whole Tehran days. */
export function releaseState(releaseDate: Date | string | null | undefined, now = new Date()): ReleaseState {
  if (!releaseDate) return { state: 'tba', days: null }
  const at = new Date(releaseDate)
  if (Number.isNaN(at.getTime())) return { state: 'tba', days: null }
  const day = (date: Date) => Date.UTC(...(tehranYmd(date) as [number, number, number]))
  const days = Math.round((day(at) - day(now)) / 86_400_000)
  return days > 0 ? { state: 'upcoming', days } : { state: 'released', days: -days }
}

function tehranYmd(date: Date): [number, number, number] {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date).split('-').map(Number)
  return [parts[0], parts[1] - 1, parts[2]]
}

// ------------------------------------------------------------------ Persian calendar

export { JALALI_MONTHS, jalaliMonthLength, toJalali }

/** The UTC day on which the Jalali date jy/jm/jd falls. */
export function fromJalali(jy: number, jm: number, jd = 1): Date {
  try { return sharedFromJalali(jy, jm, jd) } catch { throw new GameError('تاریخ شمسی نامعتبر است') }
}

export type CalendarMonth = { jy: number; jm: number; key: string; label: string; start: Date; end: Date; prev: string; next: string; days: number; firstWeekday: number }

/**
 * Release-calendar month from "1405-02" (Latin or Persian digits); anything
 * else falls back to the current Tehran month. `end` is exclusive.
 * firstWeekday counts from Saturday (0) like the Persian week.
 */
export function calendarMonth(param: unknown, now = new Date()): CalendarMonth {
  const match = toLatinDigits(String(param || '')).match(/^(\d{4})-(\d{1,2})$/)
  const today = toJalali(new Date(Date.UTC(...tehranYmd(now))))
  let jy = match ? Number(match[1]) : today.jy
  let jm = match ? Number(match[2]) : today.jm
  if (jy < 1300 || jy > 1500 || jm < 1 || jm > 12) { jy = today.jy; jm = today.jm }
  const start = fromJalali(jy, jm, 1)
  const days = jalaliMonthLength(jy, jm)
  const end = new Date(start.getTime() + days * 86_400_000)
  const key = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}`
  return {
    jy, jm, key: key(jy, jm), label: `${JALALI_MONTHS[jm - 1]} ${jy.toLocaleString('fa-IR', { useGrouping: false })}`, start, end, days,
    prev: jm === 1 ? key(jy - 1, 12) : key(jy, jm - 1),
    next: jm === 12 ? key(jy + 1, 1) : key(jy, jm + 1),
    firstWeekday: (start.getUTCDay() + 1) % 7,
  }
}

// ------------------------------------------------------------------ scores

/** Member score on a 10-point scale from the 5-star reviews; editor's value until anyone rates. */
export function memberScore(summary: { average: number; count: number } | null | undefined, fallback: number | null): { value: number | null; count: number } {
  if (summary && summary.count > 0 && summary.average > 0) return { value: Math.round(summary.average * 20) / 10, count: summary.count }
  return { value: fallback, count: 0 }
}

// ------------------------------------------------------------------ content health

export const HEALTH_CHECKS = {
  cover: 'بدون کاور',
  backdrop: 'بدون تصویر پس‌زمینه',
  summary: 'بدون خلاصه',
  review: 'بدون نقد',
  score: 'بدون نمره',
  requirements: 'بدون سیستم مورد نیاز',
  links: 'بدون لینک دانلود',
  screenshots: 'بدون اسکرین‌شات',
  trailer: 'بدون تریلر',
} as const
export type HealthCheck = keyof typeof HEALTH_CHECKS

export type HealthInput = { cover: string; backdrop: string; summary: string; content: string; score: number | null; requirements: string; screenshots: string; trailerUrl: string; platforms: string; releaseDate: Date | null; links: number }

/** What a game page is missing. Upcoming games need no review, score or links yet; only PC games need requirements. */
export function healthIssues(game: HealthInput, now = new Date()): HealthCheck[] {
  const upcoming = releaseState(game.releaseDate, now).state === 'upcoming'
  const requirements = safeJson<{ min?: Record<string, string> }>(game.requirements, {})
  const pc = /(^|,)\s*(pc|windows|mac|linux)\s*(,|$)/i.test(game.platforms)
  const issues: HealthCheck[] = []
  if (!game.cover) issues.push('cover')
  if (!game.backdrop) issues.push('backdrop')
  if (!game.summary.trim()) issues.push('summary')
  if (!upcoming && !game.content.trim()) issues.push('review')
  if (!upcoming && game.score == null) issues.push('score')
  if (pc && !Object.values(requirements.min || {}).some(Boolean)) issues.push('requirements')
  if (!upcoming && game.links === 0) issues.push('links')
  if (safeJson<unknown[]>(game.screenshots, []).length === 0) issues.push('screenshots')
  if (!game.trailerUrl) issues.push('trailer')
  return issues
}

// ------------------------------------------------------------------ portal settings

export const HOME_RAILS = {
  platforms: 'کارت پلتفرم‌ها',
  genres: 'سبک‌ها',
  latest: 'جدیدترین بازی‌ها',
  editors: 'انتخاب سردبیر',
  calendar: 'به‌زودی (تقویم انتشار)',
  reviews: 'نقد و بررسی‌ها',
  popular: 'محبوب‌ترین‌ها',
  wanted: 'موردانتظارترین‌ها (کاربران)',
  franchises: 'مجموعه‌ها',
  news: 'آخرین مطالب بازی',
} as const
export type HomeRail = keyof typeof HOME_RAILS

export type GamesSettings = {
  heroIds: number[]
  rails: { key: HomeRail; enabled: boolean }[]
  /** Legacy Journal selection retained for stored settings compatibility; home lists Games posts. */
  newsKeywords: string[]
  libraryEnabled: boolean
  showMemberScore: boolean
}

export const DEFAULT_GAMES_SETTINGS: GamesSettings = {
  heroIds: [],
  rails: (Object.keys(HOME_RAILS) as HomeRail[]).map((key) => ({ key, enabled: true })),
  newsKeywords: ['بازی', 'گیم', 'game'],
  libraryEnabled: true,
  showMemberScore: true,
}

export function normalizeGamesSettings(input: unknown): GamesSettings {
  const raw = (typeof input === 'string' ? safeJson(input, {}) : input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const ids = Array.isArray(raw.heroIds) ? raw.heroIds.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0) : []
  const seen = new Set<string>()
  const rails: GamesSettings['rails'] = []
  for (const row of Array.isArray(raw.rails) ? raw.rails : []) {
    const key = String((row as Record<string, unknown>)?.key || '')
    if (!Object.hasOwn(HOME_RAILS, key) || seen.has(key)) continue
    seen.add(key)
    rails.push({ key: key as HomeRail, enabled: (row as Record<string, unknown>).enabled !== false })
  }
  for (const key of Object.keys(HOME_RAILS) as HomeRail[]) if (!seen.has(key)) rails.push({ key, enabled: true })
  const keywords = Array.isArray(raw.newsKeywords) ? raw.newsKeywords : typeof raw.newsKeywords === 'string' ? raw.newsKeywords.split(/[,،\n]/) : DEFAULT_GAMES_SETTINGS.newsKeywords
  return {
    heroIds: [...new Set(ids)].slice(0, 8),
    rails,
    newsKeywords: [...new Set(keywords.map((word) => String(word).trim().slice(0, 40)).filter(Boolean))].slice(0, 12),
    libraryEnabled: raw.libraryEnabled !== false,
    showMemberScore: raw.showMemberScore !== false,
  }
}

// ------------------------------------------------------------------ helpers

export function safeJson<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== 'string') return fallback
  try {
    const value = JSON.parse(raw)
    return value === null || value === undefined ? fallback : value as T
  } catch { return fallback }
}

/** Hours to "۴۲ ساعت" or "" for 0. */
export function formatHours(hours: number): string {
  return hours > 0 ? `${hours.toLocaleString('fa-IR')} ساعت` : ''
}
