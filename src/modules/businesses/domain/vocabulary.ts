import type { ListDefinition } from '@/modules/vocabulary/domain/vocabulary'

/** The businesses' managed list: a business stores its category (field of activity) by name, as profiles already do. */
export const BUSINESS_LISTS: ListDefinition[] = [
  { section: 'businesses', list: 'CATEGORY', title: 'زمینه‌های فعالیت', one: 'زمینهٔ فعالیت', icon: '🏷️', codeRule: 'name', example: 'لوازم خانگی',
    hint: 'زمینهٔ فعالیت هر کسب‌وکار، فیلتر «زمینه» در فهرست کسب‌وکارها و فرم معرفی کسب‌وکار توسط اعضا.', codeHint: 'نامی که روی کسب‌وکار ذخیره و در سایت دیده می‌شود (مثلاً فروشگاه اینترنتی).',
    seeds: [['فروشگاه اینترنتی', 'فروشگاه اینترنتی', 'Online shop'], ['موبایل و لوازم دیجیتال', 'موبایل و لوازم دیجیتال', 'Mobile & electronics'], ['پوشاک و مد', 'پوشاک و مد', 'Fashion'], ['خدمات اینترنت و میزبانی', 'خدمات اینترنت و میزبانی', 'Internet & hosting'], ['نرم‌افزار و اپلیکیشن', 'نرم‌افزار و اپلیکیشن', 'Software & apps'], ['خدمات مالی و پرداخت', 'خدمات مالی و پرداخت', 'Finance & payments'], ['آموزش', 'آموزش', 'Education'], ['سفر و گردشگری', 'سفر و گردشگری', 'Travel'], ['غذا و رستوران', 'غذا و رستوران', 'Food & restaurants'], ['سلامت و زیبایی', 'سلامت و زیبایی', 'Health & beauty']] },
]
