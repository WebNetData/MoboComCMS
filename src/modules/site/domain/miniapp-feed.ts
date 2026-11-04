import type { SiteSection } from '@/modules/site/config/types'

/** Kinds that appear on the mini app home until the admin decides otherwise. */
const MINIAPP_DEFAULT_KINDS: ReadonlySet<SiteSection['kind']> = new Set(['hero', 'posts'])
/** Kinds the mini app knows how to render; the rest are website-only. */
export const MINIAPP_KINDS: ReadonlySet<SiteSection['kind']> = new Set(['hero', 'features', 'plans', 'posts', 'steps', 'faq', 'cta'])

export function showsInMiniApp(section: Pick<SiteSection, 'kind' | 'miniapp'>) {
  return section.miniapp ?? MINIAPP_DEFAULT_KINDS.has(section.kind)
}

export interface MiniAppFeedItem { title: string; text: string; icon: string; href: string }
export interface MiniAppFeedPlan { id: number; name: string; days: number; trafficGB: number; price: number; currency: string; featured: boolean }
export interface MiniAppFeedPost { slug: string; title: string; excerpt: string; cover: string }
export interface MiniAppFeedSection {
  id: string
  kind: SiteSection['kind']
  eyebrow: string
  title: string
  description: string
  action: { href: string; label: string } | null
  items: MiniAppFeedItem[]
  plans?: MiniAppFeedPlan[]
  posts?: MiniAppFeedPost[]
}
/** A site section the mini app links to (only those switched on and not in maintenance). */
export interface MiniAppSection { key: string; label: string; href: string; icon: string; count: number }
export interface MiniAppProduct { slug: string; name: string; price: number; listPrice: number; currency: string; image: string; category: string }
export interface MiniAppShowcase { kind: 'music' | 'cinema' | 'games' | 'software' | 'forum'; title: string; meta: string; cover: string; href: string; vip: boolean }
/** What the mini app shows of the whole platform: its sections and the newest items of each, from the homepage's data. */
export interface MiniAppDiscover { sections: MiniAppSection[]; products: MiniAppProduct[]; showcase: MiniAppShowcase[]; posts: MiniAppFeedPost[] }
export interface MiniAppFeed { sections: MiniAppFeedSection[]; discover?: MiniAppDiscover }

/** The default shelf represents every available module, rather than letting the first module fill it. */
export function miniAppHighlights(items: readonly MiniAppShowcase[], limit: number): MiniAppShowcase[] {
  const groups = new Map<MiniAppShowcase['kind'], MiniAppShowcase[]>()
  for (const item of items) { const group = groups.get(item.kind) || []; group.push(item); groups.set(item.kind, group) }
  const out: MiniAppShowcase[] = []
  for (let index = 0; out.length < limit; index++) {
    let found = false
    for (const group of groups.values()) if (group[index] && out.length < limit) { out.push(group[index]); found = true }
    if (!found) break
  }
  return out
}

const SECTIONS: { key: string; fa: string; en: string; href: string; icon: string; stat?: string }[] = [
  { key: 'store', fa: 'فروشگاه', en: 'Shop', href: '/products', icon: 'store', stat: 'products' },
  { key: 'blog', fa: 'مجله', en: 'Magazine', href: '/blog', icon: 'book' },
  { key: 'music', fa: 'موسیقی', en: 'Music', href: '/music', icon: 'music', stat: 'music' },
  { key: 'cinema', fa: 'فیلم و سریال', en: 'Movies & series', href: '/cinema', icon: 'film', stat: 'cinema' },
  { key: 'games', fa: 'بازی', en: 'Games', href: '/games', icon: 'gamepad', stat: 'games' },
  { key: 'software', fa: 'نرم‌افزار', en: 'Software', href: '/software', icon: 'devices', stat: 'software' },
  { key: 'forum', fa: 'انجمن', en: 'Forum', href: '/forum', icon: 'chat', stat: 'forum' },
  { key: 'prompts', fa: 'پرامپت', en: 'Prompts', href: '/prompts', icon: 'sparkles' },
  { key: 'people', fa: 'جامعه', en: 'Community', href: '/people', icon: 'users', stat: 'members' },
  { key: 'celebrities', fa: 'چهره‌ها', en: 'Celebrities', href: '/celebrities', icon: 'star' },
  { key: 'businesses', fa: 'کسب‌وکارها', en: 'Businesses', href: '/businesses', icon: 'bag' },
  { key: 'vip', fa: 'VIP', en: 'VIP', href: '/vip', icon: 'crown' },
]

/** The platform's sections in the mini app: those whose address no switched-off or closed module owns, with their size. */
export function miniAppSections(disabledPaths: readonly string[], stats: readonly { key: string; value: number }[], fa: boolean): MiniAppSection[] {
  const count = new Map(stats.map((stat) => [stat.key, stat.value]))
  return SECTIONS.filter((section) => miniAppPathOpen(section.href, disabledPaths)).map((section) => ({
    key: section.key, label: fa ? section.fa : section.en, href: section.href, icon: section.icon, count: Math.max(0, (section.stat && count.get(section.stat)) || 0),
  }))
}

/** Segment-aware: closing /music does not close /musical. Empty paths do not close the site. */
export function miniAppPathOpen(href: string, disabledPaths: readonly string[]): boolean {
  const path = href.split(/[?#]/, 1)[0]
  return !disabledPaths.some((base) => {
    const normalized = base.replace(/\/+$/, '')
    return base === '/' || (normalized && (path === normalized || path.startsWith(`${normalized}/`)))
  })
}
