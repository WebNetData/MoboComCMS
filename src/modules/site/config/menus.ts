import { local, translate, type SiteConfig, type SiteLink } from './types'

export const MENU_DEPTH = 5
export const MENU_ITEMS = 120
export const DEFAULT_FOOTER_ACCOUNT: SiteLink[] = [
  { href: '/dashboard/orders', label: local('سفارش‌های من', 'My orders') },
  { href: '/dashboard/wallet', label: local('کیف پول', 'Wallet') },
  { href: '/dashboard/tickets', label: local('تیکت‌های پشتیبانی', 'Support tickets') },
  { href: '/dashboard/profile', label: local('تنظیمات حساب', 'Account settings') },
]
export type PublicMenuLink = { id?: string; href: string; label: string; icon?: string; children?: PublicMenuLink[]; menuDisplay?: 'dropdown' | 'mega'; menuColumns?: 2 | 3 | 4; description?: string }

/** A hidden parent removes the whole branch; the saved tree stays intact. */
export function filterMenu(links: SiteLink[], allowed: (link: SiteLink) => boolean): SiteLink[] {
  return links.filter(link => link.enabled !== false && allowed(link)).map(link => ({ ...link, ...(link.children ? { children: filterMenu(link.children, allowed) } : {}) }))
}

export function localizeMenu(links: SiteLink[], locale: string): PublicMenuLink[] {
  return links.filter(link => link.enabled !== false).map(link => ({ id: link.id, href: link.href, label: translate(link.label, locale), ...(link.icon !== undefined ? { icon: link.icon } : {}), ...(link.menuDisplay ? { menuDisplay: link.menuDisplay } : {}), ...(link.menuColumns ? { menuColumns: link.menuColumns } : {}), ...(link.description ? { description: translate(link.description, locale) } : {}), ...(link.children ? { children: localizeMenu(link.children, locale) } : {}) }))
}

export function flattenMenu(links: PublicMenuLink[]): PublicMenuLink[] {
  return links.flatMap(link => [link, ...flattenMenu(link.children || [])])
}

export function filterSiteMenus<T extends SiteConfig>(site: T, allowed: (link: SiteLink) => boolean): T {
  return { ...site, navigation: filterMenu(site.navigation, allowed), footer: filterMenu(site.footer, allowed), ...(site.footerExplore ? { footerExplore: filterMenu(site.footerExplore, allowed) } : {}), ...(site.footerAccount ? { footerAccount: filterMenu(site.footerAccount, allowed) } : {}) }
}

/** Client editing identity for old flat documents; persisted only on an explicit save. */
export function identifyMenu(links: SiteLink[]): SiteLink[] {
  return links.map(link => ({ ...link, id: link.id || crypto.randomUUID(), ...(link.children ? { children: identifyMenu(link.children) } : {}) }))
}
export function identifySiteMenus(site: SiteConfig): SiteConfig {
  return { ...site, navigation: identifyMenu(site.navigation), footer: identifyMenu(site.footer), ...(site.footerExplore ? { footerExplore: identifyMenu(site.footerExplore) } : {}), ...(site.footerAccount ? { footerAccount: identifyMenu(site.footerAccount) } : {}) }
}

/** A section as menus know it: the addresses it owns and the words it was built with (manifest name, admin title). */
export type MenuSection = { id: string; bases: string[]; defaults: { fa: string[]; en: string[] } }
type Rename = { fa: string; en: string }

/**
 * Menu entries follow a renamed section (Admin › sections) without touching the saved menu: an entry that links into
 * the section and whose text still carries one of its built-in names gets the new name in place of it
 * («موبوکام کلاد» → «ابر موبوکام», «پنل موبوکام کلاد» → «پنل ابر موبوکام»). Text the owner wrote in «منوها» is kept.
 */
export function withSectionMenuNames<T extends SiteConfig>(site: T, sections: MenuSection[], names: Record<string, Rename>): T {
  const active = sections.filter((s) => names[s.id]?.fa || names[s.id]?.en)
  if (!active.length) return site
  const owner = (href: string) => active.find((s) => s.bases.some((base) => href === base || href.startsWith(base + '/') || href.startsWith(base + '?') || href.startsWith(base + '#')))
  const swap = (text: string, olds: string[], next: string) => {
    if (!next || !text) return text
    const sorted = [...olds].filter(Boolean).sort((a, b) => b.length - a.length)
    if (sorted.includes(text.trim())) return next
    // Inside longer text only a name of several words (a proper name like «موبوکام کلاد»), never a common word like «بازی».
    for (const old of sorted) if (old.trim().includes(' ') && text.includes(old)) return text.split(old).join(next)
    return text
  }
  const walk = (links: SiteLink[], inherited?: MenuSection): SiteLink[] => links.map((link) => {
    const section = owner(link.href) || inherited
    const name = section ? names[section.id] : undefined
    const label = section && name ? { ...link.label, fa: swap(link.label.fa, section.defaults.fa, name.fa), en: swap(link.label.en, section.defaults.en, name.en) } : link.label
    return { ...link, label, ...(link.children ? { children: walk(link.children, section) } : {}) }
  })
  return { ...site, navigation: walk(site.navigation), footer: walk(site.footer), ...(site.footerExplore ? { footerExplore: walk(site.footerExplore) } : {}), ...(site.footerAccount ? { footerAccount: walk(site.footerAccount) } : {}) }
}
