import type { Prisma } from '@prisma/client'
import { PayError } from '@/modules/billing/domain/pay'
import { requirePerm } from '@/modules/identity/server/access'
import type { PayActor } from '../context'

export async function reviewCollection(tx: Prisma.TransactionClient, actor: PayActor, id: string, financial = false) {
  const row = await tx.payBaleCollection.findUnique({ where: { id }, include: { invoice: { include: { payCollection: { include: { merchant: true } } } }, receipt: true } })
  if (!row) throw new PayError('درخواست پرداخت پیدا نشد', 404)
  if (!row.invoice.payCollection && !await requirePerm(actor.req, 'invoices.manage', tx)) throw new PayError('مجوز مدیریت فاکتورها لازم است', 403)
  if (financial && (row.invoice.userId === actor.id || row.invoice.payCollection?.merchant.userId === actor.id)) throw new PayError('تأیید دریافت خودتان مجاز نیست', 403)
  return row
}

export const noticeInclude = { transferReview: true, collectionMatch: { select: { id: true, status: true, invoice: { select: { number: true } }, reviewReason: true } } } as const
export function reviewNote(value: unknown) {
  if (typeof value !== 'string') throw new PayError('توضیح بررسی لازم است', 422)
  const clean = value.replace(/[\u0000-\u001f\u007f-\u009f<>]/g, ' ').trim()
  if (clean.length < 3 || clean.length > 300) throw new PayError('توضیح بررسی باید بین ۳ تا ۳۰۰ نویسه باشد', 422)
  return clean
}
