import { readShowcase } from '@/modules/prompts/domain/prompts'
import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { getModuleStates } from '@/extensions/server/modules'
import { ITEM_MODULE, ITEM_TYPES, itemKey, itemPath, type ItemRef, type ItemType } from '@/modules/content/domain/items'
import { GUEST, categoryAccess } from '@/modules/forum/domain/community'
import { markdownExcerpt } from '@/modules/forum/domain/markdown'
import { currentSoftwareVersions, projectSoftwareVersion } from '@/modules/software/server/current-version'

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
  titleEn?: string
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
const live = () => ({ status: 'PUBLISHED', publishedAt: { lte: new Date() }, audienceGroups: '' })

type Where = { id?: { in?: number[]; gt?: number }; slug?: string; q?: string }

async function load(type: ItemType, where: Where, take: number, includeScheduledPosts = false, indexScan = false, client: Prisma.TransactionClient = db): Promise<ItemCard[]> {
  const card = (row: Omit<ItemCard, 'type' | 'url'>): ItemCard => ({ ...row, type, url: itemPath(type, row) })
  // `q` is an optional bounded text filter for admin pickers; it never reaches Prisma as a field.
  const { q, ...base } = where
  const text = String(q || '').trim().slice(0, 100)
  const insensitive = /^postgres(?:ql)?:/.test(process.env.DATABASE_URL || '') ? { mode: 'insensitive' as const } : {}
  const match = text ? { OR: [{ title: { contains: text, ...insensitive } }, { titleEn: { contains: text, ...insensitive } }] } : {}
  const matchName = text ? { OR: [{ name: { contains: text, ...insensitive } }, { nameEn: { contains: text, ...insensitive } }] } : {}
  switch (type) {
    case 'prompt': {
      const rows = await client.promptTemplate.findMany({ where: { ...base, status: 'PUBLISHED', publishedAt: { lte: new Date() }, audienceGroups: '', ...(text ? { OR: [{ title: { contains: text, ...insensitive } }, { tags: { contains: text, ...insensitive } }] } : {}) }, take, orderBy: indexScan ? { id: 'asc' } : { publishedAt: 'desc' } })
      return rows.map(r => card({ id: r.id, slug: r.slug, title: r.title, subtitle: r.category, summary: r.summary, keywords: r.tags, image: readShowcase(r.showcase).cover, access: 'PUBLIC', publishedAt: r.publishedAt!, updatedAt: r.updatedAt, popularity: r.featured ? 10 : 0 }))
    }
    case 'software': {
      const rows = await client.softwareTitle.findMany({ where: { ...base, ...live(), ...match }, take, orderBy: indexScan ? { id: 'asc' } : { publishedAt: 'desc' } })
      const versions = await currentSoftwareVersions(rows.map((row) => row.id))
      return rows.map((source) => { const r = projectSoftwareVersion(source, versions); return card({ id: r.id, slug: r.slug, title: r.title, titleEn: r.titleEn, subtitle: [r.version && `نسخه ${r.version}`, r.developer].filter(Boolean).join(' · '), summary: plain(r.summary || r.content), keywords: [r.titleEn, r.category, r.platforms, r.developer, r.version].join(' '), image: r.icon || r.cover, access: r.access, publishedAt: r.publishedAt, updatedAt: r.updatedAt, popularity: r.downloads + r.views }) })
    }
    case 'game': {
      const rows = await client.gameTitle.findMany({ where: { ...base, ...live(), ...match }, take, orderBy: indexScan ? { id: 'asc' } : { publishedAt: 'desc' } })
      return rows.map((r) => card({ id: r.id, slug: r.slug, title: r.title, titleEn: r.titleEn, subtitle: r.platforms, summary: plain(r.summary || r.content), keywords: [r.titleEn, r.genres, r.platforms, r.developer, r.publisher].join(' '), image: r.cover, access: r.access, publishedAt: r.publishedAt, updatedAt: r.updatedAt, popularity: r.views }))
    }
    case 'studio': {
      const states = await getModuleStates()
      const visible = [
        ...(states.games !== false ? [{ gamesDeveloped: { some: live() } }, { gamesPublished: { some: live() } }] : []),
        ...(states.software !== false ? [{ softwareDeveloped: { some: live() } }, { softwarePublished: { some: live() } }] : []),
      ]
      if (!visible.length) return []
      const ids = base.id?.in || (base.slug ? [Number(base.slug) || 0] : undefined)
      const rows = await client.studio.findMany({ where: { ...(ids ? { id: { in: ids } } : base.id ? { id: base.id } : {}), OR: visible, ...(text ? { AND: [{ OR: [{ name: { contains: text, ...insensitive } }] }] } : {}) }, take, orderBy: indexScan ? { id: 'asc' } : { updatedAt: 'desc' } })
      return rows.map((r) => card({ id: r.id, slug: String(r.id), title: r.name, subtitle: 'سازنده / ناشر', summary: plain(r.summary), keywords: r.name, image: r.logo, access: 'PUBLIC', publishedAt: r.createdAt, updatedAt: r.updatedAt, popularity: 0 }))
    }
    case 'title': {
      const rows = await client.cinemaTitle.findMany({ where: { ...base, ...live(), ...match }, take, orderBy: indexScan ? { id: 'asc' } : { publishedAt: 'desc' } })
      return rows.map((r) => card({ id: r.id, slug: r.slug, title: r.title, titleEn: r.titleEn, subtitle: [r.kind === 'SERIES' ? 'سریال' : 'فیلم', r.year, r.genres].filter(Boolean).join(' · '), summary: plain(r.summary), keywords: [r.titleEn, r.originalTitle, r.genres, r.director, r.countries, r.year].join(' '), image: r.poster, access: r.access, publishedAt: r.publishedAt, updatedAt: r.updatedAt, popularity: r.views }))
    }
    case 'album': {
      const rows = await client.musicAlbum.findMany({ where: { ...base, ...live(), ...match }, take, orderBy: indexScan ? { id: 'asc' } : { publishedAt: 'desc' }, include: { artist: { select: { name: true, nameEn: true } } } })
      return rows.map((r) => card({ id: r.id, slug: r.slug, title: r.title, titleEn: r.titleEn, subtitle: r.artist.name, summary: plain(r.description), keywords: [r.titleEn, r.artist.name, r.artist.nameEn, r.genre, r.year].join(' '), image: r.cover, access: r.access, publishedAt: r.publishedAt, updatedAt: r.updatedAt, popularity: r.views }))
    }
    case 'track': {
      const rows = await client.musicTrack.findMany({ where: {album: { isNot: { audienceGroups: { not: '' } } },  ...base, ...live(), ...match }, take, orderBy: indexScan ? { id: 'asc' } : { publishedAt: 'desc' }, include: { artist: { select: { name: true, nameEn: true } }, album: { select: { cover: true, title: true } } } })
      return rows.map((r) => card({ id: r.id, slug: r.slug, title: r.title, titleEn: r.titleEn, subtitle: r.artist.name, summary: r.album?.title || '', keywords: [r.titleEn, r.artist.name, r.artist.nameEn, r.genre, r.album?.title].join(' '), image: r.cover || r.album?.cover || '', access: r.access, publishedAt: r.publishedAt, updatedAt: r.updatedAt, popularity: r.plays + r.downloads }))
    }
    case 'artist': {
      const rows = await client.musicArtist.findMany({ where: { ...base, ...(indexScan || text ? { mergedIntoId: null } : {}), ...matchName }, include: { mergedInto: true }, take, orderBy: indexScan ? { id: 'asc' } : { createdAt: 'desc' } })
      return rows.map((source) => { const r = source.mergedInto || source; return card({ id: source.id, slug: r.slug, title: r.name, titleEn: r.nameEn, subtitle: 'هنرمند', summary: plain(r.bio), keywords: r.nameEn, image: r.image, access: 'PUBLIC', publishedAt: r.createdAt, updatedAt: r.updatedAt, popularity: r.featured ? 50 : 0 }) })
    }
    case 'person': {
      const rows = await client.cinemaPerson.findMany({ where: { ...base, ...(indexScan || text ? { mergedIntoId: null } : {}), OR: [{ credits: { some: { title: live() } } }, { mergedInto: { is: { credits: { some: { title: live() } } } } }], ...(text ? { name: { contains: text, ...insensitive } } : {}) }, include: { mergedInto: true }, take, orderBy: { id: 'asc' } })
      return rows.map(source => { const row = source.mergedInto || source; return { ...card({ id: source.id, slug: String(row.id), title: row.name, subtitle: 'عوامل سینما', summary: plain(row.bio), keywords: row.normalizedName, image: row.image, access: 'PUBLIC', publishedAt: row.createdAt, updatedAt: row.createdAt, popularity: 0 }), url: `/cinema/people/${row.id}` } })
    }
    case 'business': {
      const rows = await client.businessProfile.findMany({ where: { ...base, status: 'PUBLISHED', OR: [{ kind: { not: 'SELLER' } }, { seller: { is: { status: 'ACTIVE' } } }], ...(text ? { AND: [{ OR: [{ name: { contains: text, ...insensitive } }, { domain: { contains: text, ...insensitive } }, { category: { contains: text, ...insensitive } }] }] } : {}) }, take, orderBy: indexScan ? { id: 'asc' } : { createdAt: 'desc' } })
      return rows.map(r => card({ id: r.id, slug: r.slug, title: r.name, subtitle: r.category, summary: r.description, keywords: r.domain || '', image: '', access: 'PUBLIC', publishedAt: r.createdAt, updatedAt: r.updatedAt, popularity: 0 }))
    }
    case 'product': {
      const rows = await client.product.findMany({ where: { ...base, active: true, approval: 'APPROVED', audienceGroups: '', ...(text ? { OR: [{ name: { contains: text, ...insensitive } }, { nameEn: { contains: text, ...insensitive } }, { slug: { contains: text, ...insensitive } }] } : {}) }, take, orderBy: indexScan ? { id: 'asc' } : { createdAt: 'desc' }, include: { category: { select: { name: true } } } })
      return rows.map((r) => card({ id: r.id, slug: r.slug, title: r.name, titleEn: r.nameEn, subtitle: r.category?.name || '', summary: plain(r.description), keywords: [r.nameEn, r.category?.name].join(' '), image: r.image, access: r.access, publishedAt: r.createdAt, updatedAt: r.updatedAt, popularity: r.featured ? 50 : 0 }))
    }
    case 'post': {
      const rows = await client.post.findMany({ where: { ...base, ...(includeScheduledPosts ? { status: 'PUBLISHED', audienceGroups: '' } : live()), ...match }, take, orderBy: indexScan ? { id: 'asc' } : { publishedAt: 'desc' }, include: { category: { select: { name: true } } } })
      return rows.map((r) => card({ id: r.id, slug: r.slug, title: r.title, titleEn: r.titleEn, subtitle: r.category?.name || 'مجله', summary: plain(r.excerpt || r.content), keywords: r.titleEn, image: r.cover, access: r.access, publishedAt: r.publishedAt, updatedAt: r.updatedAt, popularity: r.views }))
    }
    case 'thread': {
      // Only threads a guest may read are public items.
      const categories = await client.forumCategory.findMany({ include: { permissions: { select: { groupId: true, level: true } } } })
      const everyone = await client.forumGroup.findUnique({ where: { automatic: 'everyone' }, select: { id: true } })
      const guest = { ...GUEST, groupIds: everyone ? [everyone.id] : [] }
      const open = categories.filter((category) => categoryAccess(category, guest).see)
      const names = new Map(open.map((category) => [category.id, category.title]))
      const rows = await client.forumThread.findMany({
        where: { ...(base.id ? { id: base.id } : {}), ...(text ? { title: { contains: text, ...insensitive } } : {}), status: 'VISIBLE', listed: true, categoryId: { in: [...names.keys()] } }, take, orderBy: indexScan ? { id: 'asc' } : { lastPostAt: 'desc' },
        include: { posts: { where: { postNumber: 1 }, take: 1, select: { content: true } } },
      })
      return rows.map((r) => card({ id: r.id, slug: String(r.id), title: r.title, subtitle: names.get(r.categoryId) || 'تالار', summary: markdownExcerpt(r.posts[0]?.content || '', 300), keywords: '', image: '', access: 'PUBLIC', publishedAt: r.createdAt, updatedAt: r.lastPostAt, popularity: r.views + r.replyCount * 5 }))
    }
  }
}

/** Item types whose owning module is enabled. */
export async function enabledItemTypes(): Promise<ItemType[]> {
  const states = await getModuleStates()
  return ITEM_TYPES.filter((type) => type === 'studio' ? states.games !== false || states.software !== false : states[ITEM_MODULE[type]] !== false)
}

/** Public discovery also obeys section audience limits, without narrowing the private search index. */
async function publicItemTypes(): Promise<ItemType[]> {
  const { closedSectionPlugins } = await import('@/modules/site/server/maintenance')
  const closed = await closedSectionPlugins()
  return (await enabledItemTypes()).filter(type => type === 'studio' ? !(closed.has('games') && closed.has('software')) : !closed.has(ITEM_MODULE[type]))
}

/** Cards for the given references, keyed by "type:id". Missing or hidden items are absent. */
export async function itemCards(refs: ItemRef[], client: Prisma.TransactionClient = db): Promise<Map<string, ItemCard>> {
  const enabled = new Set(await publicItemTypes())
  const byType = new Map<ItemType, number[]>()
  for (const ref of refs) if (enabled.has(ref.type)) byType.set(ref.type, [...(byType.get(ref.type) || []), ref.id])
  const result = new Map<string, ItemCard>()
  await Promise.all([...byType].map(async ([type, ids]) => {
    for (const item of await load(type, { id: { in: [...new Set(ids)] } }, ids.length, false, false, client)) result.set(itemKey(item), item)
  }))
  return result
}

export async function itemCard(ref: ItemRef): Promise<ItemCard | null> {
  return (await itemCards([ref])).get(itemKey(ref)) || null
}

/** Search may prepare a scheduled post before it is public; public readers still use itemCard. */
export async function searchIndexCard(ref: ItemRef): Promise<ItemCard | null> {
  if (!(await enabledItemTypes()).includes(ref.type)) return null
  return (await load(ref.type, { id: { in: [ref.id] } }, 1, ref.type === 'post', true))[0] || null
}

/** Public item by its URL slug (threads use their numeric id). */
export async function itemBySlug(type: ItemType, slug: string): Promise<ItemCard | null> {
  if (!(await publicItemTypes()).includes(type)) return null
  const rows = type === 'thread' ? await load(type, { id: { in: [Number(slug) || 0] } }, 1) : await load(type, { slug }, 1)
  return rows[0] || null
}

/** One bounded search-index page, ordered by stable id; scheduled posts are prepared privately. */
export const searchIndexPage = (type: ItemType, afterId = 0, take = 500) => load(type, { id: { gt: afterId } }, Math.max(1, Math.min(500, take)), type === 'post', true)

/** Bounded live text search over the given item types with exactly the public card visibility rules (admin pickers). */
export async function searchItemCards(q: unknown, types: readonly ItemType[], take = 25): Promise<ItemCard[]> {
  const text = String(q ?? '').trim()
  if (text.length < 2) return []
  const limit = Math.max(1, Math.min(100, Number(take) || 25))
  const enabled = new Set(await publicItemTypes())
  const wanted = types.filter((type) => enabled.has(type))
  if (!wanted.length) return []
  const pages = await Promise.all(wanted.map((type) => load(type, { q: text }, limit)))
  return pages.flat().slice(0, limit)
}

/** A small live catalogue rail using exactly the canonical card publication and module guards. */
export async function latestItemCards(type: ItemType, take = 6): Promise<ItemCard[]> {
  if (!(await publicItemTypes()).includes(type)) return []
  return load(type, {}, Math.max(1, Math.min(24, Number(take) || 6)))
}
