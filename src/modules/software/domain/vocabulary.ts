import type { ListDefinition } from '@/modules/vocabulary/domain/vocabulary'

/** The software section's managed lists. A software title stores its licence code. */
export const SOFTWARE_LISTS: ListDefinition[] = [
  { section: 'software', list: 'LICENSE', title: 'انواع مجوز', one: 'مجوز', icon: '📜', codeRule: 'code', example: 'SUBSCRIPTION',
    hint: '«هزینهٔ دانلود» در صفحه و کارت هر نرم‌افزار، فیلتر مجوز و مقایسه.', codeHint: 'کد انگلیسی با حروف بزرگ و خط زیر (مثلاً SUBSCRIPTION).',
    seeds: [['FREE', 'رایگان', 'Free'], ['FREEMIUM', 'رایگان با امکانات پولی', 'Freemium'], ['TRIAL', 'نسخهٔ آزمایشی', 'Trial'], ['PAID', 'پولی', 'Paid'], ['OPEN_SOURCE', 'متن‌باز', 'Open source']] },
]
