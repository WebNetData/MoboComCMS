import { randomUUID } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { encryptDigitalDelivery, decryptDigitalDelivery } from '@/modules/catalog/server/digital-delivery'
import { enqueue } from '@/modules/operations/server/enqueue'
import { normalizeMobile } from '@/modules/sms/domain/sms'
import { parseForm, workSteps, type StoredAnswer, type WorkStep } from '../domain/forms'

type StageRow = { id: number; title: string; data: string; userId: number | null; pickupCode: string; receiptToken: string }
type Snapshot = { id: number; phone: string; name: string; form: string; stage: string; label: string; message: string; receipt: string; code: string; userId: number | null; createdAt: number }
const answersOf = (data: string): StoredAnswer[] => { try { const value = JSON.parse(data); return Array.isArray(value) ? value : [] } catch { return [] } }
const mobileOf = (data: string) => answersOf(data).filter(answer => ['mobile', 'tel'].includes(answer.type || '')).map(answer => normalizeMobile(answer.value)).find(Boolean) || ''

/** A stage and its minimal encrypted message intent commit together; no provider I/O in the transaction. */
export async function queueFormStageSms(row: StageRow, step: WorkStep, client: Pick<Prisma.TransactionClient, 'backgroundJob'> = db) {
  if (!step.sms || !step.message) return null
  const phone = mobileOf(row.data)
  if (!phone) return null
  const name = answersOf(row.data).find(answer => answer.id === 'name' && typeof answer.value === 'string')?.value
  const snapshot: Snapshot = { id: row.id, phone, name: typeof name === 'string' && name ? name.slice(0, 120) : 'مشتری', form: row.title.slice(0, 60), stage: step.key, label: step.label, message: step.message, receipt: row.receiptToken ? `/receipt/${row.receiptToken}` : '', code: row.pickupCode, userId: row.userId, createdAt: Date.now() }
  const key = `form-stage:${row.id}:${randomUUID()}`
  return enqueue('forms.stage-sms', { submissionId: row.id, intent: key, sealed: encryptDigitalDelivery(JSON.stringify(snapshot)) }, { dedupeKey: key }, client)
}

/** Transactional contact supplied for this request never becomes a verified identity or marketing opt-in. */
export async function deliverFormStageSms(payload: Record<string, unknown>, job: { id: number; attempts: number }) {
  const id = Number(payload.submissionId), key = String(payload.intent || '')
  if (!Number.isSafeInteger(id) || id <= 0 || !key.startsWith(`form-stage:${id}:`) || key.length > 100 || typeof payload.sealed !== 'string') throw new Error('Invalid form SMS intent')
  const snapshot = JSON.parse(decryptDigitalDelivery(payload.sealed)) as Snapshot
  if (snapshot.id !== id || !normalizeMobile(snapshot.phone) || snapshot.phone !== normalizeMobile(snapshot.phone) || !Number.isFinite(snapshot.createdAt)) throw new Error('Invalid form SMS snapshot')
  if (Date.now() - snapshot.createdAt > 24 * 60 * 60_000 || snapshot.createdAt > Date.now() + 60_000) return { sent: false, skipped: 'expired' }
  const [row, newest] = await Promise.all([
    db.formSubmission.findUnique({ where: { id }, include: { form: true } }),
    db.backgroundJob.findFirst({ where: { kind: 'forms.stage-sms', dedupeKey: { startsWith: `form-stage:${id}:` } }, orderBy: { id: 'desc' }, select: { id: true } }),
  ])
  if (!row || row.status === 'SPAM' || row.payStatus === 'UNPAID' || row.userId !== snapshot.userId || row.stage !== snapshot.stage || newest?.id !== job.id || mobileOf(row.data) !== snapshot.phone || row.pickupCode !== snapshot.code || (row.receiptToken ? `/receipt/${row.receiptToken}` : '') !== snapshot.receipt) return { sent: false, skipped: 'changed' }
  const step = workSteps(parseForm(row.form).settings).find(item => item.key === snapshot.stage)
  if (!step?.sms || step.message !== snapshot.message || step.label !== snapshot.label) return { sent: false, skipped: 'disabled-or-edited' }
  if (row.userId !== null) {
    const user = await db.user.findUnique({ where: { id: row.userId }, select: { status: true, smsAlerts: true } })
    if (!user || user.status !== 'ACTIVE' || !user.smsAlerts || !await (await import('@/modules/notifications/server/preferences')).isNotificationChannelEnabled(row.userId, 'FORM_STAGE', 'sms')) return { sent: false, skipped: 'preference' }
  }
  const sms = await import('@/modules/sms/server/sms')
  const receipt = snapshot.receipt ? await sms.siteLink(snapshot.receipt) : ''
  const message = snapshot.message.replace(/\{code\}/g, snapshot.code || '—').replace(/\{receipt\}/g, receipt).replace(/\{id\}/g, String(id))
  const result = await sms.notifyPhoneResult('FORM_STAGE', snapshot.phone, { name: snapshot.name, form: snapshot.form, stage: snapshot.label, message, link: receipt }, snapshot.userId, key)
  return result ? { sent: result.status === 'SENT', delivery: result.status, logId: result.logId } : { sent: false, skipped: 'disabled' }
}
