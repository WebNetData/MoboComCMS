import type { Prisma } from '@prisma/client'
import { digitalFingerprint } from '@/modules/catalog/server/digital-delivery'
import { normalizeMobile } from '@/modules/sms/domain/sms'
import { FormsError, parseForm, type StoredAnswer } from '../domain/forms'

export const REPAIR_SELECT = { id: true, data: true, status: true, userId: true, stage: true, reply: true, createdAt: true, receivedAt: true, receiptToken: true, pickupCode: true, assigneeId: true, payStatus: true, repairOrderId: true, repairVersion: true, estimateRevision: true, repairDueAt: true, form: true } as const
export type RepairRow = Prisma.FormSubmissionGetPayload<{ select: typeof REPAIR_SELECT }>
export type RepairClient = Prisma.TransactionClient
export function repairPhone(data: string): string {
  try { const answers: StoredAnswer[] = JSON.parse(data); return Array.isArray(answers) ? answers.filter(a => ['mobile', 'tel'].includes(a.type || '')).map(a => normalizeMobile(a.value)).find(Boolean) || '' : '' } catch { return '' }
}
export const repairHash = (kind: 'contact' | 'receipt', value: string) => digitalFingerprint(`repair-consent:${kind}:${value}`)
export function eligibleRepair(row: RepairRow | null): row is RepairRow {
  if (!row || row.status === 'SPAM' || !/^[A-Za-z0-9_-]{20,40}$/.test(row.receiptToken)) return false
  const settings = parseForm(row.form).settings
  return !!settings?.service && settings.receipt.enabled
}
export const repairConflict = () => new FormsError('پرونده هم‌زمان تغییر کرده است؛ اطلاعات تازه را دریافت کنید', 409)
export const repairClaim = (row: RepairRow) => ({ id: row.id, repairVersion: row.repairVersion, estimateRevision: row.estimateRevision, data: row.data, receiptToken: row.receiptToken, status: row.status, stage: row.stage, assigneeId: row.assigneeId, payStatus: row.payStatus, repairOrderId: row.repairOrderId })
export function publicRepairText(row: Pick<RepairRow, 'pickupCode' | 'receiptToken'>, value: string, length = 1500) {
  let text = value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, length)
  for (const secret of [row.pickupCode, row.receiptToken]) if (secret) text = text.split(secret).join('••••')
  return text
}
