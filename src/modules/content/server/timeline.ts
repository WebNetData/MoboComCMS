import type { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { isModuleEnabled } from '@/extensions/server/modules'
import { parseItemKey, type ItemRef } from '@/modules/content/domain/items'
import { itemCard, itemCards } from '@/modules/content/server/registry'
import { closedSectionPlugins } from '@/modules/site/server/maintenance'
import { orderTimeline, type TimelineEvent } from '@/modules/content/domain/timeline'

const safe = async <T>(load: () => Promise<T[]>): Promise<T[]> => { try { return await load() } catch { return [] } }

/**
 * The public timeline of one item, or null when the item itself is not public. Every source is asked with
 * its own rule for what a visitor may see; a module that is off contributes nothing.
 */
export async function itemTimeline(ref: ItemRef, now = new Date()): Promise<{ item: { type: string; id: number; title: string; url: string }; events: TimelineEvent[] } | null> {
  const card = await itemCard(ref)
  if (!card) return null
  const closed = await closedSectionPlugins()
  const live = { status: 'PUBLISHED', publishedAt: { lte: now }, audienceGroups: '' }
  const iso = (date: Date) => date.toISOString()
  const events: TimelineEvent[] = [{ kind: 'published', at: iso(card.publishedAt), title: card.title, href: card.url, detail: '' }]

  const [updates, releases, episodes, premiere, articles, topics] = await Promise.all([
    ref.type === 'game' ? safe(() => db.gameUpdate.findMany({ where: { gameId: ref.id, releasedAt: { lte: now } }, orderBy: { releasedAt: 'desc' }, take: 20, select: { title: true, version: true, kind: true, releasedAt: true } })) : [],
    ref.type === 'software' ? safe(() => db.softwareRelease.findMany({ where: { softwareId: ref.id, status: 'PUBLISHED', releasedAt: { lte: now } }, orderBy: { releasedAt: 'desc' }, take: 20, select: { version: true, channel: true, releasedAt: true } })) : [],
    ref.type === 'title' ? safe(() => db.cinemaEpisode.findMany({ where: { season: { titleId: ref.id }, airDate: { lte: now } }, orderBy: { airDate: 'desc' }, take: 20, select: { number: true, title: true, airDate: true, season: { select: { number: true } } } })) : [],
    ref.type === 'title' ? safe(() => db.cinemaTitle.findMany({ where: { id: ref.id, releaseDate: { lte: now } }, select: { releaseDate: true } })) : [],
    !closed.has('journal') && await isModuleEnabled('journal') ? safe(() => db.postItemLink.findMany({ where: { itemType: ref.type, itemId: ref.id, post: live }, orderBy: { post: { publishedAt: 'desc' } }, take: 10, select: { post: { select: { id: true, slug: true, title: true, publishedAt: true } } } })) : [],
    !closed.has('forum') && await isModuleEnabled('forum') ? safe(async () => {
      const [{ visibleCategories }, { GUEST }] = await Promise.all([import('@/modules/forum/server/forum'), import('@/modules/forum/domain/community')])
      const open = (await visibleCategories(GUEST)).map((forum) => forum.id)
      return db.forumThread.findMany({ where: { itemType: ref.type, itemId: ref.id, status: 'VISIBLE', listed: true, categoryId: { in: open } }, orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, title: true, createdAt: true } })
    }) : [],
  ])
  for (const row of updates) events.push({ kind: 'release', at: iso(row.releasedAt), title: row.title, href: card.url, detail: row.version })
  for (const row of releases) events.push({ kind: 'release', at: iso(row.releasedAt), title: `نسخهٔ ${row.version}`, href: card.url, detail: row.channel === 'STABLE' ? '' : row.channel })
  for (const row of episodes) if (row.airDate) events.push({ kind: 'episode', at: iso(row.airDate), title: row.title || `قسمت ${row.number}`, href: card.url, detail: `S${String(row.season.number).padStart(2, '0')}E${String(row.number).padStart(2, '0')}` })
  for (const row of premiere) if (row.releaseDate) events.push({ kind: 'premiere', at: iso(row.releaseDate), title: card.title, href: card.url, detail: '' })
  const articleCards = articles.length ? await itemCards(articles.map(row => ({ type: 'post', id: row.post.id }))) : new Map()
  for (const row of articles) {
    const article = articleCards.get(`post:${row.post.id}`)
    if (article) events.push({ kind: 'article', at: iso(article.publishedAt), title: article.title, href: article.url, detail: '' })
  }
  for (const row of topics) events.push({ kind: 'topic', at: iso(row.createdAt), title: row.title, href: `/forum/t/${row.id}`, detail: '' })
  return { item: { type: card.type, id: card.id, title: card.title, url: card.url }, events: orderTimeline(events, now) }
}

/** GET /api/items/timeline?item=type:id — public; only what a visitor could already see. */
export async function GET_timeline(req: NextRequest) {
  const ref = parseItemKey(req.nextUrl.searchParams.get('item'))
  if (!ref) return err('invalid item', 400)
  const timeline = await itemTimeline(ref)
  if (!timeline) return err('not found', 404)
  const response = ok({ version: 1, ...timeline })
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}
