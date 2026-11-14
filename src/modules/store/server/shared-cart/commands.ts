import { randomBytes } from 'node:crypto'
import { db } from '@/platform/database/prisma'
import { findCart, addReviewedCartSelection, type CartOwner } from '@/modules/store/server/cart'
import { StoreError } from '@/modules/store/domain/store'
import { hashShareToken, safeSharedProduct, sharedCartPreview, sharedSelection } from './read'

export async function createSharedCart(owner: CartOwner, raw: Record<string, unknown>) {
  const cart = await findCart(owner)
  if (!cart) throw new StoreError('سبد خرید خالی است')
  const title = String(raw.title || 'پیشنهاد خرید').replace(/[<>\u0000-\u001f]/g, ' ').trim().slice(0, 100), token = randomBytes(24).toString('hex')
  return db.$transaction(async tx => {
    const claimed = await tx.cart.updateMany({ where: { id: cart.id, ...(owner.userId ? { userId: owner.userId } : { userId: null, token: owner.token || '' }) }, data: { updatedAt: new Date() } })
    if (!claimed.count) throw new StoreError('سبد تغییر کرده است', 409)
    if (await tx.sharedCart.count({ where: { sourceCartId: cart.id, revokedAt: null, expiresAt: { gt: new Date() } } }) >= 20) throw new StoreError('حداکثر بیست لینک فعال می‌توانید داشته باشید؛ یکی از لینک‌های قبلی را لغو کنید', 409)
    const lines = await tx.cartLine.findMany({ where: { cartId: cart.id }, orderBy: { id: 'asc' }, include: { product: true } })
    if (!lines.length || lines.length > 50) throw new StoreError('یک تا پنجاه کالا لازم است')
    if (lines.some(line => !safeSharedProduct(line.product) || line.inputs || line.openAmountMinor > 0n)) throw new StoreError('فقط کالاهای فیزیکی عمومی و بدون اطلاعات خصوصی قابل اشتراک‌اند؛ کالاهای خدماتی یا دارای پاسخ سفارش را جدا کنید', 409)
    const share = await tx.sharedCart.create({ data: { sourceCartId: cart.id, title, tokenHash: hashShareToken(token), lines: JSON.stringify(lines.map(line => ({ productId: line.productId, variantId: line.variantKey || null, quantity: line.quantity }))), expiresAt: new Date(Date.now() + 7 * 86400_000) } })
    return { id: share.id, version: share.version, href: `/shared-cart/${token}`, expiresAt: share.expiresAt.toISOString() }
  })
}
export async function revokeSharedCart(owner: CartOwner, id: number, version: number) {
  const cart = await findCart(owner)
  if (!cart) throw new StoreError('لینک پیدا نشد', 404)
  const changed = await db.sharedCart.updateMany({ where: { id, sourceCartId: cart.id, version, revokedAt: null }, data: { revokedAt: new Date(), version: { increment: 1 } } })
  if (!changed.count) throw new StoreError('لینک تغییر کرده یا متعلق به این سبد نیست', 409)
}
export async function addSharedCart(owner: CartOwner, token: string, raw: Record<string, unknown>) {
  if (raw.confirmed !== true || typeof raw.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(raw.fingerprint) || typeof raw.requestId !== 'string' || !/^[\w-]{20,64}$/.test(raw.requestId)) throw new StoreError('قیمت‌ها و تعدادهای فعلی را تأیید کنید')
  const wants = sharedSelection(raw.lines)
  try {
    return await addReviewedCartSelection(owner, wants, async (tx, cartId) => {
      const prior = await tx.sharedCartImport.findUnique({ where: { cartId_requestId: { cartId, requestId: String(raw.requestId) } } })
      if (prior) { if (prior.fingerprint !== raw.fingerprint) throw new StoreError('شناسهٔ درخواست برای انتخاب دیگری استفاده شده است', 409); return false }
      const preview = await sharedCartPreview(token, owner, wants, tx, cartId)
      if (preview.fingerprint !== raw.fingerprint || preview.lines.some(line => line.issue)) throw new StoreError('قیمت، موجودی یا سبد شما تغییر کرده است؛ دوباره بررسی کنید', 409)
      const held = await tx.sharedCart.updateMany({ where: { id: preview.id, version: preview.version, revokedAt: null, expiresAt: { gt: new Date() } }, data: { version: preview.version } })
      if (!held.count) throw new StoreError('لینک پایان یافته یا لغو شده است؛ دوباره بررسی کنید', 409)
      await tx.sharedCartImport.create({ data: { shareId: preview.id, cartId, requestId: String(raw.requestId), fingerprint: preview.fingerprint } })
      return true
    })
  } catch (error) { if (['P2002', 'P2034'].includes(String((error as { code?: string }).code))) throw new StoreError('سبد هم‌زمان تغییر کرد؛ دوباره بررسی کنید', 409); throw error }
}
