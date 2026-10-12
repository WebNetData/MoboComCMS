/** Per-type rating dimensions and the verified-experience badge shared by the API, pages and tests. */
import type { ItemType } from '@/modules/content/domain/items'
import { ReviewError } from '@/modules/reviews/domain/reviews'

export type ReviewDimension = { key: string; label: string; labelEn: string; hint: string }

/**
 * What a specialist would score for each kind of item. Keys are stored, so a key is never
 * renamed or reused; a retired key simply stops being shown.
 */
export const REVIEW_DIMENSIONS: Partial<Record<ItemType, readonly ReviewDimension[]>> = {
  business: [
    { key: 'quality', label: 'کیفیت کالا و خدمات', labelEn: 'Quality', hint: 'تطابق کیفیت دریافتی با توضیحات کسب‌وکار' },
    { key: 'support', label: 'برخورد و پشتیبانی', labelEn: 'Support', hint: 'پاسخ‌گویی و رفتار با مشتری' },
    { key: 'delivery', label: 'تحویل و تعهد', labelEn: 'Delivery', hint: 'زمان‌بندی و تطابق با وعده‌ها' },
    { key: 'value', label: 'ارزش خرید', labelEn: 'Value', hint: 'کیفیت در برابر مبلغ پرداخت‌شده' },
  ],
  software: [
    { key: 'features', label: 'امکانات', labelEn: 'Features', hint: 'آنچه لازم دارید را دارد؟' },
    { key: 'usability', label: 'رابط و سادگی کار', labelEn: 'Ease of use', hint: 'یادگیری و کار روزمره با آن' },
    { key: 'performance', label: 'سرعت و سبکی', labelEn: 'Performance', hint: 'سرعت اجرا و مصرف منابع' },
    { key: 'stability', label: 'پایداری', labelEn: 'Stability', hint: 'خطا، هنگ و بسته‌شدن ناگهانی' },
    { key: 'value', label: 'ارزش', labelEn: 'Value', hint: 'در برابر هزینه یا جایگزین‌ها' },
  ],
  game: [
    { key: 'gameplay', label: 'گیم‌پلی', labelEn: 'Gameplay', hint: 'سازوکارها، کنترل و سرگرم‌کنندگی' },
    { key: 'graphics', label: 'گرافیک و طراحی هنری', labelEn: 'Graphics', hint: 'کیفیت بصری و سبک هنری' },
    { key: 'story', label: 'داستان و شخصیت‌ها', labelEn: 'Story', hint: 'روایت، شخصیت‌پردازی و جهان بازی' },
    { key: 'audio', label: 'صدا و موسیقی', labelEn: 'Audio', hint: 'موسیقی، صداگذاری و دوبله' },
    { key: 'performance', label: 'اجرای فنی', labelEn: 'Technical performance', hint: 'نرخ فریم، باگ و بهینه‌سازی' },
    { key: 'replay', label: 'ارزش تکرار', labelEn: 'Replay value', hint: 'محتوای جانبی و دلیل بازگشت' },
  ],
  title: [
    { key: 'story', label: 'داستان و فیلم‌نامه', labelEn: 'Story', hint: 'روایت، ریتم و پایان‌بندی' },
    { key: 'acting', label: 'بازیگری', labelEn: 'Acting', hint: 'نقش‌آفرینی بازیگران' },
    { key: 'directing', label: 'کارگردانی', labelEn: 'Directing', hint: 'انسجام و نگاه کارگردان' },
    { key: 'visuals', label: 'تصویر و جلوه‌ها', labelEn: 'Visuals', hint: 'فیلم‌برداری، طراحی و جلوه‌های ویژه' },
    { key: 'sound', label: 'موسیقی و صدا', labelEn: 'Music and sound', hint: 'موسیقی متن و صداگذاری' },
  ],
  album: [
    { key: 'composition', label: 'آهنگ‌سازی', labelEn: 'Composition', hint: 'ملودی‌ها و ساختار قطعه‌ها' },
    { key: 'performance', label: 'اجرا و آواز', labelEn: 'Performance', hint: 'خوانندگی و نوازندگی' },
    { key: 'lyrics', label: 'ترانه', labelEn: 'Lyrics', hint: 'کلام و مضمون' },
    { key: 'production', label: 'تنظیم و کیفیت ضبط', labelEn: 'Production', hint: 'تنظیم، میکس و مسترینگ' },
    { key: 'cohesion', label: 'انسجام آلبوم', labelEn: 'Cohesion', hint: 'یک‌دستی و چینش قطعه‌ها' },
  ],
  track: [
    { key: 'composition', label: 'ملودی', labelEn: 'Melody', hint: 'ملودی و ساختار قطعه' },
    { key: 'performance', label: 'اجرا و آواز', labelEn: 'Performance', hint: 'خوانندگی و نوازندگی' },
    { key: 'lyrics', label: 'ترانه', labelEn: 'Lyrics', hint: 'کلام و مضمون' },
    { key: 'production', label: 'تنظیم و کیفیت ضبط', labelEn: 'Production', hint: 'تنظیم، میکس و مسترینگ' },
  ],
}

export const dimensionsFor = (type: ItemType): readonly ReviewDimension[] => REVIEW_DIMENSIONS[type] || []

export type ReviewScores = Record<string, number>

/**
 * Optional dimension scores for a type. `undefined` means "not sent" (stored scores are kept),
 * so clients that only know the star rating keep working. Unknown keys and empty values are
 * dropped; a value that is present must be an integer 1–5.
 */
export function normalizeScores(type: ItemType, input: unknown): ReviewScores | undefined {
  if (input === undefined || input === null) return undefined
  if (typeof input !== 'object' || Array.isArray(input)) throw new ReviewError('امتیازهای تخصصی معتبر نیست')
  const raw = input as Record<string, unknown>
  const scores: ReviewScores = {}
  for (const { key } of dimensionsFor(type)) {
    if (!Object.hasOwn(raw, key)) continue
    const value = raw[key]
    if (value === null || value === '' || value === 0) continue
    const score = typeof value === 'number' ? value : typeof value === 'string' && /^\d$/.test(value.trim()) ? Number(value) : NaN
    if (!Number.isInteger(score) || score < 1 || score > 5) throw new ReviewError('هر امتیاز تخصصی باید بین ۱ تا ۵ باشد')
    scores[key] = score
  }
  return scores
}

/** Rounded mean of the given scores, used to suggest the overall stars; null when there are none. */
export function suggestedRating(scores: ReviewScores): number | null {
  const values = Object.values(scores).filter((value) => Number.isInteger(value) && value >= 1 && value <= 5)
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null
}

/** How the site knows the reviewer used the item, strongest first. */
export const EXPERIENCE_KINDS = ['PURCHASE', 'DOWNLOAD', 'WATCH', 'LISTEN'] as const
export type ExperienceKind = typeof EXPERIENCE_KINDS[number]
export const EXPERIENCE_LABEL: Record<ExperienceKind, { label: string; labelEn: string }> = {
  PURCHASE: { label: 'خریدار', labelEn: 'Verified buyer' },
  DOWNLOAD: { label: 'دانلود کرده', labelEn: 'Downloaded' },
  WATCH: { label: 'تماشا کرده', labelEn: 'Watched' },
  LISTEN: { label: 'شنیده', labelEn: 'Listened' },
}
export const isExperienceKind = (value: unknown): value is ExperienceKind => (EXPERIENCE_KINDS as readonly string[]).includes(String(value))

/** Review list orders offered on an item page. */
export const REVIEW_SORTS = ['new', 'helpful', 'high', 'low'] as const
export type ReviewSort = typeof REVIEW_SORTS[number]
export const reviewSort = (value: unknown): ReviewSort => (REVIEW_SORTS as readonly string[]).includes(String(value)) ? value as ReviewSort : 'new'
