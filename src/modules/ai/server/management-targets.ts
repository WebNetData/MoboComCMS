import type { Prisma } from '@prisma/client'
import { paidBotReviewEvidence } from '@/modules/billing/server/pay'
import type { AuthedUser } from '@/modules/identity/server/access'
import { orderSpecialists } from '@/modules/store/server/order-work'
import { allowedDepartmentSlugs, heldByAnother } from '@/modules/support/server/department-access'
import type { ActionSignal, DeskTargets } from '../domain/management'

const number = new Intl.NumberFormat('fa-IR', { useGrouping: false })
const time = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Tehran' })
const fulfillmentFacts: Record<string, string> = {
  FAILED: 'آخرین کار تحویل در صف با خطا متوقف شده است.',
  PROCESSING: 'آخرین کار تحویل در وضعیت پردازش است.',
  PENDING: 'آخرین کار تحویل در صف انتظار است.',
  DONE: 'کار صف تمام شده اما وضعیت تحویل هنوز در انتظار است.',
}

export async function managementTargets(tx: Prisma.TransactionClient, actor: AuthedUser, signal: ActionSignal, id?: string): Promise<DeskTargets> {
  const before = new Date(Date.now() - 86_400_000)
  if (signal === 'support.stale') {
    const departments = await allowedDepartmentSlugs(actor, tx)
    const rows = await tx.ticket.findMany({
      where: { status: 'OPEN', updatedAt: { lt: before }, ...(departments === null ? {} : { department: { in: departments } }), ...(id ? { id: Number(id) } : {}) },
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }], take: id ? 1 : 15,
      select: { id: true, assignedToId: true, updatedAt: true },
    })
    return { assignees: [], targets: rows.map(row => ({
      id: String(row.id), stamp: row.updatedAt.toISOString(), label: `تیکت ${number.format(row.id)}`,
      facts: [`آخرین تغییر ${time.format(row.updatedAt)}`, ...(row.assignedToId ? [`کارشناس ${number.format(row.assignedToId)}`] : ['بدون مسئول'])],
      commands: heldByAnother(actor, row.assignedToId) ? ['TICKET_NOTE'] : ['TICKET_NOTE', 'TICKET_REPLY'],
    })) }
  }
  if (signal === 'store.fulfilment') {
    const rows = await tx.order.findMany({
      where: { saleSource: 'ONLINE', productId: { not: null }, status: 'PAID',
        productDelivery: { is: { status: 'PENDING', updatedAt: { lt: before } } }, ...(id ? { id: Number(id) } : {}) },
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }], take: id ? 1 : 15,
      select: { id: true, updatedAt: true, assignee: { select: { id: true, name: true } }, productDelivery: { select: { updatedAt: true } } },
    })
    const jobs = await tx.fulfillmentJob.findMany({
      where: { orderId: { in: rows.map(row => row.id) }, kind: 'DELIVER_PRODUCT' },
      orderBy: { id: 'desc' }, distinct: ['orderId'], select: { orderId: true, status: true, updatedAt: true },
    })
    const latest = new Map(jobs.map(job => [job.orderId, job]))
    return { assignees: id ? [] : await orderSpecialists(tx), targets: rows.map(row => ({
      id: String(row.id), stamp: `${row.updatedAt.toISOString()}|${row.productDelivery?.updatedAt.toISOString()}|${latest.get(row.id)?.updatedAt.toISOString() || ''}`, label: `سفارش ${number.format(row.id)}`,
      facts: [fulfillmentFacts[latest.get(row.id)?.status || ''] || 'علت توقف در صف تحویل ثبت نشده است.',
        row.assignee ? `مسئول فعلی ${row.assignee.name || number.format(row.assignee.id)}` : 'بدون مسئول تحویل'],
      commands: ['ORDER_NOTE', 'ORDER_ASSIGN'],
    })) }
  }
  const rows = await paidBotReviewEvidence(tx, id)
  return { assignees: [], targets: rows.map(row => ({
    id: row.id, stamp: String(row.version), label: row.externalId,
    facts: [`پایانه ${row.terminalName}`, row.reason,
      row.lastAttemptAt ? `آخرین تلاش ${time.format(new Date(row.lastAttemptAt))}` : 'زمان تلاش ثبت نشده است.',
      `تعداد تلاش ${number.format(row.attempts)}`, ...(row.httpStatus ? [`HTTP ${row.httpStatus}`] : [])],
    commands: ['PAY_ASSESSMENT'],
  })) }
}
