import type { ListDefinition } from '@/modules/vocabulary/domain/vocabulary'

/**
 * The music section's managed lists. A song or album stores genre names (comma list), an album its release type
 * code, and each credit of a song its role code.
 */
export const MUSIC_LISTS: ListDefinition[] = [
  { section: 'music', list: 'GENRE', title: 'سبک‌ها', one: 'سبک', icon: '🎵', codeRule: 'name', example: 'جز',
    hint: 'روی هر آهنگ و آلبوم، چیپ‌های سبک در صفحهٔ موزیک و فیلتر سبک.', codeHint: 'نامی که روی آهنگ ذخیره و در سایت دیده می‌شود (مثلاً پاپ).',
    seeds: [['پاپ', 'پاپ', 'Pop'], ['رپ فارسی', 'رپ فارسی', 'Persian rap'], ['هیپ هاپ', 'هیپ هاپ', 'Hip hop'], ['سنتی', 'سنتی', 'Traditional'], ['راک', 'راک', 'Rock'], ['تلفیقی', 'تلفیقی', 'Fusion']] },
  { section: 'music', list: 'ALBUM_TYPE', title: 'انواع انتشار', one: 'نوع انتشار', icon: '💿', codeRule: 'code', example: 'REMIX',
    hint: 'نشان نوع روی صفحه و کارت هر آلبوم (آلبوم، ای‌پی، تک‌آهنگ…).', codeHint: 'کد انگلیسی با حروف بزرگ و خط زیر (مثلاً REMIX).',
    seeds: [['ALBUM', 'آلبوم', 'Album'], ['EP', 'ای‌پی', 'EP'], ['SINGLE', 'تک‌آهنگ', 'Single'], ['COMPILATION', 'مجموعه', 'Compilation'], ['LIVE', 'اجرای زنده', 'Live'], ['SOUNDTRACK', 'موسیقی متن', 'Soundtrack']] },
  { section: 'music', list: 'CREDIT_ROLE', title: 'نقش‌های عوامل', one: 'نقش', icon: '🎼', codeRule: 'code', example: 'GUITAR',
    hint: 'عوامل هر آهنگ (آهنگساز، ترانه‌سرا، تنظیم‌کننده…) در صفحهٔ آهنگ و صفحهٔ هر هنرمند.', codeHint: 'کد انگلیسی با حروف بزرگ و خط زیر (مثلاً GUITAR).',
    seeds: [['FEATURED', 'با همراهی', 'Featuring'], ['COMPOSER', 'آهنگساز', 'Composer'], ['LYRICIST', 'ترانه‌سرا', 'Lyricist'], ['ARRANGER', 'تنظیم‌کننده', 'Arranger'], ['MIXING', 'میکس و مستر', 'Mixing & mastering'], ['PRODUCER', 'تهیه‌کننده', 'Producer']] },
]

export type CreditInput = { role: string; artistId: number }

/** A song's credits as the form sends them: a role code and an artist id each, no repeats, at most 30, in order. */
export function cleanCredits(input: unknown): CreditInput[] {
  const out: CreditInput[] = []
  for (const row of Array.isArray(input) ? input : []) {
    const role = String((row as CreditInput)?.role ?? '').trim().toUpperCase()
    const artistId = Number((row as CreditInput)?.artistId)
    if (!/^[A-Z0-9_]{1,40}$/.test(role) || !Number.isSafeInteger(artistId) || artistId < 1) continue
    if (out.some((credit) => credit.role === role && credit.artistId === artistId)) continue
    out.push({ role, artistId })
    if (out.length === 30) break
  }
  return out
}
