import { db } from '@/platform/database/prisma'
import { createInboxEvent } from '@/modules/notifications/server/inbox'
import { MarketplaceError, validateSellerProfile } from '@/modules/marketplace/domain/marketplace'
import { getMarketplaceSettings, marketplaceEnabled } from '@/modules/marketplace/server/marketplace/core'

export type SellerRow = NonNullable<Awaited<ReturnType<typeof sellerOfUser>>>

export async function sellerOfUser(userId: number) {
  return db.seller.findUnique({ where: { userId } })
}

/** The signed-in user's shop, which must be approved (seller panel APIs). */
export async function activeSeller(userId: number) {
  if (!await marketplaceEnabled()) throw new MarketplaceError('بازار فروشندگان فعال نیست', 404, 'DISABLED')
  const seller = await sellerOfUser(userId)
  if (!seller) throw new MarketplaceError('هنوز فروشنده نیستید', 403, 'NOT_SELLER')
  if (seller.status !== 'ACTIVE') throw new MarketplaceError(seller.status === 'PENDING' ? 'درخواست فروشندگی شما در حال بررسی است' : 'پنل فروشندگی شما فعال نیست', 403, 'SELLER_' + seller.status)
  return seller
}

export async function notifyAdmins(title: string, body: string, href: string, dedupeKey: string) {
  const admins = await db.user.findMany({ where: { role: 'ADMIN', status: 'ACTIVE' }, select: { id: true }, take: 20 })
  await Promise.all(admins.map((admin) => createInboxEvent({ userId: admin.id, kind: 'MARKETPLACE', dedupeKey: `${dedupeKey}:${admin.id}`, titleFa: title, titleEn: title, bodyFa: body, bodyEn: body, href }).catch(() => undefined)))
}

export async function notifySeller(seller: { id: number; userId: number }, title: string, body: string, href: string, dedupeKey: string) {
  await createInboxEvent({ userId: seller.userId, kind: 'MARKETPLACE', dedupeKey, titleFa: title, titleEn: title, bodyFa: body, bodyEn: body, href }).catch(() => undefined)
}

/** "Become a seller": creates the application (or goes live at once when auto-approve is on). */
export async function applySeller(userId: number, input: Record<string, unknown>) {
  if (!await marketplaceEnabled()) throw new MarketplaceError('بازار فروشندگان فعال نیست', 404)
  const settings = await getMarketplaceSettings()
  const existing = await sellerOfUser(userId)
  if (existing && existing.status !== 'REJECTED') throw new MarketplaceError('شما قبلاً درخواست فروشندگی داده‌اید', 409)
  if (!existing && !settings.signupOpen) throw new MarketplaceError('ثبت‌نام فروشنده در حال حاضر بسته است', 403)
  if (input.acceptTerms !== true) throw new MarketplaceError('برای ادامه، قوانین فروشندگی را بپذیرید')
  const profile = validateSellerProfile(input)
  if (!profile.phone) throw new MarketplaceError('شمارهٔ تماس فروشگاه را وارد کنید')
  const taken = await db.seller.findFirst({ where: { slug: profile.slug, NOT: { userId } }, select: { id: true } })
  if (taken) throw new MarketplaceError('این نشانی فروشگاه قبلاً گرفته شده است', 409)
  const status = settings.autoApproveSellers ? 'ACTIVE' : 'PENDING'
  const data = { ...profile, status, statusNote: '', approvedAt: status === 'ACTIVE' ? new Date() : null }
  const seller = existing ? await db.seller.update({ where: { id: existing.id }, data }) : await db.seller.create({ data: { ...data, userId } })
  if (status === 'PENDING') await notifyAdmins('درخواست فروشندگی تازه', `«${seller.shopName}» منتظر بررسی است.`, '/admin/marketplace?status=PENDING', `seller-apply:${seller.id}:${Date.now()}`)
  return seller
}

export async function updateSellerProfile(seller: SellerRow, input: Record<string, unknown>) {
  const profile = validateSellerProfile({ ...seller, ...input }, { requireLegal: false })
  if (profile.slug !== seller.slug && await db.seller.findFirst({ where: { slug: profile.slug, NOT: { id: seller.id } }, select: { id: true } })) throw new MarketplaceError('این نشانی فروشگاه قبلاً گرفته شده است', 409)
  // Legal identity is fixed after approval; the admin changes it if needed.
  const { legalName: _legal, nationalId: _national, kind: _kind, ...editable } = profile
  return db.seller.update({ where: { id: seller.id }, data: editable })
}
