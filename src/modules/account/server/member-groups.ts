import { createHash } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { GroupError } from '@/modules/account/domain/user-groups'

/** Every membership writer uses the same user lock, including the existing group-by-group commands. */
export async function lockGroupMember(tx: Prisma.TransactionClient, userId: number, required = true) {
  const rows = process.env.DATABASE_URL?.startsWith('file:')
    ? await tx.user.findMany({ where: { id: userId }, select: { id: true } })
    : await tx.$queryRaw<{ id: number }[]>`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`
  if (!rows.length && required) throw new GroupError('کاربر پیدا نشد', 404)
  return rows.length > 0
}

const rowsFor = (client: Prisma.TransactionClient, userId: number) => client.userGroupMember.findMany({ where: { userId }, orderBy: { groupId: 'asc' } })
const revisionOf = (userId: number, rows: Awaited<ReturnType<typeof rowsFor>>) => createHash('sha256').update(JSON.stringify([userId, rows.map(r => [r.id, r.groupId, r.expiresAt?.toISOString() ?? null, r.note, r.addedBy, r.createdAt.toISOString()])])).digest('hex')

export async function memberGroupsSnapshot(userId: number) {
  if (!await db.user.findUnique({ where: { id: userId }, select: { id: true } })) throw new GroupError('کاربر پیدا نشد', 404)
  const [memberships, groups] = await Promise.all([rowsFor(db, userId), db.userGroup.findMany({ orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], select: { id: true, name: true, active: true } })])
  return { groups, memberships, revision: revisionOf(userId, memberships) }
}

/** Keeps metadata of retained memberships; changing groups cannot change staff standing or privileges. */
export async function setMemberGroups(tx: Prisma.TransactionClient, userId: number, ids: unknown, revision: unknown, actorId: number) {
  if (!Array.isArray(ids) || ids.length > 200 || ids.some(id => typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0 || id > 2147483647)) throw new GroupError('فهرست گروه‌ها معتبر نیست')
  const groupIds = [...new Set(ids as number[])].sort((a,b) => a-b)
  await lockGroupMember(tx, userId)
  const before = await rowsFor(tx, userId)
  if (typeof revision !== 'string' || revisionOf(userId, before) !== revision) throw new GroupError('عضویت‌ها هم‌زمان تغییر کرده‌اند؛ دوباره بارگذاری کنید', 409)
  if (await tx.userGroup.count({ where: { id: { in: groupIds } } }) !== groupIds.length) throw new GroupError('یکی از گروه‌ها حذف شده است؛ دوباره بارگذاری کنید', 409)
  await tx.userGroupMember.deleteMany({ where: { userId, groupId: { notIn: groupIds } } })
  const retained = new Set(before.map(r => r.groupId))
  for (const groupId of groupIds) if (!retained.has(groupId)) await tx.userGroupMember.create({ data: { userId, groupId, addedBy: actorId } })
  return groupIds
}
