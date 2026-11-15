import { db } from '@/platform/database/prisma'
import { latinDigits } from '@/shared/text/digits'
import { OTP_RESEND_MS, OTP_TTL_MS } from '@/modules/sms/domain/sms'
import { requestOtp, verifyOtp, SmsError } from '@/modules/sms/server/sms'
import { eligibleRepair, publicRepairText, REPAIR_SELECT, repairPhone, type RepairRow, type RepairClient } from './repair-access'
import { repairWorkView } from './repair-work'
import { trackingProjection } from './repair-tracking-view'
import { matchesTrackingCode, parseTrackingCode } from './tracking-code'

export class RepairTrackingError extends Error { constructor(message: string, readonly status = 400) { super(message) } }
const refusal = () => new RepairTrackingError('اطلاعات پیگیری درست نیست یا دسترسی آن پایان یافته است', 403)
export function trackingNumber(value: unknown): number | null {
  const input = latinDigits(value).trim()
  return /^[1-9]\d{0,9}$/.test(input) && Number(input) <= 2147483647 ? Number(input) : null
}
async function receiptRow(id: number, client: RepairClient = db) {
  const row = await client.formSubmission.findUnique({ where: { id }, select: REPAIR_SELECT })
  return eligibleRepair(row) ? row : null
}
const view = async (row: RepairRow, client: RepairClient = db) => trackingProjection(row, await repairWorkView(row, client))
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
  if (!row || repairPhone(row.data) !== input.phone) return generic
  try { await requestOtp({ phone: input.phone, purpose: `REPAIR:${row.id}`, ip: input.ip, context: { service: publicRepairText(row, row.form.title, 80) } }) }
  catch (error) { if (!(error instanceof SmsError)) throw error }
  return generic
}
export async function verifyRepairCode(input: { number: number; phone: string; code: unknown }) {
  const outcome = await db.$transaction(async tx => {
    const row = await receiptRow(input.number, tx)
    if (!row || repairPhone(row.data) !== input.phone) return null
    try { await verifyOtp({ phone: input.phone, code: input.code, purpose: `REPAIR:${row.id}` }, tx) }
    catch (error) { if (error instanceof SmsError) return null; throw error }
    return view(row, tx)
  }, { isolationLevel: 'Serializable' })
  if (!outcome) throw refusal()
  return outcome
}
