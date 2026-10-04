import { db } from '@/platform/database/prisma'
import { publicPriceObservations } from '@/modules/catalog/domain/price-history'
import { isStoreEnabled } from '@/modules/catalog/server/storefront'
import { getStoreSettings } from '@/modules/store/server/catalog'
import { createInboxEvent } from '@/modules/notifications/server/inbox'
import { formatMoney } from '@/shared/money'

/** Bounded delivery to existing, active product followers; central Inbox owns channel preferences/retries. */
export async function deliverProductPriceDrop(payload: Record<string, unknown>) {
  const pointId = Number(payload.pointId), cursor = Number(payload.cursor ?? 0)
  if (!Number.isSafeInteger(pointId) || pointId <= 0 || !Number.isSafeInteger(cursor) || cursor < 0 || !/^[1-9]\d{0,18}$/.test(String(payload.previousMinor || ''))) throw new Error('Invalid price-drop job')
  if (!await isStoreEnabled()) return { done: true, skipped: 'store-disabled' }
  if (!(await getStoreSettings()).priceDropNotifications) return { done: true, skipped: 'notices-disabled' }
  const point = await db.productPricePoint.findUnique({ where: { id: pointId }, include: { product: true } })
  if (!point || point.variantId !== 0 || point.currency !== payload.currency || BigInt(String(payload.previousMinor)) <= point.amountMinor) return { done: true, skipped: 'invalid-observation' }
  const offer = publicPriceObservations(point.product, [])[0]
  if (!offer || offer.currency !== point.currency || offer.amountMinor > point.amountMinor) return { done: true, skipped: 'offer-unavailable' }
  const where = { itemType: 'product', itemId: point.productId, notify: true, createdAt: { lte: point.recordedAt }, user: { status: 'ACTIVE' } }
  const followers = await db.itemFavorite.findMany({ where: { ...where, userId: { gt: cursor } }, orderBy: { userId: 'asc' }, take: 100, select: { userId: true } })
  let sent = 0
  for (const follower of followers) {
    // A queued page is not authorization: honor an unsubscribe/opt-out that happened after selection.
    if (!await db.itemFavorite.findFirst({ where: { ...where, userId: follower.userId }, select: { userId: true } })) continue
    const nameFa = point.product.name, nameEn = point.product.nameEn || nameFa
    await createInboxEvent({
      userId: follower.userId, kind: 'FOLLOWED_UPDATE', dedupeKey: `follow:product:${point.productId}:price-point-${point.id}:${follower.userId}`,
      titleFa: `قیمت ${nameFa} کاهش یافت`, titleEn: `${nameEn} price dropped`,
      bodyFa: `قیمت ثبت‌شدهٔ «${nameFa}» به ${formatMoney(point.amountMinor, point.currency, 'fa-IR')} کاهش یافت؛ قیمت فعلی را در صفحهٔ محصول بررسی کنید.`,
      bodyEn: `The recorded price of ${nameEn} dropped to ${formatMoney(point.amountMinor, point.currency, 'en-US')}. Check the product page for the current offer.`,
      href: `/products/${encodeURIComponent(point.product.slug)}`,
    })
    sent++
  }
  return { done: followers.length < 100, cursor: followers.at(-1)?.userId ?? cursor, sent }
}
