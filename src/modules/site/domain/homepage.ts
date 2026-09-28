import type { PublicPlan } from '@/modules/catalog/domain/public-plan'
import type { FormDefinition } from '@/modules/site/config/forms'

export interface LandingLocation {
  id: number
  country: string
  countryFa: string
  flag: string
  lat: number
  lng: number
  city: string
}

export interface LandingCategory {
  name: string
  nameEn: string
}

export interface LandingPost {
  id: number
  slug: string
  title: string
  titleEn: string
  excerpt: string
  excerptEn: string
  cover: string
  publishedAt: Date
  category: LandingCategory | null
}

export interface LandingProduct {
  id: number
  slug: string
  name: string
  nameEn: string
  price: number
  currency: string
  image: string
  category: LandingCategory | null
  /** Struck-through list price when on sale (0 = no discount). */
  listPrice?: number
}

/** Latest entertainment/community item for the homepage showcase section. */
export interface ShowcaseItem {
  kind: 'music' | 'cinema' | 'games' | 'software' | 'forum'
  title: string
  meta: string
  cover: string
  href: string
  vip: boolean
  /** Wide artwork (game/film backdrop) for hero tiles, when the item has one. */
  image?: string
  /** Critic score / rating shown on the tile (0–100 or IMDb ×10). */
  score?: number | null
}

/** A section's size, for the homepage's live counters. */
export interface LandingStat { key: string; label: string; value: number; href: string }

/** Public community highlights for the homepage. */
export interface LandingCommunity {
  posts: { id: number; text: string; image: string; likes: number; comments: number; createdAt: string; author: { name: string; username: string; avatar: string; avatarColor: string; verified: boolean } }[]
  members: { name: string; username: string; avatar: string; avatarColor: string; verified: boolean; followers: number }[]
  total: number
}

export interface LandingData {
  plans: PublicPlan[]
  locations: LandingLocation[]
  posts: LandingPost[]
  products: LandingProduct[]
  forms: FormDefinition[]
  tomanRate: number
  /** Public Telegram bot handle (without @) that opens the mini app, or ''. */
  telegramBot: string
  /** Newest items per enabled media/community module. */
  showcase: ShowcaseItem[]
  /** Public path prefixes of switched-off modules; themes hide links into them. */
  disabledPaths: string[]
  /** Item counts of the enabled sections (optional; newer cores only). */
  stats?: LandingStat[]
  /** Community posts and members (optional; community module on). */
  community?: LandingCommunity | null
}
