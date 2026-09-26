import { db } from '@/platform/database/prisma'
import { getSettings } from '@/modules/settings/server'
import { getPublicPlans } from '@/modules/catalog/server/public-plans'
import type { LandingData } from '@/modules/site/domain/homepage'
import { resolveUsdTomanRateNumber } from '@/modules/billing/domain/rates'
import { telegramConfig } from '@/modules/notifications/server/telegram'
import { getPublicExtensionRuntime } from '@/extensions/server/state'
import { getBuilderMedia, browseSoftware } from '@/modules/media/server/queries'
import { recentThreads } from '@/modules/forum/server/forum'
import type { ShowcaseItem } from '@/modules/site/domain/homepage'

function parseFormFields(value: string) {
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const SHOWCASE_SIZE = 4

async function getShowcase(enabled: (id: string) => boolean): Promise<ShowcaseItem[]> {
  const [albums, movies, games, software, threads] = await Promise.all([
    enabled('music') ? getBuilderMedia('music-albums', SHOWCASE_SIZE) : null,
    enabled('cinema') ? getBuilderMedia('cinema-movies', SHOWCASE_SIZE) : null,
    enabled('games') ? getBuilderMedia('games-new', SHOWCASE_SIZE) : null,
    enabled('software') ? browseSoftware({ page: 1 }).catch(() => null) : null,
    enabled('forum') ? recentThreads(SHOWCASE_SIZE) : null,
  ])
  const items: ShowcaseItem[] = []
  if (albums?.kind === 'albums') for (const album of albums.items) items.push({ kind: 'music', title: album.title, meta: album.artist?.name || '', cover: album.cover, href: `/music/album/${album.slug}`, vip: album.access === 'MEMBERS' })
  if (movies?.kind === 'titles') for (const title of movies.items) items.push({ kind: 'cinema', title: title.title, meta: [title.year, title.imdbRating ? `IMDb ${title.imdbRating}` : ''].filter(Boolean).join(' · '), cover: title.poster, href: `/cinema/${title.slug}`, vip: title.access === 'MEMBERS' })
  if (games?.kind === 'games') for (const game of games.items) items.push({ kind: 'games', title: game.title, meta: game.platforms.slice(0, 3).join(' · '), cover: game.cover, href: `/games/${game.slug}`, vip: game.access === 'MEMBERS' })
  for (const app of software?.items.slice(0, SHOWCASE_SIZE) || []) items.push({ kind: 'software', title: app.title, meta: [app.version && `v${app.version}`, app.platforms.slice(0, 2).join(' · ')].filter(Boolean).join(' · '), cover: app.icon, href: `/software/${app.slug}`, vip: app.access === 'MEMBERS' })
  for (const thread of threads || []) items.push({ kind: 'forum', title: thread.title, meta: thread.board?.title || '', cover: '', href: `/forum/t/${thread.id}`, vip: false })
  return items
}

export async function getLandingData(): Promise<LandingData> {
  const runtime = await getPublicExtensionRuntime().catch(() => ({} as Awaited<ReturnType<typeof getPublicExtensionRuntime>>))
  const enabled = (id: string) => runtime[id]?.enabled !== false
  const disabledPaths = Object.values(runtime).filter((state) => !state.enabled).flatMap((state) => [...(state.paths || [])])
  const [plans, settings, locations, posts, products, forms, telegram, showcase] = await Promise.all([
    getPublicPlans(),
    getSettings(),
    db.mapLocation.findMany({ where: { active: true } }),
    db.post.findMany({
      where: { status: 'PUBLISHED' },
      include: { category: true },
      orderBy: { publishedAt: 'desc' },
      take: 3,
    }),
    db.product.findMany({
      where: { active: true },
      include: { category: true },
      orderBy: [{ featured: 'desc' }, { sortOrder: 'asc' }],
      take: 3,
    }),
    db.siteForm.findMany({ where: { published: true } }),
    telegramConfig().catch(() => null),
    getShowcase(enabled).catch(() => []),
  ])

  return {
    plans: plans.slice(0, 4),
    locations: locations.map((location) => ({
      id: location.id,
      country: location.country,
      countryFa: location.countryFa,
      flag: location.flag,
      lat: location.lat,
      lng: location.lng,
      city: location.city,
    })),
    posts: posts.map((post) => ({
      id: post.id,
      slug: post.slug,
      title: post.title,
      titleEn: post.titleEn,
      excerpt: post.excerpt,
      excerptEn: post.excerptEn,
      cover: post.cover,
      publishedAt: post.publishedAt,
      category: post.category ? { name: post.category.name, nameEn: post.category.nameEn } : null,
    })),
    products: (settings.storeEnabled === 'true' ? products : []).map((product) => ({
      id: product.id,
      slug: product.slug,
      name: product.name,
      nameEn: product.nameEn,
      price: product.price,
      currency: product.currency,
      image: product.image,
      category: product.category ? { name: product.category.name, nameEn: product.category.nameEn } : null,
    })),
    forms: forms.map((form) => ({
      ...form,
      fields: parseFormFields(form.fields),
    })),
    tomanRate: resolveUsdTomanRateNumber(settings.usdRateToman, process.env.FRENZYEX_USD_RATE_TOMAN),
    telegramBot: telegram?.ready ? telegram.username : '',
    showcase,
    disabledPaths,
  }
}
