import { createHash } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { isPublicProduct } from '@/modules/catalog/domain/product-publication'
import { validateOrderFields } from '@/modules/store/domain/order-inputs'
import { lineLimit, StoreError } from '@/modules/store/domain/store'
import { unitPrice } from '@/modules/store/server/pricing'
import { isMember } from '@/modules/membership/server/membership'
import { groupDeal } from '@/modules/account/server/user-groups'
import { ruleRefusal } from '@/modules/membership/server/rules'
import { findCart, type CartOwner } from '@/modules/store/server/cart'

export type SharedLine = { productId: number; variantId: number | null; quantity: number }
export const hashShareToken = (token: string) => createHash('sha256').update(token).digest('hex')
export const isShareToken = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{48}$/.test(value)
export function safeSharedProduct(row: { active: boolean; approval: string; audienceGroups: string; access: string; kind: string; isService: boolean; openAmount: boolean; sellerId: number | null; orderFields: string }) {
  try { return isPublicProduct(row) && row.access === 'PUBLIC' && row.kind === 'PHYSICAL' && !row.isService && !row.openAmount && !row.sellerId && !validateOrderFields(row.orderFields || '[]').length } catch { return false }
}
export function sharedSelection(raw: unknown): SharedLine[] {
  const value: unknown = typeof raw === 'string' ? JSON.parse(raw) : raw
  if (!Array.isArray(value) || !value.length || value.length > 50) throw new StoreError('کالاهای انتخاب‌شده معتبر نیستند')
  const lines = value.map(row => ({ productId: Number(row?.productId), variantId: Number(row?.variantId) || null, quantity: Number(row?.quantity) }))
  if (lines.some(row => !Number.isSafeInteger(row.productId) || row.productId < 1 || (row.variantId !== null && (!Number.isSafeInteger(row.variantId) || row.variantId < 1)) || !Number.isSafeInteger(row.quantity) || row.quantity < 1 || row.quantity > 999) || new Set(lines.map(row => `${row.productId}:${row.variantId || 0}`)).size !== lines.length) throw new StoreError('کالا یا تعداد معتبر نیست')
  return lines
}
export async function sharedCartPreview(token: string, owner: CartOwner, selection?: SharedLine[], client: Prisma.TransactionClient | typeof db = db, cartId?: number) {
  if (!isShareToken(token)) throw new StoreError('لینک معتبر نیست', 404)
  const row = await client.sharedCart.findUnique({ where: { tokenHash: hashShareToken(token) } })
  if (!row || row.revokedAt || row.expiresAt <= new Date()) throw new StoreError('این لینک پایان یافته یا لغو شده است', 404)
  const original = sharedSelection(row.lines), wants = selection || original
  if (wants.some(want => !original.some(item => item.productId === want.productId && item.variantId === want.variantId))) throw new StoreError('انتخاب خارج از سبد مشترک است')
  const cart = cartId ? { id: cartId } : await findCart(owner)
  const existing = cart ? await client.cartLine.findMany({ where: { cartId: cart.id }, select: { productId: true, variantKey: true, quantity: true, updatedAt: true } }) : []
  const rows = await client.product.findMany({ where: { id: { in: original.map(item => item.productId) } }, include: { variants: { where: { active: true } } } })
  const member = owner.userId ? await isMember(owner.userId) : false, deal = await groupDeal(owner.userId, original.map(item => item.productId))
  const lines = []
  for (const want of wants) {
    const product = rows.find(item => item.id === want.productId), variant = product?.variants.find(item => item.id === want.variantId)
    const eligible = !!product && safeSharedProduct(product) && (!want.variantId ? !product.variants.length : !!variant) && !await ruleRefusal(owner.userId, [{ ownerType: 'product', ownerId: product.id }])
    const max = eligible && product ? lineLimit(product.stock, variant?.stock ?? null, product.maxPerOrder) : 0
    const price = eligible && product ? unitPrice(product, variant || null, member, new Date(), deal) : null
    const issue = !eligible ? 'این کالا یا گونه دیگر قابل خرید نیست' : max < want.quantity ? 'تعداد انتخاب‌شده با موجودی یا سقف خرید روز سازگار نیست' : price && price.unitMinor <= 0n ? 'قیمت نیازمند بررسی است' : ''
    lines.push({ ...want, name: eligible ? product!.name : 'کالای در دسترس‌نبودنی', variantName: eligible ? variant?.name || '' : '', href: eligible ? `/products/${encodeURIComponent(product!.slug)}` : '', image: eligible ? product!.image : '', maxQuantity: max, unitMinor: price?.unitMinor.toString() || '0', currency: price?.currency || '', issue, revision: eligible ? JSON.stringify([product!.updatedAt, product!.stock, variant]) : '' })
  }
  const fingerprint = createHash('sha256').update(JSON.stringify([row.id, row.version, row.expiresAt, owner.userId, cart?.id || 0, existing, lines])).digest('hex')
  return { id: row.id, title: row.title, expiresAt: row.expiresAt.toISOString(), version: row.version, fingerprint, lines: lines.map(({ revision, ...line }) => line) }
}
