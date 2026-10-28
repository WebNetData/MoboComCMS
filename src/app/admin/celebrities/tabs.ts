import type { SectionTab } from '../cms/SectionAdmin'

/** The artists' admin pages: the profiles, each section's own people, and the profile fields the owner manages. */
export const CELEBRITY_TABS: SectionTab[] = [
  { href: '/admin/celebrities', label: 'چهره‌ها', exact: true },
  { href: '/admin/celebrities/fields', label: 'فیلدهای پروفایل' },
  { href: '/admin/cinema/people', label: 'بازیگران و کارگردان‌ها' },
  { href: '/admin/music/artists', label: 'خوانندگان و هنرمندان موسیقی' },
]
