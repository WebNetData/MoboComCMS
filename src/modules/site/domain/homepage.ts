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
}

/** Latest entertainment/community item for the homepage showcase section. */
export interface ShowcaseItem {
  kind: 'music' | 'cinema' | 'games' | 'software' | 'forum'
  title: string
  meta: string
  cover: string
  href: string
  vip: boolean
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
}
