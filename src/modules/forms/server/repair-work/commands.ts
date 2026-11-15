import { assertFormsAvailable, formsAvailable } from '@/modules/forms/server/availability'
import { db } from '@/platform/database/prisma'
import { FormsError, workSteps } from '../../domain/forms'
import { toMinor } from '@/shared/money'
import { latinDigits } from '@/shared/text/digits'
import { auditAdminStrict, type AdminAuditInput } from '@/platform/audit/server'
import { requirePerm } from '@/modules/identity/server/access'
import { repairClaim, repairConflict, repairHash, repairPhone, type RepairClient, type RepairRow } from '../repair-access'
import { currentEstimate, requireRepair, repairWorkView, type RepairActor } from './read'
import { repairEvent } from './history'

export async function changeRepairWork(id: number, actor: RepairActor, input: Record<string, unknown>, audit: Pick<AdminAuditInput, 'req' | 'actor'>) {
  if (!Number.isSafeInteger(input.revision) || Number(input.revision) < 0) throw new FormsError('نسخهٔ پرونده معتبر نیست')
  return db.$transaction(async tx => {
    await assertFormsAvailable(tx)
    const builder = await requirePerm(audit.req, 'cms.pages', tx), handler = builder || await requirePerm(audit.req, 'forms.handle', tx)
    if (!handler || handler.id !== actor.id) throw new FormsError('دسترسی شما تغییر کرده است', 403)
    const { row } = await requireRepair(id, { id: handler.id, builder: !!builder, handler: true }, tx)
    if (row.repairVersion !== input.revision) throw repairConflict()
    if (!row.receivedAt || row.payStatus === 'UNPAID' || ['DONE', 'REJECTED'].includes(row.stage)) throw new FormsError('این پرونده برای برآورد یا تغییر موعد باز نیست', 409)
    const data: { repairVersion: { increment: number }; repairDueAt?: Date | null; estimateRevision?: number } = { repairVersion: { increment: 1 } }
    let description = '', amountMinor = 0n
    if (input.dueAt !== undefined) {
      if (input.dueAt === null) data.repairDueAt = null
      else if (typeof input.dueAt === 'string' && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(input.dueAt)) {
        const due = new Date(input.dueAt)
        if (!Number.isFinite(due.getTime()) || due < row.createdAt || due.getTime() > Date.now() + 366 * 86400000) throw new FormsError('موعد تحویل معتبر نیست')
        data.repairDueAt = due
      } else throw new FormsError('موعد تحویل باید زمان معتبر با منطقهٔ زمانی باشد')
    }
    if (input.estimate !== undefined) {
      const estimate = input.estimate as Record<string, unknown>
      if (!estimate || typeof estimate !== 'object' || Array.isArray(estimate)) throw new FormsError('برآورد معتبر نیست')
      description = typeof estimate.description === 'string' ? estimate.description.replace(/[\u0000-\u001f\u007f<>]/g, ' ').trim() : ''
      const amount = latinDigits(estimate.amount).trim()
      if (description.length < 3 || description.length > 1500 || !/^[1-9]\d{0,11}$/.test(amount)) throw new FormsError('شرح برآورد و مبلغ صحیحِ مثبت به تومان را وارد کنید')
      if (!repairPhone(row.data)) throw new FormsError('شمارهٔ همراه پذیرش برای تأیید مشتری لازم است', 409)
      if (row.repairOrderId && await tx.invoice.findFirst({ where: { orderId: row.repairOrderId, status: 'PAID' } })) throw new FormsError('این تعمیر فاکتور پرداخت‌شده دارد؛ برآورد تازه ثبت نمی‌شود', 409)
      amountMinor = toMinor(amount, 'IRT'); data.estimateRevision = row.estimateRevision + 1
    }
    if (data.repairDueAt === undefined && !description) throw new FormsError('تغییری ارسال نشده است')
    if ((await tx.formSubmission.updateMany({ where: repairClaim(row), data })).count !== 1) throw repairConflict()
    if (description) {
      await tx.repairEstimate.updateMany({ where: { submissionId: id, version: row.estimateRevision, supersededAt: null }, data: { supersededAt: new Date() } })
      const now = new Date()
      await tx.repairEstimate.create({ data: { submissionId: id, version: data.estimateRevision!, amountMinor, currency: 'IRT', description, contactHash: repairHash('contact', repairPhone(row.data)), receiptHash: repairHash('receipt', row.receiptToken), createdAt: now, expiresAt: new Date(now.getTime() + 7 * 86400000) } })
      await repairEvent(tx, row, 'ESTIMATE', 'برآورد هزینه ثبت شد', `نسخهٔ ${data.estimateRevision} — ${amountMinor.toString()} تومان؛ ${description}`)
    }
    if (data.repairDueAt !== undefined) await repairEvent(tx, row, 'DUE', 'موعد تحویل به‌روز شد', data.repairDueAt ? new Intl.DateTimeFormat('fa-IR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Tehran' }).format(data.repairDueAt) : 'موعد قبلی برداشته شد')
    await auditAdminStrict({ ...audit, action: 'forms.repair_work.update', targetType: 'form_submission', targetId: String(id), metadata: { estimateRevision: data.estimateRevision ?? row.estimateRevision, dueChanged: data.repairDueAt !== undefined } }, tx)
    const fresh = { ...row, repairVersion: row.repairVersion + 1, estimateRevision: data.estimateRevision ?? row.estimateRevision, repairDueAt: data.repairDueAt === undefined ? row.repairDueAt : data.repairDueAt }
    return { ...await repairWorkView(fresh, tx), canEdit: true }
  }, { isolationLevel: 'Serializable' })
}

/** Called after all work patch paths resolve, inside the same state-claim transaction. */
export async function assertRepairStage(tx: RepairClient, row: RepairRow, next: string | undefined, steps: ReturnType<typeof workSteps>) {
  await assertFormsAvailable(tx)
  if (!row.estimateRevision || !next || next === row.stage) return
  const target = steps.find(s => s.key === next)
  if (['OPEN', 'QUOTED', 'REJECTED'].includes(next) || (target?.receipt && !target.pickup && !target.invoice)) return
  const estimate = await currentEstimate(row, tx)
  if (estimate?.status === 'REJECTED' && !estimate.supersededAt && target?.pickup) return true
  if (!estimate || estimate.supersededAt || estimate.status !== 'APPROVED' || estimate.contactHash !== repairHash('contact', repairPhone(row.data)) || estimate.receiptHash !== repairHash('receipt', row.receiptToken)) throw new FormsError('ابتدا مشتری باید برآورد جاری هزینه را تأیید کند', 409)
}

export async function assertRepairInvoiceConsent(tx: RepairClient, id: number, totalMinor: bigint, currency: string) {
  await assertFormsAvailable(tx)
  const row = await tx.formSubmission.findUnique({ where: { id }, include: { form: true } })
  if (!row?.estimateRevision) return
  const estimate = await currentEstimate(row, tx)
  if (!estimate || estimate.supersededAt || estimate.status !== 'APPROVED' || estimate.contactHash !== repairHash('contact', repairPhone(row.data)) || estimate.receiptHash !== repairHash('receipt', row.receiptToken) || currency !== 'IRT' || totalMinor > estimate.amountMinor) throw new FormsError('فاکتور باید در محدودهٔ برآورد تأییدشدهٔ مشتری باشد؛ برای هزینهٔ بیشتر برآورد تازه ثبت کنید', 409)
  if ((await tx.formSubmission.updateMany({ where: repairClaim(row), data: { repairVersion: { increment: 1 } } })).count !== 1) throw repairConflict()
}
