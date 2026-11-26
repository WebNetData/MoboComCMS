import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import type { AuthedUser } from '@/modules/identity/server/access'
import { tehranDay } from '@/shared/time/day'
import type { FollowUpCounts, FollowUpQueue, FollowUpQueueItem, FollowUpQueueQuery } from '@/modules/livechat/domain/crm-follow-up-queue'
import { ChatError } from '@/modules/livechat/domain/livechat'
import { crmFollowUpCustomer, followUpAssignees, mayManageFollowUps } from '@/modules/livechat/server/crm-follow-ups'

const PAGE_SIZE = 20
const open = { status: 'OPEN', user: crmFollowUpCustomer }

const dateWhere = (today: string) => ({
  overdue: { lt: today },
  today,
  upcoming: { gt: today },
})

async function countDue(where: Prisma.CrmFollowUpWhereInput, today: string): Promise<FollowUpCounts> {
  const dueDay = dateWhere(today)
  const [overdue, todayCount, upcoming] = await Promise.all([
    db.crmFollowUp.count({ where: { ...where, dueDay: dueDay.overdue } }),
    db.crmFollowUp.count({ where: { ...where, dueDay: dueDay.today } }),
    db.crmFollowUp.count({ where: { ...where, dueDay: dueDay.upcoming } }),
  ])
  return { overdue, today: todayCount, upcoming }
}

async function readItems(where: Prisma.CrmFollowUpWhereInput, take: number, skip = 0): Promise<FollowUpQueueItem[]> {
  const rows = await db.crmFollowUp.findMany({
    where, take, skip, orderBy: [{ dueDay: 'asc' }, { id: 'asc' }],
    select: {
      id: true, title: true, userId: true, version: true, dueDay: true, updatedAt: true, assigneeId: true,
      user: { select: { name: true } }, assignee: { select: { name: true } },
    },
  })
  return rows.map(({ id, title, userId, version, dueDay, updatedAt, assigneeId, user, assignee }) => ({
    id, title, customerId: userId, customerName: user.name || `مشتری ${userId}`, version, dueDay, updatedAt: updatedAt.toISOString(),
    assigneeId, assigneeName: assignee?.name || (assigneeId ? `همکار ${assigneeId}` : ''),
  }))
}

export async function followUpWorkdesk(actor: AuthedUser) {
  const today = tehranDay()
  const where = { ...open, assigneeId: actor.id }
  const [counts, items] = await Promise.all([countDue(where, today), readItems(where, 5)])
  return { counts, items, today }
}

export async function listFollowUpQueue(actor: AuthedUser, query: FollowUpQueueQuery): Promise<FollowUpQueue> {
  const canManage = mayManageFollowUps(actor)
  if (!canManage && query.scope !== 'mine') throw new ChatError('برای مشاهدهٔ پیگیری همکاران دسترسی ندارید', 403)

  const today = tehranDay()
  const staff = canManage ? await followUpAssignees() : []
  if (typeof query.scope === 'number' && !staff.some(person => person.id === query.scope)) throw new ChatError('مسئول انتخاب‌شده معتبر نیست', 400)
  const where = {
    ...open,
    ...(query.scope === 'all' ? {} : { assigneeId: query.scope === 'mine' ? actor.id : query.scope === 'unassigned' ? null : query.scope }),
  }
  const counts = await countDue(where, today)
  const total = query.bucket === 'all' ? counts.overdue + counts.today + counts.upcoming : counts[query.bucket]
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const page = Math.min(query.page, pageCount)
  const items = total ? await readItems({
    ...where,
    ...(query.bucket === 'all' ? {} : { dueDay: dateWhere(today)[query.bucket] }),
  }, PAGE_SIZE, (page - 1) * PAGE_SIZE) : []
  return { items, counts, today, page, pageCount, staff, canManage }
}
