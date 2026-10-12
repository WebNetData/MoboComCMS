import { pathDisabled, type ExtensionPublicState } from '@/platform/extensions/contracts'
import type { LocalText, SiteConfig } from './types'

// What the owner wrote for the site (menus, the announcement bar, the home page's sections) keeps pointing at
// a module after it is switched off. Nothing stored is changed: the public copy of the config simply leaves
// those parts out, and they are back the moment the module is switched on again.

type Runtime = Readonly<Record<string, ExtensionPublicState>>

/** How a switched-off module is spoken of where there is no link to go by (a FAQ entry, a heading). */
const SPOKEN: { path: string; words: RegExp }[] = [
  { path: '/vip', words: /VIP|وی[‌ ]?آی[‌ ]?پی|اشتراک ویژه|عضویت ویژه|اعضای ویژه/i },
]

export function hideDisabledModules<T extends SiteConfig>(site: T, runtime: Runtime): T {
  const off = (href: string | undefined) => !!href && pathDisabled(href, runtime)
  const words = SPOKEN.filter((entry) => pathDisabled(entry.path, runtime)).map((entry) => entry.words)
  const speaks = (...texts: (LocalText | undefined)[]) => words.length > 0 && texts.some((text) => !!text && Object.values(text).some((value) => typeof value === 'string' && words.some((word) => word.test(value))))
  const announcement = off(site.announcement.link.href) || speaks(site.announcement.text, site.announcement.link.label) ? { ...site.announcement, enabled: false } : site.announcement
  return {
    ...site,
    announcement,
    navigation: site.navigation.filter((link) => !off(link.href) && !speaks(link.label)),
    footer: site.footer.filter((link) => !off(link.href) && !speaks(link.label)),
    sections: site.sections.map((section) => {
      // A section that is about the module (its heading says so, or it is a call to action leading there) goes whole.
      if (speaks(section.eyebrow, section.title) || (section.kind === 'cta' && off(section.action.href))) return { ...section, enabled: false }
      const items = section.items.filter((item) => !off(item.href) && !speaks(item.title))
      const action = off(section.action.href) ? { label: Object.fromEntries(Object.keys(section.action.label).map((key) => [key, ''])) as LocalText, href: '' } : section.action
      return items.length === section.items.length && action === section.action ? section : { ...section, items, action }
    }),
  }
}
