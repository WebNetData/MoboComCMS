import { db } from '@/platform/database/prisma'
import { requestOtp, verifyOtp, SmsError } from '@/modules/sms/server/sms'
import { OTP_RESEND_MS, OTP_TTL_MS } from '@/modules/sms/domain/sms'
import { FormsError } from '../../domain/forms'
import type { RepairDecision } from '../../domain/repair-work'
import { eligibleRepair, REPAIR_SELECT, repairClaim, repairConflict, repairHash, repairPhone, type RepairClient } from '../repair-access'
import { trackingProjection } from '../repair-tracking-view'
import { currentEstimate, repairWorkView } from './read'
import { repairEvent } from './history'

type Input = { number: number; phone: string; estimateId: number; decision: RepairDecision }
const purpose = (input: Input) => `REPAIR_DECISION:${input.number}:${input.estimateId}:${input.decision}` as const
const generic = () => ({ message: 'اگر اطلاعات با برآورد جاری و شمارهٔ پذیرش مطابقت داشته باشد، کد ثبت پاسخ به همان شماره پیامک می‌شود.', expiresIn: OTP_TTL_MS / 1000, resendIn: OTP_RESEND_MS / 1000 })
const denied = () => new FormsError('کد یا اطلاعات برآورد معتبر نیست؛ وضعیت پرونده را دوباره دریافت کنید', 403)
async function pending(input: Input, tx: RepairClient = db) {
  if (!['APPROVED', 'REJECTED'].includes(input.decision)) return null
  const row = await tx.formSubmission.findUnique({ where: { id: input.number }, select: REPAIR_SELECT })
  if (!eligibleRepair(row) || row.payStatus === 'UNPAID' || ['DONE', 'REJECTED'].includes(row.stage) || repairPhone(row.data) !== input.phone) return null
  const estimate = await currentEstimate(row, tx)
  if (!estimate || estimate.id !== input.estimateId || estimate.status !== 'PENDING' || estimate.supersededAt || estimate.expiresAt.getTime() <= Date.now() || estimate.contactHash !== repairHash('contact', input.phone) || estimate.receiptHash !== repairHash('receipt', row.receiptToken)) return null
  return { row, estimate }
}
export async function requestEstimateCode(input: Input & { ip: string }) {
  const found = await pending(input)
  if (!found) return generic()
  const service = `${input.decision === 'APPROVED' ? 'تأیید' : 'رد'} برآورد ${found.estimate.version}: ${found.estimate.amountMinor.toString()} تومان — ${found.row.form.title}`
  try {
    await requestOtp({ phone: input.phone, purpose: purpose(input), ip: input.ip, context: { service }, beforeIssue: async tx => {
      const fresh = await pending(input, tx)
      if (!fresh) throw denied()
      if ((await tx.formSubmission.updateMany({ where: repairClaim(fresh.row), data: { repairVersion: { increment: 1 } } })).count !== 1) throw repairConflict()
    } })
  } catch (error) { if (!(error instanceof SmsError) && !(error instanceof FormsError)) throw error }
  return generic()
}
export async function decideEstimate(input: Input & { code: unknown }) {
  const result = await db.$transaction(async tx => {
    const found = await pending(input, tx)
    if (!found) return null
    try { await verifyOtp({ phone: input.phone, code: input.code, purpose: purpose(input) }, tx) }
    catch (error) { if (error instanceof SmsError) return null; throw error }
    const { row, estimate } = found
    if ((await tx.formSubmission.updateMany({ where: repairClaim(row), data: { repairVersion: { increment: 1 } } })).count !== 1) throw repairConflict()
    const changed = await tx.repairEstimate.updateMany({ where: { id: estimate.id, submissionId: row.id, version: row.estimateRevision, status: 'PENDING', supersededAt: null, decidedAt: null, expiresAt: { gt: new Date() } }, data: { status: input.decision, decidedAt: new Date() } })
    if (changed.count !== 1) throw repairConflict()
    await repairEvent(tx, row, input.decision, input.decision === 'APPROVED' ? 'مشتری هزینه را تأیید کرد' : 'مشتری برآورد را رد کرد', `نسخهٔ ${estimate.version} — ${estimate.amountMinor.toString()} تومان؛ پاسخ با کد یک‌بارمصرف شمارهٔ پذیرش ثبت شد`)
    const fresh = { ...row, repairVersion: row.repairVersion + 1 }
    return trackingProjection(fresh, await repairWorkView(fresh, tx))
  }, { isolationLevel: 'Serializable' })
  if (!result) throw denied()
  return result
}
