import { createHash } from 'node:crypto'
import { Prisma, type StoreQuotation } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { StoreError, lineLimit } from '@/modules/store/domain/store'
import { isPublishedProduct } from '@/modules/catalog/domain/product-publication'
import { readOrderFields } from '@/modules/store/domain/order-inputs'
import { unitPrice } from '@/modules/store/server/pricing'
import { isMember } from '@/modules/membership/server/membership'
import { groupDeal } from '@/modules/account/server/user-groups'
import { userOpensAudience } from '@/modules/account/server/item-audience'
import { ruleRefusal } from '@/modules/membership/server/rules'
import { getDeliverySettings } from '@/modules/shipping/server/shipping'
import { getCarrierSettings } from '@/modules/shipping/server/carriers'
import { shippingFeeMinor } from '@/modules/shipping/domain/shipping'
import { minorToNumber } from '@/shared/money'
import { tierStanding } from '@/modules/membership/server/tiers'
import { lockProduct } from '@/modules/catalog/server/code-stock'

type Client = Prisma.TransactionClient | typeof db
export type QuotationLine = { productId: number; variantId: number | null; quantity: number; unitMinor?: string; name?: string; variantName?: string }
export type QuotationChannel = 'ONLINE' | 'COUNTER'
export function readQuotationLines(raw: unknown): QuotationLine[] {
  const lines: unknown = typeof raw === 'string' ? JSON.parse(raw) : raw
  if (!Array.isArray(lines) || !lines.length || lines.length > 50) throw new StoreError('کالاهای پیش‌فاکتور معتبر نیستند')
  const seen = new Set<string>()
  return lines.map(value => {
    const row = value && typeof value === 'object' ? value as Record<string, unknown> : {}
    const productId = Number(row.productId), variantId = Number(row.variantId) || null, quantity = Number(row.quantity)
    if (!Number.isSafeInteger(productId) || productId < 1 || (variantId !== null && (!Number.isSafeInteger(variantId) || variantId < 1)) || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 999) throw new StoreError('کالا یا تعداد پیش‌فاکتور معتبر نیست')
    const key = `${productId}:${variantId || 0}`
    if (seen.has(key)) throw new StoreError('هر کالا و گونه را در یک ردیف ثبت کنید')
    seen.add(key)
    return { productId, variantId, quantity, ...(typeof row.unitMinor === 'string' ? { unitMinor: row.unitMinor } : {}), ...(typeof row.name === 'string' ? { name: row.name } : {}), ...(typeof row.variantName === 'string' ? { variantName: row.variantName } : {}) }
  })
}

/** The ordinary Store price/access rules remain authoritative for both sale channels. */
export async function quotationPrice(client: Client, wants: QuotationLine[], userId: number, channel: QuotationChannel = 'ONLINE') {
  const member = await isMember(userId), deal = await groupDeal(userId, wants.map(row => row.productId))
  const rows = await client.product.findMany({ where: { id: { in: wants.map(row => row.productId) } }, include: { variants: { where: { active: true } } } })
  const lines = []
  let subtotalMinor = 0n, currency = ''
  for (const [index, want] of wants.entries()) {
    const product = rows.find(row => row.id === want.productId)
    if (!product || !isPublishedProduct(product) || product.sellerId || product.kind !== 'PHYSICAL' || product.openAmount || product.isService || readOrderFields(product.orderFields).length || !await userOpensAudience(product.audienceGroups, 'product', userId) || (product.access === 'MEMBERS' && !member) || await ruleRefusal(userId, [{ ownerType: 'product', ownerId: product.id }])) throw new StoreError('یکی از کالاها برای این مشتری قابل خرید نیست؛ پیشنهاد را بازبینی کنید', 409, 'QUOTATION_UNAVAILABLE')
    const variant = want.variantId ? product.variants.find(row => row.id === want.variantId) : null
    if ((product.variants.length && !variant) || (want.variantId && !variant)) throw new StoreError('گونهٔ یکی از کالاها تغییر کرده است؛ پیشنهاد تازه لازم است', 409, 'QUOTATION_UNAVAILABLE')
    const maxQuantity = lineLimit(product.stock, variant?.stock ?? null, product.maxPerOrder)
    if (want.quantity > maxQuantity) throw new StoreError(`موجودی «${product.name}» برای این تعداد کافی نیست`, 409, 'OUT_OF_STOCK')
    const price = unitPrice(product, variant || null, channel === 'ONLINE' && member, new Date(), channel === 'ONLINE' ? deal : undefined, channel)
    if (price.unitMinor <= 0n || (currency && currency !== price.currency)) throw new StoreError('قیمت یا واحد پول کالاهای پیشنهاد معتبر نیست', 409)
    currency = price.currency
    const totalMinor = price.unitMinor * BigInt(want.quantity)
    subtotalMinor += totalMinor
    lines.push({ id: index + 1, productId: product.id, variantId: variant?.id ?? null, slug: product.slug, name: product.name, variantName: variant?.name || '', attributes: {} as Record<string, string>, image: product.image, brand: '', kind: product.kind, quantity: want.quantity, maxQuantity, unitPrice: minorToNumber(price.unitMinor, currency), listPrice: minorToNumber(price.unitMinor, currency), lineTotal: minorToNumber(totalMinor, currency), currency, issue: '', unitMinor: price.unitMinor.toString(), productVersion: product.updatedAt.toISOString(), variantVersion: variant ? JSON.stringify([variant.name, variant.sku, variant.stock, variant.attributes]) : '' })
  }
  return { lines, subtotalMinor, currency }
}

export const quotationFingerprint = (row: StoreQuotation, price: Awaited<ReturnType<typeof quotationPrice>>, channel: QuotationChannel) => createHash('sha256').update(JSON.stringify([row.id, row.updatedAt.toISOString(), row.expiresAt.toISOString(), row.discountMinor.toString(), channel, price.currency, price.lines.map(line => [line.productId, line.variantId, line.quantity, line.unitMinor, line.productVersion, line.variantVersion])])).digest('hex')
export const isOpenQuotation = (row: StoreQuotation) => row.status === 'OPEN' && !row.orderId && row.expiresAt.getTime() > Date.now()
export async function quotationByToken(token: string) {
  if (!/^[a-f0-9]{48}$/.test(token)) return null
  return db.storeQuotation.findUnique({ where: { token } })
}

export async function quotationPreview(token: string, channel: QuotationChannel = 'ONLINE') {
  const row = await quotationByToken(token)
  if (!row) return null
  const base = { id: row.id, title: row.title, token: row.token, status: row.status, expiresAt: row.expiresAt.toISOString(), currency: row.currency, originalSubtotalMinor: row.subtotalMinor.toString(), discountMinor: row.discountMinor.toString(), quotedLines: readQuotationLines(row.lines), updatedAt: row.updatedAt.toISOString() }
  if (!isOpenQuotation(row)) return { ...base, available: false, reason: row.orderId ? 'این پیشنهاد به سفارش تبدیل شده است؛ وضعیت را در سفارش‌های خود بررسی کنید' : 'این پیشنهاد لغو شده یا اعتبار آن پایان یافته است', fingerprint: '', changed: false, cart: null }
  try {
    const price = await quotationPrice(db, readQuotationLines(row.lines), row.userId, channel)
    if (price.currency !== row.currency || price.subtotalMinor <= row.discountMinor) throw new StoreError('قیمت یا تخفیف نیازمند پیشنهاد تازهٔ فروشنده است', 409)
    const [shipping, carriers, tier] = await Promise.all([getDeliverySettings(), getCarrierSettings(), tierStanding(row.userId)])
    const net = price.subtotalMinor - row.discountMinor, fee = tier?.freeShipping ? 0n : shippingFeeMinor(shipping, price.currency, net)
    const old = readQuotationLines(row.lines)
    const changed = old.some((line, i) => line.unitMinor !== price.lines[i]?.unitMinor)
    return { ...base, available: true, reason: '', fingerprint: quotationFingerprint(row, price, channel), changed, cart: { token: '', lines: price.lines, count: price.lines.reduce((n, line) => n + line.quantity, 0), currency: price.currency, itemsTotal: minorToNumber(net, price.currency), listTotal: minorToNumber(price.subtotalMinor, price.currency), saving: minorToNumber(row.discountMinor, price.currency), shipping: minorToNumber(fee, price.currency), total: minorToNumber(net + fee, price.currency), hasPhysical: true, blocked: false, shippingByAddress: carriers.enabled } }
  } catch (error) { if (error instanceof StoreError) return { ...base, available: false, reason: error.message, fingerprint: '', changed: false, cart: null }; throw error }
}

/** Locks and rechecks the reviewed quote. A caller cannot submit a client-controlled discount. */
export async function checkQuotation(tx: Client, input: { id: number; userId: number; fingerprint: string; channel: QuotationChannel; lines: { productId: number | null; variantId?: number | null; quantity: number; unitPriceMinor?: bigint }[]; currency: string; subtotalMinor: bigint }) {
  // Match the existing counter lock order: products first, then the proposal claim.
  if (!('$transaction' in tx)) for (const id of [...new Set(input.lines.map(line => line.productId).filter((id): id is number => !!id))].sort((a, b) => a - b)) await lockProduct(tx, id)
  if ('$queryRaw' in tx) await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "StoreQuotation" WHERE "id"=${input.id} FOR UPDATE`)
  const row = await tx.storeQuotation.findUnique({ where: { id: input.id } })
  if (!row || row.userId !== input.userId) throw new StoreError('پیشنهاد برای این مشتری در دسترس نیست', 404, 'QUOTATION_NOT_FOUND')
  if (!isOpenQuotation(row)) throw new StoreError('پیشنهاد قبلاً تبدیل، لغو یا منقضی شده است', 409, 'QUOTATION_CLOSED')
  const price = await quotationPrice(tx, readQuotationLines(row.lines), row.userId, input.channel)
  if (input.fingerprint !== quotationFingerprint(row, price, input.channel) || input.currency !== row.currency || price.currency !== row.currency || price.subtotalMinor !== input.subtotalMinor || row.discountMinor >= price.subtotalMinor || price.lines.length !== input.lines.length || price.lines.some((line, i) => line.productId !== input.lines[i]?.productId || line.variantId !== (input.lines[i]?.variantId || null) || line.quantity !== input.lines[i]?.quantity || (input.lines[i]?.unitPriceMinor !== undefined && line.unitMinor !== input.lines[i].unitPriceMinor!.toString()))) throw new StoreError('قیمت، موجودی یا نسخهٔ پیشنهاد تغییر کرده است؛ دوباره بررسی و تأیید کنید', 409, 'QUOTATION_CHANGED')
  return row
}
export async function claimQuotation(tx: Prisma.TransactionClient, row: StoreQuotation, orderId: number) {
  const changed = await tx.storeQuotation.updateMany({ where: { id: row.id, userId: row.userId, status: 'OPEN', orderId: null, updatedAt: row.updatedAt, expiresAt: { gt: new Date() } }, data: { status: 'CONVERTED', orderId, convertedAt: new Date() } })
  if (changed.count !== 1) throw new StoreError('پیشنهاد هم‌زمان تغییر کرده است', 409, 'QUOTATION_CHANGED')
}
