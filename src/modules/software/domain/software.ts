// Software section rules: home layout settings and catalogue health. Pure —
// shared by the admin API, the public portal and tests.

import { clampInt, normalizeIds, normalizeRails, parseSettingsInput } from '@/shared/section-layout'

export const SOFTWARE_RAILS = {
  stats: 'نوار آمار بالای صفحه',
  tiles: 'کاشی‌های دسته‌بندی',
  news: 'اخبار فناوری (از مجله)',
  latest: 'جدیدترین نرم‌افزارها',
  categoryShelves: 'قفسهٔ هر دستهٔ اصلی',
  vipStrip: 'نوار دعوت به اشتراک ویژه',
} as const
export type SoftwareRail = keyof typeof SOFTWARE_RAILS

export type SoftwareSettings = {
  rails: { key: SoftwareRail; enabled: boolean }[]
  /** Titles per shelf. */
  shelfSize: number
  /** How many main categories get their own shelf. */
  categoryShelfCount: number
  newsCount: number
  /** Hand-picked «پیشنهاد سردبیر» sidebar list; empty = featured, then most downloaded. */
  suggestionIds: number[]
  /** A version older than this many days is flagged «نیاز به به‌روزرسانی» in the admin. */
  staleDays: number
}

export const DEFAULT_SOFTWARE_SETTINGS: SoftwareSettings = {
  rails: (Object.keys(SOFTWARE_RAILS) as SoftwareRail[]).map((key) => ({ key, enabled: true })),
  shelfSize: 8,
  categoryShelfCount: 4,
  newsCount: 5,
  suggestionIds: [],
  staleDays: 180,
}

export function normalizeSoftwareSettings(input: unknown): SoftwareSettings {
  const raw = parseSettingsInput(input)
  const d = DEFAULT_SOFTWARE_SETTINGS
  return {
    rails: normalizeRails(raw.rails, SOFTWARE_RAILS),
    shelfSize: clampInt(raw.shelfSize, 4, 16, d.shelfSize),
    categoryShelfCount: clampInt(raw.categoryShelfCount, 0, 8, d.categoryShelfCount),
    newsCount: clampInt(raw.newsCount, 3, 10, d.newsCount),
    suggestionIds: normalizeIds(raw.suggestionIds, 10),
    staleDays: clampInt(raw.staleDays, 30, 730, d.staleDays),
  }
}

export const SOFTWARE_HEALTH = {
  icon: 'بدون آیکون',
  version: 'بدون شمارهٔ نسخه',
  summary: 'بدون خلاصه',
  content: 'بدون معرفی کامل',
  screenshots: 'بدون تصویر',
  links: 'بدون لینک دانلود',
  platforms: 'بدون پلتفرم',
  size: 'بدون حجم فایل',
  stale: 'نسخهٔ قدیمی',
} as const
export type SoftwareHealth = keyof typeof SOFTWARE_HEALTH

export type SoftwareHealthInput = { icon: string; version: string; summary: string; content: string; screenshots: string; platforms: string; size: string; links: number; releasedAt: Date | null; updatedAt: Date }

const hasShots = (raw: string) => { try { const list = JSON.parse(raw); return Array.isArray(list) && list.some((shot) => shot && typeof shot.src === 'string' && shot.src.trim()) } catch { return false } }

export function softwareIssues(title: SoftwareHealthInput, now: Date, staleDays: number): SoftwareHealth[] {
  const issues: SoftwareHealth[] = []
  if (!title.icon.trim()) issues.push('icon')
  if (!title.version.trim()) issues.push('version')
  if (title.summary.trim().length < 30) issues.push('summary')
  if (title.content.replace(/<[^>]*>/g, '').trim().length < 120) issues.push('content')
  if (!hasShots(title.screenshots)) issues.push('screenshots')
  if (!title.links) issues.push('links')
  if (!title.platforms.trim()) issues.push('platforms')
  if (!title.size.trim()) issues.push('size')
  if (isStale(title, now, staleDays)) issues.push('stale')
  return issues
}

/** Stale = the version date (or last edit when unknown) is older than the window. */
export function isStale(title: { releasedAt: Date | null; updatedAt: Date }, now: Date, staleDays: number) {
  const at = title.releasedAt || title.updatedAt
  return now.getTime() - at.getTime() > staleDays * 86_400_000
}
