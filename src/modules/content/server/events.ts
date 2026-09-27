import { logEvent } from '@/platform/observability/logger'
import { itemKey, type ItemRef, type ItemType } from '@/modules/content/domain/items'

/**
 * One place that reacts to content being created, edited, published or
 * deleted: the search index is patched, first publication is announced
 * (Telegram / Instagram / push) and followers hear about meaningful updates
 * (a new software version, a price drop or restock). Everything here is best
 * effort and never fails the admin save that triggered it.
 */

/** The fields of a row that matter for these reactions (any model). */
export type Snapshot = {
  status?: string | null
  active?: boolean | null
  publishedAt?: Date | null
  version?: string | null
  title?: string | null
  name?: string | null
  priceMinor?: bigint | null
  stock?: number | null
  kind?: string | null
} | null

/** Admin resource keys of the media admin → content types. */
export const MEDIA_RESOURCE_TYPE: Record<string, ItemType> = {
  'music-artists': 'artist', 'music-albums': 'album', 'music-tracks': 'track', 'cinema-titles': 'title', games: 'game', software: 'software',
}

function live(type: ItemType, row: Snapshot): boolean {
  if (!row) return false
  if (type === 'product') return row.active !== false
  if (type === 'artist') return true
  if (type === 'thread') return row.status === 'VISIBLE'
  return row.status === 'PUBLISHED'
}

async function react(ref: ItemRef, before: Snapshot, after: Snapshot) {
  const [{ reindexItem }, { enqueueAnnouncement }, { notifyFollowers }] = await Promise.all([
    import('@/modules/search/server/search'),
    import('@/modules/social/server/social'),
    import('@/modules/reviews/server/reviews'),
  ])
  await reindexItem(ref)
  if (!after) return
  const title = after.title || after.name || ''
  if (!live(ref.type, before) && live(ref.type, after)) await enqueueAnnouncement(ref, after.publishedAt || new Date())
  if (!live(ref.type, after)) return
  if (ref.type === 'software' && before?.version && after.version && before.version !== after.version) {
    await notifyFollowers(ref, { key: `v${after.version}`, title: `نسخهٔ ${after.version} ${title} منتشر شد`, body: `«${title}» به نسخهٔ ${after.version} به‌روز شد. لینک‌های دانلود تازه را ببینید.` })
  }
  if (ref.type === 'product' && before && after.kind === 'PHYSICAL' && (before.stock ?? 0) <= 0 && (after.stock ?? 0) > 0) {
    await notifyFollowers(ref, { key: `restock-${Date.now().toString(36)}`, title: `${title} دوباره موجود شد`, body: `«${title}» که در علاقه‌مندی‌های شماست دوباره موجود است.` })
  }
  if (ref.type === 'product' && before?.priceMinor && after.priceMinor && after.priceMinor < before.priceMinor) {
    await notifyFollowers(ref, { key: `price-${after.priceMinor}`, title: `قیمت ${title} کاهش یافت`, body: `قیمت «${title}» که در علاقه‌مندی‌های شماست کمتر شد.` })
  }
}

/** Fire-and-forget: call after a successful save or delete (`after` = null when deleted). */
export function contentChanged(ref: ItemRef, before: Snapshot, after: Snapshot) {
  void react(ref, before, after).catch((error) => logEvent('error', 'content.change_hook_failed', { ref: itemKey(ref), error }))
}
