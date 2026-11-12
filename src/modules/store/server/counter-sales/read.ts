import { db } from '@/platform/database/prisma'
import { decryptDigitalDelivery } from '@/modules/catalog/server/digital-delivery'
import { getSiteConfig } from '@/modules/site/config/store'
import { readOrderFields } from '@/modules/store/domain/order-inputs'
import { readDeliveryTemplate, type DeliveryItem } from '@/modules/store/domain/delivery-details'
import { unitPrice } from '@/modules/store/server/pricing'
import { StoreError } from '@/modules/store/domain/store'
import { saleReceiptLink, saleSeller } from '@/modules/store/server/sale-receipts'
import { unitsAt } from '@/modules/catalog/server/location-admin'
import { itemKey } from '@/modules/catalog/server/locations'

/** Counter catalogue; with a stock location, tracked items show the units on that location's shelf. */
export async function counterProducts(query: string,productId?:number,locationId?:number|null) {
  const q = query.trim().slice(0, 80)
  const rows = await db.product.findMany({
    where: { ...(productId?{id:productId}:{}),active: true, sellerId: null, openAmount: false, OR: [{ kind: 'PHYSICAL' }, { kind: 'VIRTUAL', digitalMode: 'CODES' }], ...(q ? { AND: [{ OR: [{ name: { contains: q } }, { sku: { contains: q } }, {barcode:{contains:q}}, { variants: { some: { sku: { contains: q } } } }] }] } : {}) },
    include: { variants: { where: { active: true }, orderBy: { id: 'asc' } } }, orderBy: { id: 'desc' }, take: 30,
  })
  const shelf = locationId ? await unitsAt(locationId, rows.map((row) => row.id)) : null
  const units = (productId: number, variantId: number | null, fallback: number) => { const key = itemKey(productId, variantId); return shelf?.tracked.has(key) ? shelf.at.get(key) ?? 0 : fallback }
  return rows.map((product) => ({
    id: product.id, name: product.name, kind: product.kind, currency: product.currency, stock: units(product.id, null, product.stock),
    unitMinor: unitPrice(product, null, false, new Date(), undefined, 'COUNTER').unitMinor.toString(), maxPerOrder: product.maxPerOrder,
    fields: readOrderFields(product.orderFields),
    variants: product.variants.map((variant) => ({ id: variant.id, name: variant.name, stock: units(product.id, variant.id, variant.stock), unitMinor: unitPrice(product, variant, false, new Date(), undefined, 'COUNTER').unitMinor.toString() })),
  }))
}

export async function counterCustomers(query: string) {
  const q = query.trim().slice(0, 80)
  if (q.length < 2) return []
  return db.user.findMany({ where: { status: 'ACTIVE', OR: [{ name: { contains: q } }, { email: { contains: q } }, { phone: { contains: q } }] }, select: { id: true, name: true, email: true, phone: true }, orderBy: { id: 'desc' }, take: 15 })
}

/** Private, persisted receipt. Reading codes is audited by the HTTP owner. */
export async function counterReceipt(orderId: number) {
  const order = await db.order.findFirst({
    where: { id: orderId, saleSource: 'COUNTER', status: 'PAID', productDelivery: { is: { status: { notIn: ['CANCELLED', 'RETURNED'] } } } },
    include: { invoice: true, tenders:true,lines: { orderBy: { line: 'asc' }, include: { product: { select: { deliveryTemplate: true } } } }, user: { select: { name: true, phone: true } }, createdBy: { select: { name: true } }, registerSession: { select: { register: true } } },
  })
  if (!order?.invoice || order.invoice.status !== 'PAID') throw new StoreError('فروش حضوری پیدا نشد', 404)
  const codes = await db.productDigitalCode.findMany({ where: { orderId, returnedAt: null }, orderBy: { id: 'asc' }, select: { id: true, productId: true, orderLine: true, secret: true } })
  const cards = codes.map((code) => {
    const line = order.lines.find((item) => item.line === code.orderLine && item.productId === code.productId)
    if (!line) throw new StoreError('کد با ردیف فروش تطبیق ندارد', 409)
    const template = readDeliveryTemplate(line.product?.deliveryTemplate || '{}')
    const items: DeliveryItem[] = [{ label: 'کد', value: decryptDigitalDelivery(code.secret), secret: true, place: 'card' }]
    return { id: code.id, product: [line.name, line.variantName].filter(Boolean).join(' — '), items, template }
  })
  let meta: Record<string, unknown>
  try { meta = JSON.parse(order.meta) } catch { throw new StoreError('اطلاعات فروش قابل خواندن نیست', 409) }
  const [site, seller] = await Promise.all([getSiteConfig(), saleSeller()])
  return {
    ...await saleReceiptLink(orderId),payments:order.tenders.map(row=>({method:row.method as 'CASH'|'CARD'|'WALLET',amountMinor:row.amountMinor.toString(),reference:row.reference})),
    orderId: order.id, invoiceNumber: order.invoice.number, createdAt: order.createdAt.toISOString(),
    customer: order.customerName || order.user?.name || 'مشتری حضوری', phone: order.customerPhone || order.user?.phone || '', cashier: order.createdBy?.name || '',
    method: ['CASH','CARD','WALLET','SPLIT'].includes(String(meta.counterMethod)) ? String(meta.counterMethod) : 'CASH', reference: String(meta.counterReference || ''),
    deliveryMode: meta.shippingMode === 'SHIP' ? 'SHIP' as const : 'HANDOVER' as const, subtotalMinor: String(meta.subtotalMinor || ''), discountMinor: String(meta.discountMinor || '0'), shippingMinor: String(meta.shippingMinor || '0'), shippingAddress: meta.shippingAddress && typeof meta.shippingAddress === 'object' ? Object.values(meta.shippingAddress).filter(value => typeof value === 'string').join(' · ') : '',
    currency: order.currency, totalMinor: order.totalMinor.toString(), brand: { title: site.brand || '', logo: site.logo || '' }, seller, register: order.registerSession?.register || '',
    lines: order.lines.map((line) => ({ name: line.name, variant: line.variantName, quantity: line.quantity, unitMinor: line.unitPriceMinor.toString(), totalMinor: line.totalMinor.toString(), kind: line.kind })), cards,
  }
}
