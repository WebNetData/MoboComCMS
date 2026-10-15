import { BusinessError } from './businesses'
import { BUSINESS_REPORT_REASONS } from './trust-labels'
export { BUSINESS_REPORT_REASONS, PROOF_STATUS_LABELS } from './trust-labels'
export function trustNote(value: unknown) {
  const note = typeof value === 'string' ? value.trim() : ''
  if (note.length < 10 || note.length > 1000) throw new BusinessError('توضیح را بین ۱۰ تا ۱۰۰۰ نویسه بنویسید')
  return note
}
export function reportReason(value: unknown) {
  if (typeof value !== 'string' || !Object.hasOwn(BUSINESS_REPORT_REASONS, value)) throw new BusinessError('دلیل گزارش را انتخاب کنید')
  return value as keyof typeof BUSINESS_REPORT_REASONS
}
