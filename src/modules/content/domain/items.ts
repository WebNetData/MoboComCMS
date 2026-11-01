/**
 * The public content registry: one vocabulary for "a thing on the site" that
 * search, reviews, favorites, comparison, social publishing, analytics and
 * copyright reports share. Each item type belongs to a feature module and has
 * one canonical public URL.
 */

import { toInternalPath } from '@/shared/routing/aliases'
export const ITEM_TYPES = ['software', 'game', 'studio', 'title', 'person', 'album', 'track', 'artist', 'product', 'post', 'thread', 'business', 'prompt'] as const
export type ItemType = typeof ITEM_TYPES[number]
export type ItemRef = { type: ItemType; id: number }

export const isItemType = (value: unknown): value is ItemType => (ITEM_TYPES as readonly string[]).includes(String(value))

/** Feature module that must be enabled for the item type to be public. */
export const ITEM_MODULE: Record<ItemType, string> = {
  software: 'software', game: 'games', studio: 'games', title: 'cinema', album: 'music', track: 'music', artist: 'music',
  product: 'store', post: 'journal', thread: 'forum', business: 'businesses',
  person: 'cinema', prompt: 'prompt-master',
}

export const ITEM_LABEL: Record<ItemType, { one: string; many: string; icon: string }> = {
  prompt: { one: 'الگوی پرامپت', many: 'پرامپت‌ها', icon: '✦' },
  business: { one: 'کسب‌وکار', many: 'کسب‌وکارها', icon: '⭐' },
  person: { one: 'بازیگر / کارگردان', many: 'عوامل سینما', icon: '🎭' },
  software: { one: 'نرم‌افزار', many: 'نرم‌افزارها', icon: '💾' },
  game: { one: 'بازی', many: 'بازی‌ها', icon: '🎮' },
  studio: { one: 'سازنده / ناشر', many: 'سازندگان و ناشران', icon: '🏢' },
  title: { one: 'فیلم و سریال', many: 'فیلم و سریال', icon: '🎬' },
  album: { one: 'آلبوم', many: 'آلبوم‌ها', icon: '💿' },
  track: { one: 'آهنگ', many: 'آهنگ‌ها', icon: '🎵' },
  artist: { one: 'هنرمند', many: 'هنرمندان', icon: '🎤' },
  product: { one: 'محصول', many: 'محصولات', icon: '🛍' },
  post: { one: 'مقاله', many: 'مجله', icon: '📰' },
  thread: { one: 'موضوع تالار', many: 'تالار گفتمان', icon: '💬' },
}

/** Item types members can rate, review and follow (products keep their own review system). */
export const REVIEWABLE: readonly ItemType[] = ['software', 'game', 'title', 'album', 'track', 'business']
/** Item types members can favorite. */
export const FAVORITABLE: readonly ItemType[] = ['software', 'game', 'studio', 'title', 'person', 'album', 'track', 'artist', 'product', 'post', 'prompt']
/** Item types that can be compared side by side (only with the same type). */
export const COMPARABLE: readonly ItemType[] = ['software', 'game', 'title', 'product']
export const COMPARE_MAX = 4
/** Item types editorial content may reference as a related entity (everything except other articles and forum threads). */
export const LINKABLE: readonly ItemType[] = ITEM_TYPES.filter((type) => type !== 'post' && type !== 'thread')

export function itemPath(type: ItemType, key: { slug?: string | null; id: number }): string {
  const slug = encodeURIComponent(key.slug || String(key.id))
  switch (type) {
    case 'prompt': return `/prompts/templates/${slug}`
    case 'business': return `/businesses/${slug}`
    case 'software': return `/software/${slug}`
    case 'game': return `/games/${slug}`
    case 'studio': return `/studios/${key.id}`
    case 'title': return `/cinema/${slug}`
    case 'person': return `/cinema/people/${key.id}`
    case 'album': return `/music/album/${slug}`
    case 'track': return `/music/track/${slug}`
    case 'artist': return `/music/artist/${slug}`
    case 'product': return `/products/${slug}`
    case 'post': return `/blog/${slug}`
    case 'thread': return `/forum/t/${key.id}`
  }
}

/**
 * Maps a public URL (absolute or relative) back to an item reference.
 * Used to attach copyright reports to the content they name.
 */
export function parseItemPath(input: string): { type: ItemType; slug: string; id?: number } | null {
  let path = String(input || '').trim()
  try { if (/^https?:\/\//i.test(path)) path = new URL(path).pathname } catch { return null }
  // Sections may be published under other addresses (/game for /games …).
  path = toInternalPath(path.split(/[?#]/)[0])
  let slug = ''
  const match = (pattern: RegExp) => { const m = pattern.exec(path); if (m) { try { slug = decodeURIComponent(m[1]) } catch { slug = m[1] } } return !!m }
  if (match(/^\/businesses\/([^/]+)\/?$/)) return { type: 'business', slug }
  if (match(/^\/software\/([^/]+)\/?$/) && slug !== 'browse') return { type: 'software', slug }
  if (match(/^\/games\/([^/]+)\/?$/) && slug !== 'browse') return { type: 'game', slug }
  if (match(/^\/studios\/(\d+)\/?$/)) return { type: 'studio', slug, id: Number(slug) }
  if (match(/^\/cinema\/people\/(\d+)\/?$/)) return { type: 'person', slug, id: Number(slug) }
  if (match(/^\/cinema\/([^/]+)\/?$/) && !['browse', 'people'].includes(slug)) return { type: 'title', slug }
  if (match(/^\/music\/album\/([^/]+)\/?$/)) return { type: 'album', slug }
  if (match(/^\/music\/track\/([^/]+)\/?$/)) return { type: 'track', slug }
  if (match(/^\/music\/artist\/([^/]+)\/?$/)) return { type: 'artist', slug }
  if (match(/^\/products\/([^/]+)\/?$/)) return { type: 'product', slug }
  if (match(/^\/blog\/([^/]+)\/?$/)) return { type: 'post', slug }
  if (match(/^\/forum\/t\/(\d+)/)) return { type: 'thread', slug, id: Number(slug) }
  return null
}

/** "software:12" ⇄ { type, id } — compact keys for query strings and local storage. */
export const itemKey = (ref: ItemRef) => `${ref.type}:${ref.id}`
export function parseItemKey(value: unknown): ItemRef | null {
  const [type, raw] = String(value || '').split(':')
  const id = Number(raw)
  return isItemType(type) && Number.isSafeInteger(id) && id > 0 ? { type, id } : null
}

/** Average rating with one decimal, or null without ratings. */
export const averageRating = (sum: number, count: number) => (count > 0 ? Math.round((sum / count) * 10) / 10 : null)
