import type { NextRequest } from 'next/server'
import { moduleGuard } from '@/extensions/server/modules'
import { requirePerm } from '@/modules/identity/server/access'
import { parseForm } from '@/modules/forms/domain/forms'
import { mayHandle } from '@/modules/forms/server/advanced'
import { err } from '@/platform/http/response'
import { ExpertOrderTicketError } from '@/modules/support/server/expert-order-ticket'
import { expertOrderTicketResponse } from '@/modules/support/server/expert-order-ticket-http'

type RouteContext = { params: Promise<{ id: string }> }

async function expertFormOrderTicket(req: NextRequest, { params }: RouteContext) {
  const disabled = await moduleGuard('forms')
  if (disabled) return disabled
  const id = Number((await params).id)
  if (!Number.isSafeInteger(id) || id < 1 || id > 2_147_483_647) return err('شمارهٔ درخواست معتبر نیست', 400)
  return expertOrderTicketResponse(req, async (tx, write) => {
    const builder = await requirePerm(req, 'cms.pages', tx)
    const actor = builder || await requirePerm(req, 'forms.handle', tx)
    if (!actor) throw new ExpertOrderTicketError('دسترسی مجاز نیست', 403)
    const row = await tx.formSubmission.findUnique({
      where: { id },
      select: { userId: true, orderId: true, assigneeId: true, payStatus: true, status: true, stage: true, repairVersion: true, form: true },
    })
    if (!row || row.userId === null || row.orderId === null || row.payStatus !== 'PAID' || row.status === 'SPAM') throw new ExpertOrderTicketError('درخواست پرداخت‌شده پیدا نشد', 404)
    if (!mayHandle(parseForm(row.form), actor, Boolean(builder)) || row.assigneeId !== actor.id) throw new ExpertOrderTicketError('ابتدا درخواست را بردارید', 403)
    if (write) {
      if (!row.stage || ['DONE', 'REJECTED'].includes(row.stage)) throw new ExpertOrderTicketError('رسیدگی این درخواست پایان یافته است', 409)
      const paid = await tx.order.updateMany({
        where: { id: row.orderId, userId: row.userId, status: 'PAID' },
        data: { status: 'PAID' },
      })
      if (!paid.count) throw new ExpertOrderTicketError('سفارش پرداخت‌شده پیدا نشد', 404)
      const claim = await tx.formSubmission.updateMany({
        where: {
          id, userId: row.userId, orderId: row.orderId, assigneeId: actor.id, payStatus: row.payStatus,
          status: row.status, stage: row.stage, repairVersion: row.repairVersion,
        },
        data: { assigneeId: actor.id },
      })
      if (!claim.count) throw new ExpertOrderTicketError('وضعیت درخواست تغییر کرد. صفحه را تازه کنید.', 409)
    }
    return { actor, context: { key: `form:${id}`, orderId: row.orderId, userId: row.userId } }
  })
}

export { expertFormOrderTicket as GET, expertFormOrderTicket as POST }
