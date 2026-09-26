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
export interface MiniAppFeed { sections: MiniAppFeedSection[] }
