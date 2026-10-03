import { db } from '@/platform/database/prisma'
import { legacyNumber, normalizeCurrency } from '@/shared/money'
import { getSettings } from '@/modules/settings/server'
import { getPublicPlans } from '@/modules/catalog/server/public-plans'
import type { LandingData } from '@/modules/site/domain/homepage'
import { resolveUsdTomanRateNumber } from '@/modules/billing/domain/rates'
import { telegramConfig } from '@/modules/notifications/server/telegram'
import { getPublicExtensionRuntime } from '@/extensions/server/state'
import { getBuilderMedia, browseSoftware } from '@/modules/media/server/queries'
import { recentThreads } from '@/modules/forum/server/forum'
import type { LandingCommunity, LandingStat, ShowcaseItem } from '@/modules/site/domain/homepage'
import { plainText } from '@/shared/text/plain'
import { parseForm, publicForm } from '@/modules/forms/domain/forms'
import { livePostWhere } from '@/modules/journal/domain/journal'
import { publicProductWhere } from '@/modules/catalog/domain/product-publication'

const SHOWCASE_SIZE = 8

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
  if (movies?.kind === 'titles') for (const title of movies.items) items.push({ kind: 'cinema', title: title.title, meta: [title.year, title.imdbRating ? `IMDb ${title.imdbRating}` : ''].filter(Boolean).join(' · '), cover: title.poster, href: `/cinema/${title.slug}`, vip: title.access === 'MEMBERS', image: title.backdrop, score: title.imdbRating ? Math.round(title.imdbRating * 10) : null })
  if (games?.kind === 'games') for (const game of games.items) items.push({ kind: 'games', title: game.title, meta: game.platforms.slice(0, 3).join(' · '), cover: game.cover, href: `/games/${game.slug}`, vip: game.access === 'MEMBERS', image: game.backdrop, score: game.score })
  for (const app of software?.items.slice(0, SHOWCASE_SIZE) || []) items.push({ kind: 'software', title: app.title, meta: [app.version && `v${app.version}`, app.platforms.slice(0, 2).join(' · ')].filter(Boolean).join(' · '), cover: app.icon, href: `/software/${app.slug}`, vip: app.access === 'MEMBERS' })
  for (const thread of threads || []) items.push({ kind: 'forum', title: thread.title, meta: thread.board?.title || '', cover: '', href: `/forum/t/${thread.id}`, vip: false })
  return items
}

const live = () => ({ status: 'PUBLISHED', publishedAt: { lte: new Date() } })

async function getStats(enabled: (id: string) => boolean): Promise<LandingStat[]> {
  const safe = (p: Promise<number>) => p.catch(() => 0)
  const [products, games, titles, tracks, software, threads, members] = await Promise.all([
    enabled('store') ? safe(db.product.count({ where: publicProductWhere })) : 0,
    enabled('games') ? safe(db.gameTitle.count({ where: live() })) : 0,
    enabled('cinema') ? safe(db.cinemaTitle.count({ where: live() })) : 0,
    enabled('music') ? safe(db.musicTrack.count({ where: live() })) : 0,
    enabled('software') ? safe(db.softwareTitle.count({ where: live() })) : 0,
    enabled('forum') ? safe(db.forumThread.count({ where: { status: 'VISIBLE', listed: true } })) : 0,
    safe(db.user.count({ where: { status: 'ACTIVE' } })),
  ])
  return ([
    ['products', 'محصول', products, '/products'], ['games', 'بازی', games, '/games'], ['cinema', 'فیلم و سریال', titles, '/cinema'],
    ['music', 'آهنگ', tracks, '/music'], ['software', 'نرم‌افزار', software, '/software'], ['forum', 'گفت‌وگو', threads, '/forum'], ['members', 'عضو', members, enabled('community') ? '/people' : '/register'],
  ] as [string, string, number, string][]).filter(([, , value]) => value > 0).map(([key, label, value, href]) => ({ key, label, value, href }))
}

async function getCommunity(): Promise<LandingCommunity | null> {
  const [posts, members, total] = await Promise.all([
    db.communityPost.findMany({ where: { status: 'VISIBLE', visibility: 'PUBLIC', author: { status: 'ACTIVE', userProfile: { privacy: { not: { contains: '"profile":"PRIVATE"' } } } } }, orderBy: [{ createdAt: 'desc' }], take: 6, select: { id: true, content: true, images: true, likeCount: true, commentCount: true, createdAt: true, author: { select: { name: true, avatarColor: true, userProfile: { select: { username: true, avatar: true, verified: true } } } } } }),
    db.userProfile.findMany({ where: { user: { status: 'ACTIVE' } }, orderBy: [{ followerCount: 'desc' }, { postCount: 'desc' }], take: 8, select: { username: true, avatar: true, verified: true, followerCount: true, user: { select: { name: true, avatarColor: true } } } }),
    db.userProfile.count(),
  ])
  if (!posts.length && total < 2) return null
  const first = (raw: string) => { try { return (JSON.parse(raw) as string[])[0] || '' } catch { return '' } }
  return {
    total,
    posts: posts.filter((post) => post.author.userProfile).map((post) => ({ id: post.id, text: post.content.slice(0, 220), image: first(post.images), likes: post.likeCount, comments: post.commentCount, createdAt: post.createdAt.toISOString(), author: { name: post.author.name || post.author.userProfile!.username, username: post.author.userProfile!.username, avatar: post.author.userProfile!.avatar, avatarColor: post.author.avatarColor, verified: post.author.userProfile!.verified } })),
    members: members.map((m) => ({ name: m.user.name || m.username, username: m.username, avatar: m.avatar, avatarColor: m.user.avatarColor, verified: m.verified, followers: m.followerCount })),
  }
}

export async function getLandingData(): Promise<LandingData> {
  const runtime = await getPublicExtensionRuntime().catch(() => ({} as Awaited<ReturnType<typeof getPublicExtensionRuntime>>))
  const enabled = (id: string) => runtime[id]?.enabled !== false
  const disabledPaths = Object.values(runtime).filter((state) => !state.enabled).flatMap((state) => [...(state.paths || [])])
  const [plans, settings, locations, posts, products, forms, telegram, showcase, stats, community] = await Promise.all([
    getPublicPlans(),
    getSettings(),
    db.mapLocation.findMany({ where: { active: true } }),
    db.post.findMany({
      where: livePostWhere(),
      include: { category: true },
      orderBy: { publishedAt: 'desc' },
      take: 5,
    }),
    db.product.findMany({
      where: publicProductWhere,
      include: { category: true },
      orderBy: [{ featured: 'desc' }, { sortOrder: 'asc' }],
      take: 8,
    }),
    db.siteForm.findMany({ where: { published: true } }),
    telegramConfig().catch(() => null),
    getShowcase(enabled).catch(() => []),
    getStats(enabled).catch(() => []),
    enabled('community') ? getCommunity().catch(() => null) : null,
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
      excerpt: plainText(post.excerpt, 220),
      excerptEn: plainText(post.excerptEn, 220),
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
      listPrice: product.compareAtMinor > 0n && (!product.saleEndsAt || product.saleEndsAt > new Date()) ? legacyNumber(product.compareAtMinor, normalizeCurrency(product.currency)) : 0,
    })),
    forms: forms.map((form) => publicForm(parseForm(form))),
    tomanRate: resolveUsdTomanRateNumber(settings.usdRateToman, process.env.FRENZYEX_USD_RATE_TOMAN),
    telegramBot: telegram?.ready ? telegram.username : '',
    showcase,
    disabledPaths,
    stats,
    community,
  }
}
