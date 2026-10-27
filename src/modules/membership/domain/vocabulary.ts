import type { ListDefinition } from '@/modules/vocabulary/domain/vocabulary'

/**
 * The membership's managed list: the perk lines a VIP plan shows. A plan's perk line names an entry by its code (its
 * text and icon come from the list, so one edit changes every plan) or is its own free text.
 */
export const MEMBERSHIP_LISTS: ListDefinition[] = [
  { section: 'membership', list: 'PERK', title: 'متن مزایای پلن‌ها', one: 'مزیت', icon: '♛', codeRule: 'code', example: 'EARLY_ACCESS',
    hint: 'خط‌های «مزایا» روی کارت هر پلن در صفحهٔ اشتراک ویژه. هر پلن مزیت‌هایش را از این فهرست انتخاب می‌کند؛ تغییر متن یا نماد یک مزیت، همهٔ پلن‌ها را به‌روز می‌کند.',
    codeHint: 'کد انگلیسی با حروف بزرگ و خط زیر (مثلاً EARLY_ACCESS).',
    seeds: [['VIP_POSTS', 'مطالب ویژهٔ مجله', 'Members-only magazine articles'], ['VIP_CINEMA', 'فیلم و سریال ویژهٔ اعضا', 'Members-only films and series'], ['VIP_LINKS', 'لینک‌های دانلود و پخش ویژه', 'Members-only download and stream links'], ['VIP_MUSIC', 'آهنگ و آلبوم ویژهٔ اعضا', 'Members-only songs and albums'], ['HQ_MUSIC', 'موسیقی با کیفیت ۳۲۰', '320 kbps music'], ['MUSIC_DOWNLOAD', 'دانلود آهنگ', 'Song downloads'], ['VIP_SOFTWARE', 'نرم‌افزار ویژهٔ اعضا', 'Members-only software'], ['VIP_GAMES', 'دانلود بازی‌های ویژه', 'Members-only game downloads']] },
]
