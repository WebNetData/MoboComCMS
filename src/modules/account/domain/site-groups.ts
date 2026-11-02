// The site's user groups. The owner's own groups live in UserGroup; every other kind already lives with its owner (a role,
// a VIP plan, a CRM tag, a seller's account, a forum group). A group is named by a key, which says which owner to ask.

export const SITE_GROUP_FAMILIES = [
  { id: 'group', label: 'گروه‌های کاربری' },
  { id: 'role', label: 'نقش‌ها' },
  { id: 'vip', label: 'اشتراک ویژه' },
  { id: 'customers', label: 'خریداران' },
  { id: 'partners', label: 'فروشندگان و نمایندگان' },
  { id: 'crm', label: 'برچسب مشتریان' },
  { id: 'forum', label: 'گروه‌های تالار' },
] as const

export type SiteGroupFamily = (typeof SITE_GROUP_FAMILIES)[number]['id']
export type SiteGroup = { key: string; label: string; family: SiteGroupFamily; count: number }

const KEY = /^(?:vip|buyers|subscribers|sellers|resellers|group:\d{1,9}|role:\d{1,9}|vip-plan:\d{1,9}|forum:\d{1,9}|crm:[^\s:][^:]{0,39})$/u

export const isSiteGroupKey = (value: unknown): value is string => typeof value === 'string' && KEY.test(value)

/** The ids behind one prefix among some keys. */
export const idsOf = (keys: readonly string[], prefix: string) => keys.filter((key) => key.startsWith(`${prefix}:`)).map((key) => Number(key.slice(prefix.length + 1)))
