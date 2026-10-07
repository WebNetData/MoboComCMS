import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { minorToNumber } from '@/shared/money'
import { LINE_STATUS, MarketplaceError, canMoveLine } from '@/modules/marketplace/domain/marketplace'
import { type SellerRow } from '@/modules/marketplace/server/marketplace/identity'
import { getMarketplaceSettings } from '@/modules/marketplace/server/marketplace/core'

export async function sellerOrders(seller: SellerRow, input: { tab?: string; page?: number }) {
  const settings = await getMarketplaceSettings()
  const tab = input.tab || 'open'
  const where: Prisma.OrderLineWhereInput = { sellerId: seller.id, order: { status: tab === 'refunded' ? 'REFUNDED' : 'PAID' } }
  if (tab === 'open') where.sellerStatus = { in: ['', 'ACCEPTED', 'READY'] }
  if (tab === 'shipped') where.sellerStatus = 'SHIPPED'
  const page = Math.max(1, Number(input.page) || 1)
  const [lines, total, open] = await Promise.all([
    db.orderLine.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * 40, take: 40, include: { order: { select: { id: true, createdAt: true, meta: true, productDelivery: { select: { status: true } }, shipment: { select: { trackingCode: true, carrierName: true } } } } } }),
    db.orderLine.count({ where }),
    db.orderLine.count({ where: { sellerId: seller.id, order: { status: 'PAID' }, sellerStatus: { in: ['', 'ACCEPTED', 'READY'] } } }),
  ])
  return {
    open, total, page, pages: Math.max(1, Math.ceil(total / 40)), shipsDirectly: settings.sellerShipsDirectly,
    lines: lines.map((line) => {
      let meta: Record<string, any> = {}
      try { meta = JSON.parse(line.order.meta || '{}') } catch { /* ignore */ }
      const address = meta.shippingAddress || {}
      return {
        id: line.id, orderId: line.orderId, createdAt: line.order.createdAt.toISOString(), name: line.name, variantName: line.variantName, sku: line.sku, image: line.image,
        quantity: line.quantity, total: minorToNumber(line.totalMinor, line.currency), commission: minorToNumber(line.commissionMinor, line.currency), currency: line.currency,
        status: line.sellerStatus, statusLabel: LINE_STATUS[line.sellerStatus] || line.sellerStatus, tracking: line.sellerTracking, delivery: line.order.productDelivery?.status || '',
        city: String(address.city || ''), deliveryDate: meta.delivery?.date || '',
        // Recipient details only when sellers ship to customers themselves.
        recipient: settings.sellerShipsDirectly ? { name: String(address.recipient || ''), phone: String(address.phone || ''), address: [address.province, address.city, address.address, address.postalCode && `کد پستی ${address.postalCode}`].filter(Boolean).join('، ') } : null,
      }
    }),
  }
}

export async function moveLine(seller: SellerRow, lineId: number, to: string, tracking?: unknown) {
  const line = await db.orderLine.findFirst({ where: { id: lineId, sellerId: seller.id }, include: { order: { select: { status: true, userId: true } } } })
  if (!line || line.order.status !== 'PAID') throw new MarketplaceError('سفارش پیدا نشد', 404)
  if (!canMoveLine(line.sellerStatus, to)) throw new MarketplaceError('این تغییر وضعیت مجاز نیست', 409)
  const code = String(tracking ?? '').replace(/[^\w-]/g, '').slice(0, 60)
  const claimed = await db.orderLine.updateMany({ where: { id: line.id, sellerStatus: line.sellerStatus }, data: { sellerStatus: to, ...(code ? { sellerTracking: code } : {}) } })
  if (claimed.count !== 1) throw new MarketplaceError('وضعیت تغییر کرده است؛ صفحه را تازه کنید', 409)
  await db.orderEvent.create({ data: { orderId: line.orderId, status: `SELLER_${to}`, note: `${seller.shopName}: «${line.name}» — ${LINE_STATUS[to]}${code ? ` (کد رهگیری ${code})` : ''}`, visible: false, actorId: seller.userId } })
  return { status: to }
}
