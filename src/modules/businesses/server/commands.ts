import type { Prisma } from '@prisma/client'
import type { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { requirePerm, requireUser } from '@/modules/identity/server/access'
import { moduleGuard } from '@/extensions/server/modules'
import { auditAdminStrict } from '@/platform/audit/server'
import { BusinessError } from '../domain/businesses'
import { businessId, normalizeBusinessProfile } from '../domain/profiles'
import { refreshBusinessRating } from '@/modules/reviews/server/reviews'

export async function businessTransaction<T>(req: NextRequest, admin: boolean, work: (tx: Prisma.TransactionClient, actor: NonNullable<Awaited<ReturnType<typeof requireUser>>>) => Promise<T>) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(async tx => {
        if (await moduleGuard('businesses', tx) || await moduleGuard('reviews', tx)) throw new BusinessError('این بخش فعال نیست', 404)
        const actor = admin ? await requirePerm(req, 'businesses.manage', tx) : await requireUser(req, tx)
        if (!actor) throw new BusinessError('دسترسی به این عملیات ندارید', admin ? 403 : 401)
        return work(tx, actor)
      }, { isolationLevel: 'Serializable', timeout: 15000, maxWait: 10000 })
    } catch (error) {
      if (attempt < 4 && error && typeof error === 'object' && 'code' in error && error.code === 'P2034') continue
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') throw new BusinessError('این کسب‌وکار، فروشنده یا تجربه قبلاً ثبت شده است', 409)
      throw error
    }
  }
}

export async function saveBusinessProfile(req: NextRequest, input: Record<string, unknown>) {
  const data = normalizeBusinessProfile(input), id = input.id !== undefined && input.id !== null ? businessId(input.id) : null
  return businessTransaction(req, true, async (tx, actor) => {
    const previous = id ? await tx.businessProfile.findUnique({ where: { id } }) : null
    if (id && !previous) throw new BusinessError('کسب‌وکار پیدا نشد', 404)
    if (previous && (previous.slug !== data.slug || previous.kind !== data.kind || previous.sellerId !== data.sellerId || previous.domain !== data.domain)) throw new BusinessError('هویت کسب‌وکار پس از ثبت قابل جابه‌جایی نیست', 409)
    if (data.sellerId && !await tx.seller.findFirst({ where: { id: data.sellerId, status: 'ACTIVE' } })) throw new BusinessError('فروشندهٔ فعال پیدا نشد', 400)
    if (data.representativeId && !await tx.user.findFirst({ where: { id: data.representativeId, status: 'ACTIVE' } })) throw new BusinessError('حساب نمایندهٔ فعال پیدا نشد', 400)
    if (data.representativeId && data.representativeId !== previous?.representativeId && input.acknowledgeRepresentative !== true) throw new BusinessError('تأیید بررسی ارتباط نماینده با کسب‌وکار لازم است', 400)
    if (data.kind === 'SITE' && await tx.businessProfile.findFirst({ where: { kind: 'SITE', ...(id ? { id: { not: id } } : {}) } })) throw new BusinessError('پروفایل فروشگاه سایت قبلاً ساخته شده است', 409)
    const saved = id ? await tx.businessProfile.update({ where: { id }, data }) : await tx.businessProfile.create({ data })
    await refreshBusinessRating(tx, saved)
    await auditAdminStrict({ req, actor, action: 'businesses.profile.save', targetType: 'business', targetId: saved.id, metadata: { kind: data.kind, status: data.status, representativeId: data.representativeId } }, tx)
    return saved
  })
}
