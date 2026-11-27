import type { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { auditAdminStrict } from '@/platform/audit/server'
import { parsePermissions } from '@/modules/identity/rbac'
import type { AuthedUser } from '@/modules/identity/server/access'
import { tehranDay } from '@/shared/time/day'
import { CRM_PERMISSIONS } from '@/modules/livechat/domain/crm-desk'
import { type FollowUpList, type FollowUpStatus, validFollowUpDay, validFollowUpId } from '@/modules/livechat/domain/crm-follow-ups'
import { ChatError } from '@/modules/livechat/domain/livechat'
import { currentOpportunityActor } from './crm-opportunities/access'
import { queueOpportunityFollowUpReminder } from './crm-opportunity-reminders'

export const mayManageFollowUps = (actor: AuthedUser) => actor.roleId == null || Boolean(actor.permissions?.includes('users.manage'))
const eligible = (staff: { roleId: number | null; roleRef: { permissions: string } | null }) =>
  staff.roleId == null || parsePermissions(staff.roleRef?.permissions || '').some(permission => CRM_PERMISSIONS.includes(permission))
export const crmFollowUpCustomer = { role: { not: 'ADMIN' }, erasedAt: null }
const customerWhere = (id: number) => ({ ...crmFollowUpCustomer, id })
const activeStaff = { role: 'ADMIN', status: 'ACTIVE', erasedAt: null }
const staffSelect = { id: true, name: true, roleId: true, roleRef: { select: { permissions: true } } } as const

export async function followUpAssignees() {
  const staff = await db.user.findMany({ where: activeStaff, select: staffSelect, orderBy: [{ name: 'asc' }, { id: 'asc' }] })
  return staff.filter(eligible).map(row => ({ id: row.id, name: row.name || `همکار ${row.id}` }))
}

export async function listFollowUps(userId: number, actor: AuthedUser): Promise<FollowUpList> {
  const customer = await db.user.findFirst({ where: customerWhere(userId), select: { id: true } })
  if (!customer) throw new ChatError('مشتری پیدا نشد', 404)
  const manager = mayManageFollowUps(actor)
  const where = { userId, user: customerWhere(userId) }
  const include = { assignee: { select: { name: true } } } as const
  const [open, closed, staff] = await Promise.all([
    db.crmFollowUp.findMany({ where: { ...where, status: 'OPEN' }, orderBy: [{ dueDay: 'asc' }, { id: 'asc' }], include, take: 51 }),
    db.crmFollowUp.findMany({ where: { ...where, status: { not: 'OPEN' } }, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], include, take: 21 }),
    manager ? followUpAssignees() : [],
  ])
  return {
    rows: [...open.slice(0, 50), ...closed.slice(0, 20)].map(row => ({
      id: row.id, title: row.title, dueDay: row.dueDay, status: row.status as FollowUpStatus, version: row.version,
      assigneeId: row.assigneeId, assigneeName: row.assignee?.name || (row.assigneeId ? `همکار ${row.assigneeId}` : ''),
      mayEdit: row.status === 'OPEN' && (manager || row.assigneeId === actor.id),
    })),
    staff,
    ownId: actor.id, mayAssign: manager, today: tehranDay(), hasMore: open.length > 50 || closed.length > 20,
  }
}

function taskFields(input: Record<string, unknown>) {
  const title = typeof input.title === 'string' ? input.title.trim() : ''
  if (!title || title.length > 160) throw new ChatError('عنوان پیگیری باید بین ۱ تا ۱۶۰ نویسه باشد')
  if (!validFollowUpDay(input.dueDay)) throw new ChatError('موعد پیگیری معتبر نیست')
  return { title, dueDay: input.dueDay }
}

export async function assigneeFor(tx: Prisma.TransactionClient, actor: AuthedUser, id: unknown) {
  if (!validFollowUpId(id)) throw new ChatError('مسئول پیگیری معتبر نیست')
  if (id !== actor.id && !mayManageFollowUps(actor)) throw new ChatError('برای واگذاری به همکار دسترسی ندارید', 403)
  const staff = await tx.user.findFirst({ where: { ...activeStaff, id }, select: staffSelect })
  if (!staff || !eligible(staff)) throw new ChatError('مسئول انتخاب‌شده دسترسی فعال به پروندهٔ مشتری ندارد', 409)
  return staff.id
}

export async function saveFollowUp(req: NextRequest, viewer: AuthedUser, userId: number, input: Record<string, unknown>, create: boolean) {
  const linkedId = create
    ? input.opportunityId
    : validFollowUpId(input.id)
      ? (await db.crmFollowUp.findFirst({ where: { id: input.id, userId }, select: { opportunityId: true } }))?.opportunityId
      : null
  if (linkedId != null && !validFollowUpId(linkedId)) throw new ChatError('شناسهٔ فرصت معتبر نیست')
  const initialOpportunity = linkedId
    ? await db.crmOpportunity.findFirst({ where: { id: linkedId, userId }, select: { assigneeId: true } })
    : null
  return db.$transaction(async tx => {
    // Match the account erasure lock on both sides of a new assignment.
    if (!process.env.DATABASE_URL?.startsWith('file:')) {
      const ids = [...new Set([userId, viewer.id, ...(validFollowUpId(input.assigneeId) ? [input.assigneeId] : []), ...(initialOpportunity?.assigneeId ? [initialOpportunity.assigneeId] : [])])]
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "User" WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`)
      if (linkedId) await tx.$queryRaw(Prisma.sql`SELECT id FROM "CrmOpportunity" WHERE id = ${linkedId} FOR UPDATE`)
    }
    if (!await tx.user.findFirst({ where: customerWhere(userId), select: { id: true } })) throw new ChatError('مشتری پیدا نشد', 404)
    const actor = linkedId ? await currentOpportunityActor(req, tx, viewer.id) : viewer
    let opportunity: { id: number; assigneeId: number | null; stage: string } | null = null
    if (linkedId) {
      opportunity = await tx.crmOpportunity.findFirst({ where: { id: linkedId, userId }, select: { id: true, assigneeId: true, stage: true } })
      if (!opportunity || opportunity.assigneeId !== initialOpportunity?.assigneeId) throw new ChatError('فرصت تغییر کرده است. صفحه را تازه کنید', 409)
      if (create && !mayManageFollowUps(actor) && opportunity.assigneeId !== actor.id) throw new ChatError('برای پیگیری این فرصت دسترسی ندارید', 403)
      if (opportunity.stage === 'WON' || opportunity.stage === 'LOST') throw new ChatError('فرصت بسته شده است', 409)
    }
    if (create) {
      const fields = taskFields(input)
      if (fields.dueDay < tehranDay()) throw new ChatError('موعد پیگیری تازه نمی‌تواند در گذشته باشد')
      const assigneeId = await assigneeFor(tx, actor, input.assigneeId ?? opportunity?.assigneeId ?? actor.id)
      const row = await tx.crmFollowUp.create({ data: { ...fields, userId, assigneeId, createdById: actor.id, opportunityId: opportunity?.id }, select: { id: true, version: true } })
      if (opportunity) await queueOpportunityFollowUpReminder(tx, { ...row, dueDay: fields.dueDay })
      await auditAdminStrict({ req, actor, action: 'crm.follow_up.create', targetType: 'user', targetId: userId, metadata: { followUpId: row.id, assigneeId } }, tx)
      return row
    }
    if (!validFollowUpId(input.id) || !validFollowUpId(input.version)) throw new ChatError('شناسه یا نسخهٔ پیگیری معتبر نیست')
    const row = await tx.crmFollowUp.findFirst({ where: { id: input.id, userId } })
    if (!row) throw new ChatError('پیگیری پیدا نشد', 404)
    if (row.opportunityId !== (linkedId ?? null)) throw new ChatError('پیگیری تغییر کرده است. فهرست را تازه کنید', 409)
    if (row.assigneeId !== actor.id && !mayManageFollowUps(actor)) throw new ChatError('تنها مسئول یا مدیر کاربران می‌تواند این پیگیری را تغییر دهد', 403)
    if (row.version !== input.version || row.status !== 'OPEN') throw new ChatError('پیگیری تغییر کرده است. فهرست را تازه کنید', 409)

    const status = input.status ?? 'OPEN'
    if (status !== 'OPEN' && status !== 'DONE' && status !== 'CANCELLED') throw new ChatError('وضعیت پیگیری معتبر نیست')
    const fields = status === 'OPEN' ? taskFields(input) : { title: row.title, dueDay: row.dueDay }
    const assigneeId = status === 'OPEN' && input.assigneeId != null && input.assigneeId !== row.assigneeId
      ? await assigneeFor(tx, actor, input.assigneeId)
      : row.assigneeId
    const changed = await tx.crmFollowUp.updateMany({
      where: { id: row.id, userId, status: 'OPEN', version: row.version, assigneeId: row.assigneeId },
      data: { ...fields, status, assigneeId, version: { increment: 1 } },
    })
    if (changed.count !== 1) throw new ChatError('پیگیری تغییر کرده است. فهرست را تازه کنید', 409)
    if (row.opportunityId && status === 'OPEN') await queueOpportunityFollowUpReminder(tx, { id: row.id, version: row.version + 1, dueDay: fields.dueDay })
    await auditAdminStrict({ req, actor, action: 'crm.follow_up.update', targetType: 'user', targetId: userId, metadata: { followUpId: row.id, status, assigneeId, version: row.version + 1 } }, tx)
    return { id: row.id, version: row.version + 1 }
  })
}
