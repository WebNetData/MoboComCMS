import { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { isModuleEnabled } from '@/extensions/server/modules'
import { parsePermissions } from '@/modules/identity/rbac'
import { CRM_PERMISSIONS } from '@/modules/livechat/domain/crm-desk'
import { validFollowUpId } from '@/modules/livechat/domain/crm-follow-ups'
import { createInboxEvent } from '@/modules/notifications/server/inbox'
import { enqueue } from '@/modules/operations/server/enqueue'

const JOB = 'crm.opportunity-reminder'
const reminderDue = (dueDay: string) => new Date(`${dueDay}T09:00:00+03:30`)

/** Upcoming Tehran dates use the site's UTC+03:30 schedule. */
export async function queueOpportunityFollowUpReminder(
  tx: Prisma.TransactionClient, task: { id: number; version: number; dueDay: string },
) {
  const due = reminderDue(task.dueDay)
  const runAt = due.getTime() < Date.now() ? new Date() : due
  return enqueue(JOB, { taskId: task.id, version: task.version }, {
    dedupeKey: `crm:opportunity-reminder:${task.id}:${task.version}`, runAt,
  }, tx)
}

/** A queued reminder rechecks all current authority before creating an inbox-only event. */
export async function deliverOpportunityFollowUpReminder(payload: Record<string, unknown>, now = new Date()) {
  const { taskId, version } = payload
  if (!validFollowUpId(taskId) || !validFollowUpId(version)) throw new Error('Invalid CRM reminder job')
  const initial = await db.crmFollowUp.findUnique({
    where: { id: taskId }, select: { userId: true, assigneeId: true, opportunityId: true },
  })
  if (!initial?.assigneeId || !initial.opportunityId) return { skipped: 'removed' }
  return db.$transaction(async tx => {
    if (!process.env.DATABASE_URL?.startsWith('file:')) {
      const ids = [...new Set([initial.userId, initial.assigneeId!])]
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "User" WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`)
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "CrmOpportunity" WHERE id = ${initial.opportunityId} FOR UPDATE`)
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "CrmFollowUp" WHERE id = ${taskId} FOR UPDATE`)
    }
    if (!await isModuleEnabled('livechat', tx)) return { skipped: 'disabled' }
    const task = await tx.crmFollowUp.findUnique({
      where: { id: taskId },
      select: {
        id: true, version: true, status: true, userId: true, assigneeId: true, opportunityId: true, dueDay: true,
        user: { select: { erasedAt: true, role: true } },
        opportunity: { select: { stage: true, userId: true } },
        assignee: { select: { role: true, status: true, erasedAt: true, roleId: true, roleRef: { select: { permissions: true } } } },
      },
    })
    if (!task || task.version !== version || task.status !== 'OPEN' ||
        task.userId !== initial.userId || task.assigneeId !== initial.assigneeId ||
        task.opportunityId !== initial.opportunityId || !task.opportunity ||
        task.opportunity.userId !== task.userId || ['WON', 'LOST'].includes(task.opportunity.stage) ||
        task.user.erasedAt || task.user.role === 'ADMIN') return { skipped: 'changed' }
    if (reminderDue(task.dueDay) > now) return { skipped: 'early' }
    const staff = task.assignee
    if (!staff || staff.erasedAt || staff.status !== 'ACTIVE' || staff.role !== 'ADMIN' ||
        (staff.roleId !== null && !parsePermissions(staff.roleRef?.permissions || '').some(permission => CRM_PERMISSIONS.includes(permission)))) {
      return { skipped: 'ineligible' }
    }
    await createInboxEvent({
      userId: task.assigneeId!, kind: 'CRM',
      dedupeKey: `crm:opportunity-reminder:${task.id}:${task.assigneeId}:${task.dueDay}`,
      titleFa: 'موعد پیگیری فرصت فروش', titleEn: 'Sales opportunity follow-up',
      bodyFa: 'یک پیگیری فرصت فروش به موعد خود رسیده است.', bodyEn: '',
      href: '/admin/crm/follow-ups', channels: [],
    }, tx)
    return { delivered: true }
  })
}
