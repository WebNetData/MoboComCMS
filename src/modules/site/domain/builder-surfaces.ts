/** Closed presentation contexts. Owners still supply authorized content/actions. */
export const BUILDER_SURFACES = ['dashboard', 'account', 'movie', 'series', 'track', 'album', 'game', 'software'] as const
export type BuilderSurface = typeof BUILDER_SURFACES[number]
export const SURFACE_LABELS: Record<BuilderSurface, string> = { account: 'صفحات حساب کاربری', dashboard: 'پیشخوان کاربر', movie: 'فیلم', series: 'سریال', track: 'تک‌آهنگ', album: 'آلبوم', game: 'بازی', software: 'نرم‌افزار' }
export const isBuilderSurface = (value: unknown): value is BuilderSurface => (BUILDER_SURFACES as readonly unknown[]).includes(value)

export const DASHBOARD_PARTS = ['profile', 'shortcuts', 'metrics', 'activity', 'community', 'orders', 'inbox', 'games', 'favorites', 'prompts', 'services'] as const
export type DashboardPart = typeof DASHBOARD_PARTS[number]
export const DASHBOARD_LABELS: Record<DashboardPart, string> = { profile: 'پروفایل و خوشامد', shortcuts: 'دسترسی سریع', metrics: 'آمار و کیف پول', activity: 'فعالیت‌ها', community: 'جامعه و دنبال‌شده‌ها', orders: 'سفارش‌های اخیر', inbox: 'اعلان‌ها و پشتیبانی', games: 'کتابخانهٔ بازی', favorites: 'علاقه‌مندی‌ها', prompts: 'پرامپت‌ها', services: 'سرویس‌های فعال' }

export const DYNAMIC_FIELDS = ['title', 'excerpt', 'cover', 'url', 'author', 'date', 'price', 'kind'] as const
export type DynamicField = typeof DYNAMIC_FIELDS[number]
export type BuilderValues = Partial<Record<DynamicField, string>>
export const DYNAMIC_LABELS: Record<DynamicField, string> = { title: 'عنوان همین محتوا', excerpt: 'توضیح کوتاه', cover: 'تصویر شاخص', url: 'نشانی محتوا', author: 'نویسنده یا سازنده', date: 'تاریخ', price: 'قیمت عمومی', kind: 'نوع محتوا' }

export function surfaceCondition(target: string) { return target === 'all' || /^entry:[1-9]\d{0,8}$/.test(target) }
export function currentSurfaceScore(target: string, entryId?: number) { return target === 'all' ? 1 : /^entry:[1-9]\d{0,8}$/.test(target) && Number(target.slice(6)) === entryId ? 6 : 0 }
