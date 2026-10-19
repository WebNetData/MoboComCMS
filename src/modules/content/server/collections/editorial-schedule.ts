import { NextRequest } from 'next/server'
import { randomUUID } from 'node:crypto'
import { db } from '@/platform/database/prisma'
import { auditAdminStrict } from '@/platform/audit/server'
import { requireAdmin, resolveCurrentUser, adminNeedsTwoFactor, type AuthedUser } from '@/modules/identity/server/access'
import { CONTENT_EDIT_PERMISSIONS, hasPermission } from '@/modules/identity/rbac'
import { CollectionError, getCollection } from '@/modules/content/server/collections'

const maySchedule = (actor: AuthedUser | null): actor is AuthedUser => !!actor && actor.role === 'ADMIN' && (actor.roleId == null || CONTENT_EDIT_PERMISSIONS.some(permission => hasPermission(actor.permissions || [], permission)))
const reset = { publishAt: null, scheduledById: null, scheduleAuthorizedAt: null, scheduleError: '' }
export { reset as clearEditorialSchedule }

/** Future absolute instant, never a locale-dependent date or silent publish-now. */
export function editorialPublicationTime(value: unknown, now = new Date()) {
  if (value === null) return null
  const parts = typeof value === 'string' ? /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.exec(value) : null
  if (!parts) throw new CollectionError('زمان انتشار باید تاریخ و منطقهٔ زمانی معتبر داشته باشد')
  const [, year, month, day, hour, minute, second = '0'] = parts
  if (+month < 1 || +month > 12 || +day < 1 || +day > new Date(Date.UTC(+year, +month, 0)).getUTCDate() || +hour > 23 || +minute > 59 || +second > 59) throw new CollectionError('تاریخ انتشار معتبر نیست')
  const date = new Date(value as string)
  if (!Number.isFinite(date.getTime()) || date <= now || date.getTime() > now.getTime() + 366 * 86400000) throw new CollectionError('زمان انتشار باید در آینده و حداکثر تا یک سال باشد')
  return date
}

export async function scheduleEditorialCollection(req: NextRequest, id: number, value: unknown, expected?: unknown) {
  const publishAt = editorialPublicationTime(value)
  if (publishAt && !(await getCollection(id, null, undefined, true)).items.length) throw new CollectionError('Collection needs a published item')
  return db.$transaction(async tx => {
    const actor = await requireAdmin(req, tx)
    if (!maySchedule(actor)) throw new CollectionError('دسترسی مجاز نیست', 403)
    const row = await tx.userCollection.findFirst({ where: { id, staffAuthored: true } })
    if (!row) throw new CollectionError('Collection unavailable', 404)
    if (expected !== undefined && expected !== row.updatedAt.toISOString()) throw new CollectionError('مجموعه هم‌زمان تغییر کرده است؛ صفحه را تازه کنید', 409)
    if (publishAt && row.visibility !== 'PRIVATE') throw new CollectionError('ابتدا مجموعه را به پیش‌نویس برگردانید', 409)
    const changed = await tx.userCollection.updateMany({ where: { id, staffAuthored: true, updatedAt: row.updatedAt }, data: publishAt ? { publishAt, scheduledById: actor.id, scheduleAuthorizedAt: new Date(), scheduleError: '' } : reset })
    if (!changed.count) throw new CollectionError('مجموعه هم‌زمان تغییر کرده است', 409)
    await auditAdminStrict({ req, actor, action: publishAt ? 'collection.editorial.schedule' : 'collection.editorial.cancel_schedule', targetType: 'UserCollection', targetId: id, metadata: { publishAt: publishAt?.toISOString() || null } }, tx)
    return { scheduled: !!publishAt }
  }, { isolationLevel: 'Serializable' })
}

/** Existing scheduler step. Exact schedule/version claims fence cancel, reschedule and duplicate workers. */
export async function publishDueEditorialCollections(limit = 20, now = new Date()) {
  const rows = await db.userCollection.findMany({ where: { staffAuthored: true, visibility: 'PRIVATE', publishAt: { lte: now }, scheduleError: '' }, orderBy: [{ publishAt: 'asc' }, { id: 'asc' }], take: Math.max(1, Math.min(50, Math.trunc(limit) || 20)) })
  let published = 0, blocked = 0
  for (const row of rows) {
    const visible = (await getCollection(row.id, null, undefined, true).catch(() => null))?.items.length
    await db.$transaction(async tx => {
      const actor = row.scheduledById && row.scheduleAuthorizedAt ? await resolveCurrentUser(row.scheduledById, row.scheduleAuthorizedAt.getTime(), tx) : null
      const allowed = maySchedule(actor) && !await adminNeedsTwoFactor(actor, tx)
      const reason = !allowed ? 'دسترسی ثبت‌کنندهٔ زمان‌بندی تغییر کرده است؛ زمان‌بندی را دوباره بررسی کنید.' : !visible ? 'مجموعه موردِ قابل نمایش ندارد؛ محتوا و زمان‌بندی را بررسی کنید.' : ''
      const changed = await tx.userCollection.updateMany({ where: { id: row.id, staffAuthored: true, visibility: 'PRIVATE', publishAt: row.publishAt, updatedAt: row.updatedAt, scheduleError: '' }, data: reason ? { scheduleError: reason } : { visibility: 'EDITORIAL', ...reset } })
      if (!changed.count) return
      if (reason) { blocked++; return }
      const req = new NextRequest('http://internal.invalid/collections/scheduled-publication', { headers: { 'x-request-id': `scheduler-${randomUUID()}` } })
      await auditAdminStrict({ req, actor: actor!, action: 'collection.editorial.publish_scheduled', targetType: 'UserCollection', targetId: row.id, metadata: { scheduledFor: row.publishAt!.toISOString(), source: 'scheduler' } }, tx)
      published++
    }, { isolationLevel: 'Serializable' })
  }
  return { checked: rows.length, published, blocked }
}
