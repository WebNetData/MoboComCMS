import type { ShellGroup } from '@/components/shell/ShellNav'

export type ControlGroup = ShellGroup & { part: string; area: string }

export interface ControlArea { id: string; title: string; titleEn: string; icon: string; hint: string; hintEn: string }

/** The areas of the admin in menu order: home, then by the job they serve. Links and permissions stay with their groups. */
export const CONTROL_AREAS: readonly ControlArea[] = [
  { id: 'home', title: 'پیشخوان', titleEn: 'Home', icon: 'home', hint: 'نمای کلی و کارهای امروز', hintEn: 'Overview and today\'s work' },
  { id: 'content', title: 'محتوا', titleEn: 'Content', icon: 'layers', hint: 'مجله، فیلم، موزیک، بازی و نرم‌افزار', hintEn: 'Magazine, film, music, games and software' },
  { id: 'ai', title: 'هوش مصنوعی', titleEn: 'AI', icon: 'sparkles', hint: 'دستیارها، تولید محتوا، اتصال سرویس‌ها و پایش', hintEn: 'Assistants, generation, providers and monitoring' },
  { id: 'community', title: 'جامعه', titleEn: 'Community', icon: 'users', hint: 'تالار، پروفایل‌ها و نظرها', hintEn: 'Forum, profiles and reviews' },
  { id: 'commerce', title: 'فروش', titleEn: 'Sales', icon: 'bag', hint: 'فروش حضوری، فروشگاه، سفارش‌ها، خدمات و اشتراک‌ها', hintEn: 'In-store, store, orders, services and memberships' },
  { id: 'finance', title: 'مالی', titleEn: 'Finance', icon: 'wallet', hint: 'صورتحساب، پرداخت و درگاه‌ها', hintEn: 'Invoices, payments and gateways' },
  { id: 'people', title: 'کاربران', titleEn: 'People', icon: 'user', hint: 'کاربران، تیم و پشتیبانی', hintEn: 'Users, team and support' },
  { id: 'marketing', title: 'بازاریابی', titleEn: 'Marketing', icon: 'megaphone', hint: 'سئو، تخفیف، پیام‌رسانی و تبلیغات', hintEn: 'SEO, offers, messaging and ads' },
  { id: 'website', title: 'ظاهر سایت', titleEn: 'Website', icon: 'palette', hint: 'برند، صفحه‌ها، منوها و فرم‌ها', hintEn: 'Brand, pages, menus and forms' },
  { id: 'system', title: 'سیستم', titleEn: 'System', icon: 'sliders', hint: 'تنظیمات، امنیت، افزونه‌ها و سرور', hintEn: 'Settings, security, extensions and server' },
]

/** The areas this person has something in, each with its groups. */
export function controlAreas(groups: ControlGroup[]) {
  return CONTROL_AREAS.flatMap(area => {
    const own = groups.filter(group => group.area === area.id)
    return own.length ? [{ ...area, groups: own.map(group => ({ ...group, caption: undefined })) }] : []
  })
}

const searchable = (value: string) => value.normalize('NFKC').replace(/ي/g, 'ی').replace(/ك/g, 'ک').toLocaleLowerCase().trim()

/** Presentation only: the Admin layout has already applied the canonical permissions and module state. */
export function searchControlGroups(groups: ControlGroup[], query: string, part = ''): ControlGroup[] {
  const words = searchable(query).split(/\s+/).filter(Boolean)
  let previous = ''
  return groups.flatMap(group => {
    if (part && group.part !== part) return []
    const items = group.items.filter(item => words.every(word => searchable(`${item.label} ${item.href} ${group.title} ${group.part}`).includes(word)))
    if (!items.length) return []
    const caption = group.part && group.part !== previous ? group.part : undefined
    previous = group.part
    return [{ ...group, items, caption }]
  })
}
