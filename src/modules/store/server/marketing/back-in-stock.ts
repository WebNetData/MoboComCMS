import { db } from '@/platform/database/prisma'
import { logEvent } from '@/platform/observability/logger'
import { createInboxEvent } from '@/modules/notifications/server/inbox'
import { MarketingError, stockAlertAvailable } from '@/modules/store/domain/marketing'
import { positive } from '@/modules/store/server/marketing/core'

async function productAvailability(productId: number, variantId: number) {
  const product = await db.product.findUnique({ where: { id: productId }, include: {
    variants: { where: { active: true }, select: { id: true, name: true, stock: true } },
    _count: { select: { variants: true } },
  } })
  if (!product) return null
  const variant = variantId ? product.variants.find((row) => row.id === variantId) || null : null
  const available = stockAlertAvailable({ ...product, variantCount: product._count.variants }, variantId)
  return { product, variant, available }
}

export async function stockAlertStatus(userId: number, productIdInput: unknown, variantIdInput: unknown) {
  const row = await db.stockAlert.findUnique({ where: { userId_productId_variantId: { userId, productId: positive(productIdInput), variantId: positive(variantIdInput) } } })
  return { subscribed: !!row && !row.notifiedAt }
}

export async function subscribeStockAlert(userId: number, productIdInput: unknown, variantIdInput: unknown) {
  const productId = positive(productIdInput), variantId = positive(variantIdInput)
  const state = productId ? await productAvailability(productId, variantId) : null
  if (!state || !state.product.active || state.product.approval !== 'APPROVED') throw new MarketingError('کالا پیدا نشد', 404)
  if (variantId && !state.variant) throw new MarketingError('نوع انتخاب‌شده پیدا نشد', 404)
  if (state.available && (!variantId || state.variant!.stock !== 0)) throw new MarketingError('این کالا هم‌اکنون موجود است', 409, 'IN_STOCK')
  if (await db.stockAlert.count({ where: { userId, notifiedAt: null } }) >= 100) throw new MarketingError('بیش از ۱۰۰ درخواست فعال دارید', 429)
  await db.stockAlert.upsert({ where: { userId_productId_variantId: { userId, productId, variantId } }, create: { userId, productId, variantId }, update: { notifiedAt: null, createdAt: new Date() } })
  return { subscribed: true }
}

export async function unsubscribeStockAlert(userId: number, productIdInput: unknown, variantIdInput: unknown) {
  await db.stockAlert.deleteMany({ where: { userId, productId: positive(productIdInput), variantId: positive(variantIdInput), notifiedAt: null } })
  return { subscribed: false }
}

/** Tells everyone waiting for a product (or variant) that is back in stock. */
export async function runStockAlerts(limit = 300) {
  const pending = await db.stockAlert.findMany({ where: { notifiedAt: null }, orderBy: { id: 'asc' }, take: 2000, select: { productId: true, variantId: true } })
  const keys = [...new Map(pending.map((row) => [`${row.productId}:${row.variantId}`, row])).values()]
  let sent = 0
  for (const key of keys) {
    if (sent >= limit) break
    const state = await productAvailability(key.productId, key.variantId)
    if (!state?.available) continue
    const waiting = await db.stockAlert.findMany({ where: { productId: key.productId, variantId: key.variantId, notifiedAt: null }, orderBy: { id: 'asc' }, take: limit - sent })
    for (const alert of waiting) {
      const name = `${state.product.name}${state.variant ? ` (${state.variant.name})` : ''}`
      try {
        await createInboxEvent({
          userId: alert.userId, kind: 'STOCK_BACK', dedupeKey: `stock-back:${alert.id}:${alert.createdAt.getTime()}`,
          titleFa: `«${name}» موجود شد`, titleEn: `${name} is back in stock`,
          bodyFa: 'کالایی که منتظرش بودید دوباره موجود شد؛ موجودی ممکن است محدود باشد.', bodyEn: 'The item you were waiting for is back in stock.',
          href: `/products/${encodeURIComponent(state.product.slug)}`,
        })
        const marked = await db.stockAlert.updateMany({ where: { id: alert.id, createdAt: alert.createdAt, notifiedAt: null }, data: { notifiedAt: new Date() } })
        sent += marked.count
      } catch (error) {
        logEvent('warn', 'store.stock_alert_delivery_failed', { alertId: alert.id, error: String(error) })
      }
    }
  }
  return { sent }
}

export async function adminStockAlerts() {
  const [groups, notified30, pendingTotal] = await Promise.all([
    db.stockAlert.groupBy({ by: ['productId', 'variantId'], where: { notifiedAt: null }, _count: { _all: true }, _min: { createdAt: true }, orderBy: { _count: { productId: 'desc' } }, take: 100 }),
    db.stockAlert.count({ where: { notifiedAt: { gte: new Date(Date.now() - 30 * 86_400_000) } } }),
    db.stockAlert.count({ where: { notifiedAt: null } }),
  ])
  const products = await db.product.findMany({ where: { id: { in: groups.map((row) => row.productId) } }, select: { id: true, name: true, slug: true, image: true, stock: true, variants: { select: { id: true, name: true, stock: true } } } })
  return {
    pendingTotal, notified30,
    rows: groups.map((row) => {
      const product = products.find((item) => item.id === row.productId)
      const variant = row.variantId ? product?.variants.find((item) => item.id === row.variantId) : null
      return { productId: row.productId, variantId: row.variantId, name: product?.name || `#${row.productId}`, variantName: variant?.name || '', slug: product?.slug || '', image: product?.image || '', stock: variant ? variant.stock : product?.stock ?? 0, waiting: row._count._all, since: row._min.createdAt }
    }),
  }
}
