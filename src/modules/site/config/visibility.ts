import { pathDisabled, type ExtensionPublicState } from '@/platform/extensions/contracts'
import type { LocalText, SiteConfig } from './types'
import { filterSiteMenus } from './menus'

// What the owner wrote for the site (menus, the announcement bar, the home page's sections) keeps pointing at
// a module after it is switched off. Nothing stored is changed: the public copy of the config simply leaves
// those parts out, and they are back the moment the module is switched on again.

type Runtime = Readonly<Record<string, ExtensionPublicState>>

/** The shared people directory belongs to both Music and Cinema, not a second module. */
export function siteLinkDisabled(href: string, runtime: Runtime): boolean {
  if (pathDisabled(href, runtime)) return true
  if (!/^\/celebrities(?:[/?#]|$)/.test(href)) return false
  const musicOff = pathDisabled('/music', runtime), cinemaOff = pathDisabled('/cinema', runtime)
  if (musicOff && cinemaOff) return true
  const params = new URL(href, 'https://navigation.invalid').searchParams, role = params.get('role') || ''
  return musicOff && (params.get('section') === 'music' || role === 'singer' || role.startsWith('credit-'))
    || cinemaOff && (params.get('section') === 'cinema' || ['actor', 'director', 'producer'].includes(role))
}

/** How a switched-off module is spoken of where there is no link to go by (a FAQ entry, a heading). */
const SPOKEN: { path: string; words: RegExp }[] = [
  { path: '/vip', words: /VIP|وی[‌ ]?آی[‌ ]?پی|اشتراک ویژه|عضویت ویژه|اعضای ویژه/i },
]

export function hideDisabledModules<T extends SiteConfig>(site: T, runtime: Runtime): T {
  const off = (href: string | undefined) => !!href && siteLinkDisabled(href, runtime)
  const words = SPOKEN.filter((entry) => pathDisabled(entry.path, runtime)).map((entry) => entry.words)
  const speaks = (...texts: (LocalText | undefined)[]) => words.length > 0 && texts.some((text) => !!text && Object.values(text).some((value) => typeof value === 'string' && words.some((word) => word.test(value))))
  const announcement = off(site.announcement.link.href) || speaks(site.announcement.text, site.announcement.link.label) ? { ...site.announcement, enabled: false } : site.announcement
  return {
    ...filterSiteMenus(site, (link) => !off(link.href) && !speaks(link.label)),
    announcement,
    sections: site.sections.map((section) => {
      // A section that is about the module (its heading says so, or it is a call to action leading there) goes whole.
      if (speaks(section.eyebrow, section.title) || (section.kind === 'cta' && off(section.action.href))) return { ...section, enabled: false }
      const items = section.items.filter((item) => !off(item.href) && !speaks(item.title))
      const action = off(section.action.href) ? { label: Object.fromEntries(Object.keys(section.action.label).map((key) => [key, ''])) as LocalText, href: '' } : section.action
      return items.length === section.items.length && action === section.action ? section : { ...section, items, action }
    }),
  }
}
