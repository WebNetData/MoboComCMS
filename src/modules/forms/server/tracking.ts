import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { latinDigits } from '@/shared/text/digits'
import { normalizeMobile, OTP_RESEND_MS, OTP_TTL_MS } from '@/modules/sms/domain/sms'
import { requestOtp, verifyOtp, SmsError } from '@/modules/sms/server/sms'
import { parseForm, workSteps, type StoredAnswer } from '../domain/forms'
import { matchesTrackingCode, parseTrackingCode } from './tracking-code'

export class RepairTrackingError extends Error { constructor(message: string, readonly status = 400) { super(message) } }
const refusal = () => new RepairTrackingError('اطلاعات پیگیری درست نیست یا دسترسی آن پایان یافته است', 403)
const select = { id: true, data: true, status: true, userId: true, stage: true, reply: true, createdAt: true, receivedAt: true, receiptToken: true, pickupCode: true, form: true } as const
type Row = Prisma.FormSubmissionGetPayload<{ select: typeof select }>
type Reader = Pick<Prisma.TransactionClient, 'formSubmission'>
const clean = (value: string, length: number) => value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, length)

export function trackingNumber(value: unknown): number | null {
  const input = latinDigits(value).trim()
  return /^[1-9]\d{0,9}$/.test(input) && Number(input) <= 2147483647 ? Number(input) : null
}

/** Same first normalized transaction contact as the stage-message owner; no identity promotion. */
function transactionPhone(row: Row): string {
  try {
    const answers: StoredAnswer[] = JSON.parse(row.data)
    if (!Array.isArray(answers)) return ''
    return answers.filter(answer => ['mobile', 'tel'].includes(answer.type || '')).map(answer => normalizeMobile(answer.value)).find(Boolean) || ''
  } catch { return '' }
}

async function receiptRow(id: number, client: Reader = db): Promise<Row | null> {
  const row = await client.formSubmission.findUnique({ where: { id }, select })
  if (!row || row.status === 'SPAM' || !/^[A-Za-z0-9_-]{20,40}$/.test(row.receiptToken)) return null
  const settings = parseForm(row.form).settings
  return settings?.service && settings.receipt.enabled ? row : null
}

/** Explicit customer projection, never receipt lines, handover codes, locks, staff or settings. */
function view(row: Row) {
  const steps = workSteps(parseForm(row.form).settings)
  const current = steps.find(step => step.key === row.stage)
  let reply = clean(row.reply, 1000)
  for (const secret of [row.receiptToken, row.pickupCode]) if (secret) reply = reply.split(secret).join('••••')
  return { number: row.id, title: clean(row.form.title, 120), stage: current?.key || '', stageLabel: current ? clean(current.label, 80) : 'در حال بررسی', createdAt: row.createdAt.toISOString(), receivedAt: row.receivedAt?.toISOString() || null, reply,
    steps: steps.map(step => ({ key: step.key, label: clean(step.label, 80), current: step.key === current?.key })) }
}

export async function lookupRepair(trackingCode: unknown) {
  const input = parseTrackingCode(trackingCode)
  if (!input) throw refusal()
  const row = await receiptRow(input.id)
  if (!row || !matchesTrackingCode(input, row.receiptToken)) throw refusal()
  return view(row)
}

export async function requestRepairCode(input: { number: number; phone: string; ip: string }) {
  const generic = { message: 'اگر شمارهٔ پذیرش و موبایل با رسید مطابقت داشته باشد، کد پیگیری برای همان شماره پیامک می‌شود. کد دو دقیقه اعتبار دارد.', expiresIn: OTP_TTL_MS / 1000, resendIn: OTP_RESEND_MS / 1000 }
  const row = await receiptRow(input.number)
  if (!row || transactionPhone(row) !== input.phone) return generic
  // A uniform response never reveals which receipt/contact matched or the provider outcome.
  try { await requestOtp({ phone: input.phone, purpose: `REPAIR:${row.id}`, ip: input.ip, context: { service: clean(row.form.title, 80) } }) }
  catch (error) { if (!(error instanceof SmsError)) throw error }
  return generic
}

export async function verifyRepairCode(input: { number: number; phone: string; code: unknown }) {
  const outcome = await db.$transaction(async tx => {
    const row = await receiptRow(input.number, tx)
    if (!row || transactionPhone(row) !== input.phone) return null
    try { await verifyOtp({ phone: input.phone, code: input.code, purpose: `REPAIR:${row.id}` }, tx) }
    catch (error) {
      // Wrong-code attempts must commit. Throwing out of this transaction would undo them.
      if (error instanceof SmsError) return null
      throw error
    }
    return view(row)
  }, { isolationLevel: 'Serializable' })
  if (!outcome) throw refusal()
  return outcome
}
