import { createHmac } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { PublicHttpsDestinationError, PublicHttpsNotSentError, publicHttpsPost } from '@/platform/http/public-https-post'
import { decryptDigitalDelivery } from '@/modules/catalog/server/digital-delivery'
import { parseForm } from '../../domain/forms'
import { formsAvailable } from '../availability'
import { endpoints, erasedWebhookPayload, matchingEndpoint, MODULE_RECHECK_MS, retryDelay, scheduleWebhook, webhookJobKey, WEBHOOK_LEASE_MS } from './store'

const dueStatuses = ['PENDING', 'RETRY']
const activeStatuses = [...dueStatuses, 'IN_FLIGHT']
const targetFor = (row: { endpointKey: string; event: string; form: Parameters<typeof parseForm>[0] }) =>
  matchingEndpoint(endpoints(parseForm(row.form)), row.endpointKey, row.event)

async function advance(
  tx: Prisma.TransactionClient, id: number, version: number, status: string,
  data: Prisma.FormWebhookDeliveryUpdateManyMutationInput, runAt?: Date,
) {
  const updated = await tx.formWebhookDelivery.updateMany({
    where: { id, version, status },
    data: { ...data, version: { increment: 1 } },
  })
  if (updated.count && runAt) await scheduleWebhook(tx, id, version + 1, runAt)
  return updated.count === 1
}

function postpone(now: number, expiresAt: Date, delay: number) {
  return new Date(Math.min(now + delay, expiresAt.getTime()))
}

async function claim(id: number, version: number) {
  return db.$transaction(async tx => {
    const row = await tx.formWebhookDelivery.findUnique({
      where: { id }, include: { form: true, submission: { select: { status: true, data: true } } },
    })
    const now = Date.now()
    if (!row || row.version !== version || !dueStatuses.includes(row.status) || !row.nextAttemptAt || row.nextAttemptAt.getTime() > now) return null
    if (!row.expiresAt || row.expiresAt.getTime() <= now) {
      await advance(tx, id, version, row.status, { ...erasedWebhookPayload(), status: 'CANCELLED', failure: 'EXPIRED' })
      return null
    }
    if (!await formsAvailable(tx)) {
      const runAt = postpone(now, row.expiresAt, MODULE_RECHECK_MS)
      await advance(tx, id, version, row.status, { nextAttemptAt: runAt }, runAt)
      return null
    }
    const target = targetFor(row)
    const sourceRemoved = row.submission && (row.submission.status === 'SPAM' || row.submission.data === '{}')
    if (!target || sourceRemoved) {
      await advance(tx, id, version, row.status, { ...erasedWebhookPayload(), status: 'CANCELLED', failure: sourceRemoved ? 'SOURCE_REMOVED' : 'TARGET_CHANGED' })
      return null
    }
    const claimed = await advance(tx, id, version, row.status, {
      status: 'IN_FLIGHT', nextAttemptAt: new Date(now + WEBHOOK_LEASE_MS),
      attempts: { increment: 1 }, cycleAttempts: { increment: 1 }, httpStatus: null, durationMs: null, failure: '',
    })
    return claimed ? { row, target, expiresAt: row.expiresAt } : null
  })
}

type Outcome =
  | { status: 'DELIVERED' | 'FAILED' | 'UNKNOWN' | 'CANCELLED'; failure: string; httpStatus?: number }
  | { status: 'RETRY'; failure: string; runAt: Date; deferred?: boolean }

export async function deliverFormWebhook(payload: Record<string, unknown>) {
  const { deliveryId: id, version } = payload
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0 ||
      typeof version !== 'number' || !Number.isSafeInteger(version) || version < 0) throw new Error('Invalid Forms webhook job')
  const claimed = await claim(id, version)
  if (!claimed) return
  const { row, target, expiresAt } = claimed
  const started = Date.now()
  let outcome: Outcome
  const send = async (): Promise<Outcome> => {
    let body: string
    try { body = decryptDigitalDelivery(row.body) } catch {
      return { status: 'CANCELLED', failure: 'PAYLOAD_UNAVAILABLE' }
    }
    let deferral = false
    const response = await publicHttpsPost(target.url, body, {
      'user-agent': 'MoboCom-Forms/1',
      'x-mobocom-event': row.event,
      'x-mobocom-event-id': row.eventId,
      ...(target.secret ? { 'x-mobocom-signature': `sha256=${createHmac('sha256', target.secret).update(body).digest('hex')}` } : {}),
    }, {
      beforeSend: async () => {
        if (expiresAt.getTime() <= Date.now()) return false
        if (!await formsAvailable()) { deferral = true; return false }
        const current = await db.formWebhookDelivery.findFirst({
          where: { id, version: version + 1, status: 'IN_FLIGHT', nextAttemptAt: { gt: new Date() } },
          include: { form: true, submission: { select: { status: true, data: true } } },
        })
        return !!current && !(current.submission && (current.submission.status === 'SPAM' || current.submission.data === '{}')) && !!targetFor(current)
      },
    })
    if (!response) return deferral
      ? { status: 'RETRY', failure: 'MODULE_PAUSED', runAt: postpone(Date.now(), expiresAt, MODULE_RECHECK_MS), deferred: true }
      : { status: 'CANCELLED', failure: 'AUTHORITY_CHANGED' }
    const httpStatus = response.status
    if (httpStatus >= 200 && httpStatus < 300) return { status: 'DELIVERED', failure: '', httpStatus }
    return { status: httpStatus >= 500 ? 'UNKNOWN' : 'FAILED', failure: 'HTTP_RESPONSE', httpStatus }
  }
  try {
    outcome = await send()
  } catch (error) {
    if (error instanceof PublicHttpsDestinationError) outcome = { status: 'FAILED', failure: 'TARGET_BLOCKED' }
    else if (error instanceof PublicHttpsNotSentError) {
      const delay = retryDelay(row.cycleAttempts + 1)
      outcome = delay && Date.now() + delay < expiresAt.getTime()
        ? { status: 'RETRY', failure: 'NOT_SENT', runAt: new Date(Date.now() + delay) }
        : { status: 'FAILED', failure: 'NOT_SENT' }
    } else {
      outcome = { status: 'UNKNOWN', failure: 'RESPONSE_UNKNOWN' }
    }
  }
  const durationMs = Math.max(0, Date.now() - started)
  await db.$transaction(async tx => {
    if (outcome.status === 'RETRY') {
      await advance(tx, id, version + 1, 'IN_FLIGHT', {
        status: 'RETRY', nextAttemptAt: outcome.runAt, failure: outcome.failure, durationMs,
        ...(outcome.deferred ? { attempts: { decrement: 1 }, cycleAttempts: { decrement: 1 } } : {}),
      }, outcome.runAt)
    } else {
      const scrub = outcome.status === 'DELIVERED' || outcome.status === 'CANCELLED'
      await advance(tx, id, version + 1, 'IN_FLIGHT', {
        ...(scrub ? erasedWebhookPayload() : { nextAttemptAt: null }),
        status: outcome.status, failure: outcome.failure, durationMs, httpStatus: outcome.httpStatus ?? null,
      })
    }
  })
}

/** Recovers a queue/process interruption without sending an already-claimed event again. */
export async function reconcileFormWebhookDeliveries(now = new Date()) {
  const expired = await db.formWebhookDelivery.findMany({
    where: { expiresAt: { lte: now } }, select: { id: true }, orderBy: { expiresAt: 'asc' }, take: 250,
  })
  if (expired.length) {
    const where = { id: { in: expired.map(row => row.id) }, expiresAt: { lte: now } }
    await db.$transaction(async tx => {
      await tx.formWebhookDelivery.updateMany({
        where: { ...where, status: { in: activeStatuses } },
        data: { ...erasedWebhookPayload(), status: 'CANCELLED', failure: 'EXPIRED', version: { increment: 1 } },
      })
      await tx.formWebhookDelivery.updateMany({ where, data: erasedWebhookPayload() })
    })
  }
  await db.formWebhookDelivery.updateMany({
    where: { status: 'IN_FLIGHT', nextAttemptAt: { lte: now } },
    data: { status: 'UNKNOWN', nextAttemptAt: null, failure: 'WORKER_INTERRUPTED', version: { increment: 1 } },
  })
  const orphaned = await db.formWebhookDelivery.findMany({
    where: { status: { in: dueStatuses }, nextAttemptAt: { lte: new Date(now.getTime() - 10 * 60_000) }, expiresAt: { gt: now } },
    select: { id: true, version: true, status: true }, orderBy: { nextAttemptAt: 'asc' }, take: 50,
  })
  for (const row of orphaned) {
    await db.$transaction(async tx => {
      const job = await tx.backgroundJob.findUnique({ where: { dedupeKey: webhookJobKey(row.id, row.version) }, select: { status: true } })
      if (job?.status === 'QUEUED' || job?.status === 'RUNNING') return
      await advance(tx, row.id, row.version, row.status, { nextAttemptAt: now }, now)
    })
  }
}
