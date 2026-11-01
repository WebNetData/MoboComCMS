// The parts of the site an owner hands to a manager, and the role each choice of them stands for.
// A manager's role holds exactly the permissions of their sections and the right to open the panel; nothing
// here decides access (the permissions do), it only names and assembles them.

export type SiteSection = { id: string; label: string; hint: string; permissions: readonly string[] }

export const SITE_SECTIONS: readonly SiteSection[] = [
  { id: 'prompts', label: 'پرامپت مستر', hint: 'الگوها و دسته‌های کتابخانهٔ پرامپت', permissions: ['prompts.manage'] },
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

// ---------------------------------------------------------------------------------------------------- authors
// An author posts in one section and manages only what they posted. The author permission is a second,
// narrower key of the same section, declared by the section's plugin; it is never accepted where the section
// permission is asked, only through `requireContentScope` (identity/server/access.ts), which returns the caller as a manager or as an author held to their own items.

export type AuthorSection = { id: string; label: string; hint: string; permission: string; manage: string }

export const AUTHOR_SECTIONS: readonly AuthorSection[] = [
  { id: 'magazine', label: 'مجله', hint: 'نوشتن و ویرایش نوشته‌های خودش', permission: 'journal.author', manage: 'cms.posts' },
  { id: 'cinema', label: 'فیلم و سریال', hint: 'افزودن و ویرایش عنوان‌های خودش', permission: 'cinema.author', manage: 'cinema.manage' },
  { id: 'music', label: 'موزیک', hint: 'افزودن و ویرایش آهنگ‌ها و آلبوم‌های خودش', permission: 'music.author', manage: 'music.manage' },
  { id: 'games', label: 'بازی', hint: 'افزودن و ویرایش بازی‌های خودش و آپدیت‌هایشان', permission: 'games.author', manage: 'games.manage' },
  { id: 'software', label: 'نرم‌افزار', hint: 'افزودن و ویرایش نرم‌افزارهای خودش', permission: 'software.author', manage: 'software.manage' },
]

export const AUTHOR_PERMISSIONS: readonly string[] = AUTHOR_SECTIONS.map((section) => section.permission)

/** The author permission of the section a manage permission belongs to, if that section has authors. */
export const authorPermissionOf = (manage: string): string | null => AUTHOR_SECTIONS.find((section) => section.manage === manage)?.permission ?? null

/** The sections a list of permissions lets its holder write in as an author. */
export const authorSectionsOf = (permissions: readonly string[]): string[] =>
  AUTHOR_SECTIONS.filter((section) => permissions.includes(section.permission)).map((section) => section.id)

/** Whether a role is a plain author role: the panel plus author permissions and nothing else. */
export function isAuthorRole(permissions: readonly string[]): boolean {
  const rest = permissions.filter((permission) => permission !== PANEL)
  return rest.length > 0 && rest.every((permission) => AUTHOR_PERMISSIONS.includes(permission))
}

/** Author section ids as given, cleaned: known ones only, each once, in the fixed order. */
export const normalizeAuthorSections = (ids: unknown): string[] =>
  Array.isArray(ids) ? AUTHOR_SECTIONS.filter((section) => ids.includes(section.id)).map((section) => section.id) : []

/** The role that stands for being an author of these sections: its key, its name and exactly its permissions. */
export function authorRole(ids: readonly string[]): { name: string; nameFa: string; nameEn: string; permissions: string[] } {
  const sections = AUTHOR_SECTIONS.filter((section) => ids.includes(section.id))
  return {
    name: `authors:${sections.map((section) => section.id).join('+')}`,
    nameFa: `نویسندهٔ ${sections.map((section) => section.label).join(' و ')}`,
    nameEn: `Author: ${sections.map((section) => section.id).join(', ')}`,
    permissions: [PANEL, ...sections.map((section) => section.permission)],
  }
}

