import { db } from '@/platform/database/prisma'
import { getModuleStates } from '@/extensions/server/modules'
import { ITEM_MODULE, ITEM_TYPES, itemKey, itemPath, type ItemRef, type ItemType } from '@/modules/content/domain/items'
import { GUEST, categoryAccess } from '@/modules/forum/domain/community'
import { markdownExcerpt } from '@/modules/forum/domain/markdown'

/**
 * Loads public items of every content type into one card shape. Only published,
 * visible items of enabled modules are returned, so callers never leak drafts,
 * inactive products or private forum threads.
 */
export type ItemCard = {
  type: ItemType
  id: number
  slug: string
  title: string
  subtitle: string
  summary: string
  keywords: string
  url: string
  image: string
  access: string
  publishedAt: Date
  updatedAt: Date
  /** Popularity signal used to order search results (views, downloads, plays). */
  popularity: number
}

const plain = (html: string, max = 300) => String(html || '').replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
const live = () => ({ status: 'PUBLISHED', publishedAt: { lte: new Date() } })

type Where = { id?: { in: number[] }; slug?: string }

async function load(type: ItemType, where: Where, take: number): Promise<ItemCard[]> {
  const card = (row: Omit<ItemCard, 'type' | 'url'>): ItemCard => ({ ...row, type, url: itemPath(type, row) })
  switch (type) {
    case 'software': {
      const rows = await db.softwareTitle.findMany({ where: { ...where, ...live() }, take, orderBy: { publishedAt: 'desc' } })
      return rows.map((r) => card({ id: r.id, slug: r.slug, title: r.title, subtitle: [r.version && `نسخه ${r.version}`, r.developer].filter(Boolean).join(' · '), summary: plain(r.summary || r.content), keywords: [r.titleEn, r.category, r.platforms, r.developer, r.version].join(' '), image: r.icon || r.cover, access: r.access, publishedAt: r.publishedAt, updatedAt: r.updatedAt, popularity: r.downloads + r.views }))
    }
    case 'game': {
      const rows = await db.gameTitle.findMany({ where: { ...where, ...live() }, take, orderBy: { publishedAt: 'desc' } })
      return rows.map((r) => card({ id: r.id, slug: r.slug, title: r.title, subtitle: r.platforms, summary: plain(r.summary || r.content), keywords: [r.titleEn, r.genres, r.platforms, r.developer, r.publisher].join(' '), image: r.cover, access: r.access, publishedAt: r.publishedAt, updatedAt: r.updatedAt, popularity: r.views }))
    }
    case 'title': {
      const rows = await db.cinemaTitle.findMany({ where: { ...where, ...live() }, take, orderBy: { publishedAt: 'desc' } })
      return rows.map((r) => card({ id: r.id, slug: r.slug, title: r.title, subtitle: [r.kind === 'SERIES' ? 'سریال' : 'فیلم', r.year, r.genres].filter(Boolean).join(' · '), summary: plain(r.summary), keywords: [r.titleEn, r.originalTitle, r.genres, r.director, r.countries, r.year].join(' '), image: r.poster, access: r.access, publishedAt: r.publishedAt, updatedAt: r.updatedAt, popularity: r.views }))
    }
    case 'album': {
      const rows = await db.musicAlbum.findMany({ where: { ...where, ...live() }, take, orderBy: { publishedAt: 'desc' }, include: { artist: { select: { name: true, nameEn: true } } } })
      return rows.map((r) => card({ id: r.id, slug: r.slug, title: r.title, subtitle: r.artist.name, summary: plain(r.description), keywords: [r.titleEn, r.artist.name, r.artist.nameEn, r.genre, r.year].join(' '), image: r.cover, access: r.access, publishedAt: r.publishedAt, updatedAt: r.updatedAt, popularity: r.views }))
    }
    case 'track': {
      const rows = await db.musicTrack.findMany({ where: { ...where, ...live() }, take, orderBy: { publishedAt: 'desc' }, include: { artist: { select: { name: true, nameEn: true } }, album: { select: { cover: true, title: true } } } })
      return rows.map((r) => card({ id: r.id, slug: r.slug, title: r.title, subtitle: r.artist.name, summary: r.album?.title || '', keywords: [r.titleEn, r.artist.name, r.artist.nameEn, r.genre, r.album?.title].join(' '), image: r.cover || r.album?.cover || '', access: r.access, publishedAt: r.publishedAt, updatedAt: r.updatedAt, popularity: r.plays + r.downloads }))
    }
    case 'artist': {
      const rows = await db.musicArtist.findMany({ where, take, orderBy: { createdAt: 'desc' } })
      return rows.map((r) => card({ id: r.id, slug: r.slug, title: r.name, subtitle: 'هنرمند', summary: plain(r.bio), keywords: r.nameEn, image: r.image, access: 'PUBLIC', publishedAt: r.createdAt, updatedAt: r.updatedAt, popularity: r.featured ? 50 : 0 }))
    }
    case 'product': {
      const rows = await db.product.findMany({ where: { ...where, active: true }, take, orderBy: { createdAt: 'desc' }, include: { category: { select: { name: true } } } })
      return rows.map((r) => card({ id: r.id, slug: r.slug, title: r.name, subtitle: r.category?.name || '', summary: plain(r.description), keywords: [r.nameEn, r.category?.name].join(' '), image: r.image, access: r.access, publishedAt: r.createdAt, updatedAt: r.updatedAt, popularity: r.featured ? 50 : 0 }))
    }
    case 'post': {
      const rows = await db.post.findMany({ where: { ...where, ...live() }, take, orderBy: { publishedAt: 'desc' }, include: { category: { select: { name: true } } } })
      return rows.map((r) => card({ id: r.id, slug: r.slug, title: r.title, subtitle: r.category?.name || 'مجله', summary: plain(r.excerpt || r.content), keywords: r.titleEn, image: r.cover, access: r.access, publishedAt: r.publishedAt, updatedAt: r.updatedAt, popularity: r.views }))
    }
    case 'thread': {
      // Only threads a guest may read are public items.
      const categories = await db.forumCategory.findMany({ include: { permissions: { select: { groupId: true, level: true } } } })
      const everyone = await db.forumGroup.findUnique({ where: { automatic: 'everyone' }, select: { id: true } })
      const guest = { ...GUEST, groupIds: everyone ? [everyone.id] : [] }
      const open = categories.filter((category) => categoryAccess(category, guest).see)
      const names = new Map(open.map((category) => [category.id, category.title]))
      const rows = await db.forumThread.findMany({
        where: { ...(where.id ? { id: where.id } : {}), status: 'VISIBLE', listed: true, categoryId: { in: [...names.keys()] } }, take, orderBy: { lastPostAt: 'desc' },
        include: { posts: { where: { postNumber: 1 }, take: 1, select: { content: true } } },
      })
      return rows.map((r) => card({ id: r.id, slug: String(r.id), title: r.title, subtitle: names.get(r.categoryId) || 'تالار', summary: markdownExcerpt(r.posts[0]?.content || '', 300), keywords: '', image: '', access: 'PUBLIC', publishedAt: r.createdAt, updatedAt: r.lastPostAt, popularity: r.views + r.replyCount * 5 }))
    }
  }
}

/** Item types whose owning module is enabled. */
export async function enabledItemTypes(): Promise<ItemType[]> {
  const states = await getModuleStates()
  return ITEM_TYPES.filter((type) => states[ITEM_MODULE[type]] !== false)
}

/** Cards for the given references, keyed by "type:id". Missing or hidden items are absent. */
export async function itemCards(refs: ItemRef[]): Promise<Map<string, ItemCard>> {
  const enabled = new Set(await enabledItemTypes())
  const byType = new Map<ItemType, number[]>()
  for (const ref of refs) if (enabled.has(ref.type)) byType.set(ref.type, [...(byType.get(ref.type) || []), ref.id])
  const result = new Map<string, ItemCard>()
  await Promise.all([...byType].map(async ([type, ids]) => {
    for (const item of await load(type, { id: { in: [...new Set(ids)] } }, ids.length)) result.set(itemKey(item), item)
  }))
  return result
}

export async function itemCard(ref: ItemRef): Promise<ItemCard | null> {
  return (await itemCards([ref])).get(itemKey(ref)) || null
}

/** Public item by its URL slug (threads use their numeric id). */
export async function itemBySlug(type: ItemType, slug: string): Promise<ItemCard | null> {
  if (!(await enabledItemTypes()).includes(type)) return null
  const rows = type === 'thread' ? await load(type, { id: { in: [Number(slug) || 0] } }, 1) : await load(type, { slug }, 1)
  return rows[0] || null
}

/** Every public item of a type, newest first (bounded) — the search index source. */
export const allItems = (type: ItemType, take = 5000) => load(type, {}, take)
