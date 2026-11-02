import { db } from '@/platform/database/prisma'
import type { Prisma } from '@prisma/client'
import { normalizeMobile } from '@/modules/sms/domain/sms'
import { latinDigits } from '@/shared/text/digits'
import { GroupError, memberActive, normalizeGroup, type GroupDeal, dealKey, NO_DEAL } from '@/modules/account/domain/user-groups'
import { tierStanding } from '@/modules/membership/server/tiers'

/** The active groups a member is in now. Expiry is read here, so no job has to remove anyone in time. */
function membershipsOf(userId: number, now = new Date()) {
  return db.userGroupMember.findMany({ where: { userId, ...memberActive(now) }, select: { groupId: true, group: { select: { vipBenefits: true, hideAds: true, discountPercent: true } } } })
}

export const groupGivesVip = async (userId: number | null | undefined) => Boolean(userId) && (await membershipsOf(userId!)).some((row) => row.group.vipBenefits)
export const groupHidesAds = async (userId: number | null | undefined) => Boolean(userId) && ((await membershipsOf(userId!)).some((row) => row.group.hideAds) || !!(await tierStanding(userId))?.hideAds)

/** The prices a member's groups give on some products: the best discount, and the lowest price set per item. */
export async function groupDeal(userId: number | null | undefined, productIds: readonly number[]): Promise<GroupDeal> {
  if (!userId || !productIds.length) return NO_DEAL
  const [rows, standing] = await Promise.all([membershipsOf(userId), tierStanding(userId)])
  const tierPercent = standing?.storeDiscountPercent ?? 0
  if (!rows.length && !tierPercent) return NO_DEAL
  const percent = Math.max(tierPercent, ...rows.map((row) => row.group.discountPercent))
  const prices = new Map<string, bigint>()
  for (const row of await db.productGroupPrice.findMany({ where: { groupId: { in: rows.map((item) => item.groupId) }, productId: { in: [...productIds] } } })) {
    const key = dealKey(row.productId, row.variantId), held = prices.get(key)
    if (held === undefined || row.priceMinor < held) prices.set(key, row.priceMinor)
  }
  return { percent, prices }
}

// ------------------------------------------------------------------ admin

export async function adminGroups() {
  const now = new Date()
  const [groups, counts] = await Promise.all([
    db.userGroup.findMany({ orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] }),
    db.userGroupMember.groupBy({ by: ['groupId'], where: { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }, _count: { _all: true } }),
  ])
  const count = new Map(counts.map((row) => [row.groupId, row._count._all]))
  return groups.map((group) => ({ ...group, members: count.get(group.id) ?? 0 }))
}

export async function saveGroup(raw: Record<string, unknown>, client: Prisma.TransactionClient = db) {
  const data = normalizeGroup(raw)
  const id = Number(raw.id) || 0
  if (raw.id !== undefined && (!Number.isSafeInteger(id) || id <= 0)) throw new GroupError('شناسهٔ گروه معتبر نیست')
  if (id) {
    const expected = raw.updatedAt === undefined ? undefined : new Date(String(raw.updatedAt))
    if (expected && Number.isNaN(expected.getTime())) throw new GroupError('نسخهٔ گروه معتبر نیست')
    if ((await client.userGroup.updateMany({ where: { id, ...(expected ? { updatedAt: expected } : {}) }, data })).count !== 1) throw new GroupError('گروه حذف یا هم‌زمان ویرایش شده است؛ صفحه را تازه کنید', 409)
    return client.userGroup.findUniqueOrThrow({ where: { id } })
  }
  return client.userGroup.create({ data })
}

/** Deleting a group removes its memberships and prices; items still naming it stay closed until they are edited. */
export const deleteGroup = (id: number, client: Prisma.TransactionClient = db) => client.userGroup.deleteMany({ where: { id } })

export async function groupMembers(groupId: number, query: string, page: number) {
  const q = query.trim().slice(0, 80)
  const where = { groupId, ...(q ? { user: { OR: [{ email: { contains: q } }, { name: { contains: q } }, { phone: { contains: q } }] } } : {}) }
  const [rows, total] = await Promise.all([
    db.userGroupMember.findMany({ where, orderBy: { id: 'desc' }, skip: (page - 1) * 30, take: 30, include: { user: { select: { id: true, name: true, email: true, phone: true } } } }),
    db.userGroupMember.count({ where }),
  ])
  return { rows, total, pages: Math.max(1, Math.ceil(total / 30)), asOf: new Date().toISOString() }
}

export async function addGroupMember(input: { groupId: number; user: unknown; expiresAt: unknown; note: unknown; actorId: number }, client: Prisma.TransactionClient = db) {
  const who = latinDigits(input.user).trim().toLowerCase()
  if (!who) throw new GroupError('شناسه، ایمیل یا موبایل کاربر را وارد کنید')
  if (!await client.userGroup.findUnique({ where: { id: input.groupId }, select: { id: true } })) throw new GroupError('گروه پیدا نشد', 404)
  const target = await client.user.findFirst({ where: /^\d{1,9}$/.test(who) ? { id: Number(who) } : who.includes('@') ? { email: who } : { phone: normalizeMobile(who) || who }, select: { id: true } })
  if (!target) throw new GroupError('کاربر پیدا نشد')
  const expiresAt = input.expiresAt ? new Date(String(input.expiresAt)) : null
  if (expiresAt && Number.isNaN(expiresAt.getTime())) throw new GroupError('تاریخ پایان معتبر نیست')
  const note = String(input.note ?? '').trim().slice(0, 200)
  return client.userGroupMember.upsert({ where: { groupId_userId: { groupId: input.groupId, userId: target.id } }, create: { groupId: input.groupId, userId: target.id, expiresAt, note, addedBy: input.actorId }, update: { expiresAt, note } })
}

export const removeGroupMember = (groupId: number, userId: number, client: Prisma.TransactionClient = db) => client.userGroupMember.deleteMany({ where: { groupId, userId } })
