/** One canonical set of queue kinds and labels; enqueueing never imports execution handlers. */
export const JOB_LABEL: Record<string, string> = {
  'media.transfer': 'انتقال فایل به کتابخانه',
  'cinema.person-publication': 'اعلان اثر تازهٔ عوامل سینما',
  'store.price-drop': 'اعلان کاهش قیمت محصول',
  'store.price-history-baseline': 'ثبت نقطهٔ شروع تاریخچهٔ قیمت محصولات',
  'notification.deliver': 'تحویل اعلان کاربر',
  'notification.digest': 'خلاصهٔ روزانهٔ اعلان‌ها',
  'forum.reputation-recount': 'بازشماری اعتبار اعضای تالار',
  'images.optimize': 'بهینه‌سازی همهٔ تصاویر',
  'images.clear-cache': 'پاک‌کردن کش اندازه‌های تصویر',
  'search.reindex': 'بازسازی کامل نمایهٔ جست‌وجو',
  'cdn.purge': 'پاک‌کردن کش CDN',
  'imports.run': 'ورود گروهی اطلاعات',
  'imports.rollback': 'بازگردانی ورود گروهی اطلاعات',
}
