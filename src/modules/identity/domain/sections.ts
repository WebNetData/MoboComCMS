// The parts of the site an owner hands to a manager, and the role each choice of them stands for.
// A manager's role holds exactly the permissions of their sections and the right to open the panel; nothing
// here decides access (the permissions do), it only names and assembles them.

export type SiteSection = { id: string; label: string; hint: string; permissions: readonly string[] }

export const SITE_SECTIONS: readonly SiteSection[] = [
  { id: 'businesses', label: 'تجربهٔ خرید', hint: 'کسب‌وکارها، فروشندگان و تجربه‌های مشتریان', permissions: ['businesses.manage'] },
  { id: 'magazine', label: 'مجله', hint: 'نوشته‌ها، دسته‌ها، دیدگاه‌ها و خبرنامه', permissions: ['cms.posts'] },
  { id: 'music', label: 'موزیک', hint: 'آهنگ، آلبوم، هنرمند و پلی‌لیست', permissions: ['music.manage'] },
  { id: 'cinema', label: 'فیلم و سریال', hint: 'عنوان‌ها، فصل‌ها و قسمت‌ها', permissions: ['cinema.manage'] },
  { id: 'games', label: 'بازی', hint: 'بازی‌ها، به‌روزرسانی‌ها و مجموعه‌ها', permissions: ['games.manage'] },
  { id: 'software', label: 'نرم‌افزار', hint: 'نرم‌افزارها و نسخه‌ها', permissions: ['software.manage'] },
  { id: 'store', label: 'فروشگاه', hint: 'محصولات و سفارش‌ها', permissions: ['cms.products', 'orders.manage'] },
  { id: 'forum', label: 'تالار گفتمان', hint: 'مدیر کل تالار: همهٔ انجمن‌ها، گروه‌ها و تنظیمات تالار', permissions: ['forum.moderate'] },
  { id: 'reviews', label: 'امتیازها و نظرها', hint: 'بررسی نظرهای کاربران روی محتوا', permissions: ['reviews.moderate'] },
]

const PANEL = 'dashboard.view'
const SECTION_PERMISSIONS = new Set(SITE_SECTIONS.flatMap((section) => section.permissions))
const known = (ids: readonly string[]) => SITE_SECTIONS.filter((section) => ids.includes(section.id))

/** The sections a list of permissions covers in full. */
export const sectionsOf = (permissions: readonly string[]): string[] =>
  SITE_SECTIONS.filter((section) => section.permissions.every((permission) => permissions.includes(permission))).map((section) => section.id)

/**
 * Whether a role is a plain section-manager role: the panel plus whole sections and nothing else. Only such
 * roles are changed from the section managers page; any other role (support, accounting, full access) is the
 * role form's to change.
 */
export function isSectionRole(permissions: readonly string[]): boolean {
  const rest = permissions.filter((permission) => permission !== PANEL)
  if (!rest.length || rest.some((permission) => !SECTION_PERMISSIONS.has(permission))) return false
  const covered = new Set(known(sectionsOf(rest)).flatMap((section) => section.permissions))
  return rest.every((permission) => covered.has(permission))
}

/** Section ids as given, cleaned: known ones only, each once, in the fixed order. */
export const normalizeSections = (ids: unknown): string[] =>
  Array.isArray(ids) ? SITE_SECTIONS.filter((section) => ids.includes(section.id)).map((section) => section.id) : []

/** The role that stands for a choice of sections: its key, its name and exactly its permissions. */
export function sectionRole(ids: readonly string[]): { name: string; nameFa: string; nameEn: string; permissions: string[] } {
  const sections = known(ids)
  return {
    name: `sections:${sections.map((section) => section.id).join('+')}`,
    nameFa: `مدیر ${sections.map((section) => section.label).join(' و ')}`,
    nameEn: `Manager: ${sections.map((section) => section.id).join(', ')}`,
    permissions: [PANEL, ...new Set(sections.flatMap((section) => section.permissions))],
  }
}
