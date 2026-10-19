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
