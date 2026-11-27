import { createHmac, randomUUID } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { authSecret } from '@/platform/config/env'
import { encryptDigitalDelivery } from '@/modules/catalog/server/digital-delivery'
import { enqueue } from '@/modules/operations/server/enqueue'
import { SECRET_MASK, type FormDefinition, type FormWebhook, type StoredAnswer } from '../../domain/forms'

const WEBHOOK_JOB = 'forms.webhook-delivery'
export const WEBHOOK_STATUSES = ['PENDING', 'RETRY', 'IN_FLIGHT', 'DELIVERED', 'FAILED', 'UNKNOWN', 'CANCELLED'] as const
export const WEBHOOK_PAYLOAD_LIFETIME = 7 * 86_400_000
export const WEBHOOK_LEASE_MS = 90_000
export const MODULE_RECHECK_MS = 5 * 60_000
const RETRY_DELAYS = [60_000, 5 * 60_000, 20 * 60_000] as const

export const retryDelay = (attempt: number) => RETRY_DELAYS[attempt - 1]
export type WebhookStatus = (typeof WEBHOOK_STATUSES)[number]
type LiveEvent = FormWebhook['events'][number]
export type WebhookEvent = LiveEvent | 'test'
type WebhookForm = Pick<FormDefinition, 'id' | 'slug' | 'title' | 'settings'>

export function endpoints(form: WebhookForm) {
  const duplicates = new Map<string, number>()
  return (form.settings?.webhooks ?? []).map((hook, index) => {
    const fingerprint = createHmac('sha256', authSecret())
      .update(JSON.stringify(['forms.webhook.destination.v1', form.id, hook.url, hook.secret]))
      .digest('hex')
    const ordinal = duplicates.get(fingerprint) ?? 0
    duplicates.set(fingerprint, ordinal + 1)
    return { ...hook, index, key: `${fingerprint}:${ordinal}`, host: new URL(hook.url).host, enabled: hook.enabled !== false }
  })
}

export function matchingEndpoint(targets: ReturnType<typeof endpoints>, key: string, event: string) {
  return targets.find(hook => hook.key === key && (event === 'test' || (hook.enabled && hook.events.some(item => item === event))))
}

export function scheduleWebhook(tx: Prisma.TransactionClient, id: number, version: number, runAt: Date) {
  return enqueue(WEBHOOK_JOB, { deliveryId: id, version }, { dedupeKey: webhookJobKey(id, version), runAt }, tx)
}

export const webhookJobKey = (id: number, version: number) => `forms:webhook:${id}:${version}`

export async function recordWebhook(
  tx: Prisma.TransactionClient, form: WebhookForm & { id: number }, target: ReturnType<typeof endpoints>[number],
  event: WebhookEvent, submissionId: number | null, sourceKey: string, data: Record<string, unknown>,
) {
  const now = new Date(), eventId = randomUUID()
  const descriptor = event === 'test'
    ? { id: 0, slug: 'webhook-test', title: 'آزمون وب‌هوک' }
    : { id: form.id, slug: form.slug, title: form.title }
  const body = JSON.stringify({
    ...data, event, form: descriptor, sentAt: now.toISOString(),
    ...(submissionId === null ? {} : { entryId: submissionId }),
  })
  const row = await tx.formWebhookDelivery.create({
    data: {
      formId: form.id, submissionId, eventId, sourceKey, event, endpointKey: target.key,
      host: target.host, body: encryptDigitalDelivery(body), nextAttemptAt: now,
      expiresAt: new Date(now.getTime() + WEBHOOK_PAYLOAD_LIFETIME),
    },
    select: { id: true, eventId: true, version: true },
  })
  await scheduleWebhook(tx, row.id, row.version, now)
  return { id: row.id, eventId: row.eventId }
}

/** Each source is claimed by the Forms mutation that owns it. */
export async function queueFormWebhooks(
  tx: Prisma.TransactionClient, form: WebhookForm, event: LiveEvent,
  submissionId: number, revision: number, data: Record<string, unknown>,
) {
  const id = form.id
  if (!id) return
  for (const target of endpoints(form)) {
    if (!target.enabled || !target.events.includes(event)) continue
    await recordWebhook(tx, { ...form, id }, target, event, submissionId, `${event}:${submissionId}:${revision}`, data)
  }
}

export function webhookAnswers(answers: StoredAnswer[]) {
  return Object.fromEntries(answers.map(({ id, label, type = 'text', value }) => [
    id, { label, type, value: type === 'secret' || type === 'devicelock' ? SECRET_MASK : value },
  ]))
}

export function erasedWebhookPayload() {
  return { body: '', expiresAt: null, nextAttemptAt: null }
}

/** Account erasure shares the source transaction and invalidates a not-yet-sent claim. */
export async function eraseFormWebhookPayloads(tx: Prisma.TransactionClient, submissionIds: number[]) {
  if (!submissionIds.length) return
  await tx.formWebhookDelivery.updateMany({
    where: { submissionId: { in: submissionIds }, expiresAt: { not: null } },
    data: { ...erasedWebhookPayload(), status: 'CANCELLED', failure: 'SOURCE_REMOVED', version: { increment: 1 } },
  })
}
