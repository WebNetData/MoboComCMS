/** UI addresses only. Authorization and restore behavior stay with each server owner. */
export const CONFIGURATION_FORMS = [
  ['general', 'عمومی', '/admin/settings'], ['forum', 'تالار', '/admin/forum?tab=settings'],
  ['journal', 'مجله', '/admin/journal/settings'], ['cinema', 'فیلم و سریال', '/admin/cinema/settings'],
  ['music', 'موزیک', '/admin/music/settings'], ['games', 'بازی', '/admin/games/settings'], ['software', 'نرم‌افزار', '/admin/software/settings'],
  ['site', 'استودیوی سایت', '/admin/studio'], ['navigation', 'مگامنو', '/admin/menus?tab=sections'], ['media', 'کتابخانه', '/admin/media'],
  ['notifications', 'اعلان‌ها', '/admin/notifications'], ['businesses', 'سیاست کسب‌وکار', '/admin/extensions'],
  ['delivery', 'زمان‌بندی و هزینهٔ ارسال', '/admin/delivery'], ['storefront', 'ویترین فروشگاه', '/admin/store/settings'],
  ['returns', 'لغو و مرجوعی', '/admin/store/returns'], ['watermark', 'واترمارک تصاویر', '/admin/watermark'],
  ['profile-fields', 'فیلدهای ثبت‌نام', '/admin/profile-fields'], ['trust-seals', 'نمادهای اعتماد', '/admin/trust-seals'],
  ['seo', 'مرکز سئو', '/admin/seo'], ['livechat', 'پشتیبانی آنلاین', '/admin/chat'], ['maintenance', 'حالت تعمیر بخش‌ها', '/admin/maintenance'],
  ['human-check', 'کپچا و محافظت فرم‌ها', '/admin/security'],
  ['section-access', 'دسترسی گروه‌ها به بخش‌ها', '/admin/user-groups'],
] as const
export type ConfigurationSection = typeof CONFIGURATION_FORMS[number][0]
export const configurationForms: Record<string, { label: string; href: string }> = Object.fromEntries(CONFIGURATION_FORMS.map(([section, label, href]) => [`settings-${section}`, { label, href }]))
export function configurationHistoryForHref(href: string) {
  // The Extensions index hosts many different owners; its whole configuration has no single restore.
  // Business policy keeps its history link inside the actual Business card.
  if (href.split('?')[0] === '/admin/extensions') return null
  const form = CONFIGURATION_FORMS.find(([, , address]) => address.split('?')[0] === href.split('?')[0])
  return form ? `/admin/history?type=settings-${form[0]}&id=1` : null
}
