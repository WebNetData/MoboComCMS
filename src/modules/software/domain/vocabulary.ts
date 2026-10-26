import type { ListDefinition } from '@/modules/vocabulary/domain/vocabulary'

/** Families of software platforms: they decide which of a title's fields apply (system requirements or app stores). */
export const PLATFORM_FAMILIES: [string, string][] = [['DESKTOP', 'دسکتاپ'], ['MOBILE', 'موبایل'], ['WEB', 'وب']]

/**
 * The software section's managed lists. A software title stores its licence code, its platform names (comma list)
 * and, for a mobile app, the app stores it is on.
 */
export const SOFTWARE_LISTS: ListDefinition[] = [
  { section: 'software', list: 'LICENSE', title: 'انواع مجوز', one: 'مجوز', icon: '📜', codeRule: 'code', example: 'SUBSCRIPTION',
    hint: '«هزینهٔ دانلود» در صفحه و کارت هر نرم‌افزار، فیلتر مجوز و مقایسه.', codeHint: 'کد انگلیسی با حروف بزرگ و خط زیر (مثلاً SUBSCRIPTION).',
    seeds: [['FREE', 'رایگان', 'Free'], ['FREEMIUM', 'رایگان با امکانات پولی', 'Freemium'], ['TRIAL', 'نسخهٔ آزمایشی', 'Trial'], ['PAID', 'پولی', 'Paid'], ['OPEN_SOURCE', 'متن‌باز', 'Open source']] },
  { section: 'software', list: 'PLATFORM', title: 'پلتفرم‌ها', one: 'پلتفرم', icon: '🖥️', codeRule: 'name', example: 'HarmonyOS',
    hint: 'روی هر نرم‌افزار، فیلتر و درخت پلتفرم. نوع پلتفرم تعیین می‌کند فرم نرم‌افزار کدام فیلدها را بخواهد: دسکتاپ (سیستم مورد نیاز، آموزش نصب، رمز فایل) یا موبایل (شناسهٔ بسته، حداقل سیستم‌عامل، فروشگاه‌ها).',
    codeHint: 'نامی که روی نرم‌افزار ذخیره و در سایت دیده می‌شود (مثلاً Windows).', families: PLATFORM_FAMILIES,
    seeds: [['Windows', 'Windows', 'Windows', 'DESKTOP'], ['macOS', 'macOS', 'macOS', 'DESKTOP'], ['Linux', 'Linux', 'Linux', 'DESKTOP'], ['Android', 'Android', 'Android', 'MOBILE'], ['iOS', 'iOS', 'iOS', 'MOBILE']] },
  { section: 'software', list: 'APP_STORE', title: 'فروشگاه‌های اپلیکیشن', one: 'فروشگاه', icon: '🛍️', codeRule: 'name', example: 'Galaxy Store',
    hint: 'دکمه‌های «دریافت از فروشگاه» در صفحهٔ اپلیکیشن‌های موبایل.', codeHint: 'نام انگلیسی فروشگاه که روی نرم‌افزار ذخیره می‌شود (مثلاً Myket).',
    seeds: [['Google Play', 'گوگل‌پلی', 'Google Play'], ['App Store', 'اپ‌استور', 'App Store'], ['Cafe Bazaar', 'کافه‌بازار', 'Cafe Bazaar'], ['Myket', 'مایکت', 'Myket']] },
]

/** Which families a title's platforms are, by the list's entries; unknown names count as none. */
export function platformFamilies(platforms: unknown, entries: { code: string; family: string }[]): Set<string> {
  const byName = new Map(entries.map((entry) => [entry.code.toLowerCase(), entry.family]))
  const names = Array.isArray(platforms) ? platforms.map(String) : String(platforms ?? '').split(/[,،|]/)
  return new Set(names.map((name) => byName.get(name.trim().toLowerCase()) || '').filter(Boolean))
}
