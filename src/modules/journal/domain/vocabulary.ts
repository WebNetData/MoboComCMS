import type { ListDefinition } from '@/modules/vocabulary/domain/vocabulary'
import { FORMAT_FAMILIES } from '@/modules/journal/domain/formats'

/** The magazine's managed lists. A post stores its format code; the format's family decides the post's own fields. */
export const JOURNAL_LISTS: ListDefinition[] = [
  { section: 'journal', list: 'POST_FORMAT', title: 'قالب‌های نوشته', one: 'قالب', icon: '🗂️', codeRule: 'code', example: 'PRODUCT_REVIEW',
    hint: 'نوع هر نوشته و نشان آن در فهرست‌ها. نوع هر قالب فیلدهای مخصوصش را در فرم نوشته باز می‌کند: نقد (امتیاز، نقاط قوت و ضعف، جمع‌بندی)، ویدیو (نشانی ویدیو)، خبر (منبع)، مصاحبه (مهمان).',
    codeHint: 'کد انگلیسی با حروف بزرگ و خط زیر (مثلاً PRODUCT_REVIEW).', families: FORMAT_FAMILIES,
    seeds: [['ARTICLE', 'مقاله', 'Article', 'ARTICLE'], ['NEWS', 'خبر', 'News', 'NEWS'], ['REVIEW', 'نقد و بررسی', 'Review', 'REVIEW'], ['VIDEO', 'ویدیو', 'Video', 'VIDEO'], ['INTERVIEW', 'مصاحبه', 'Interview', 'INTERVIEW'], ['GUIDE', 'آموزش', 'Guide', 'ARTICLE']] },
]
