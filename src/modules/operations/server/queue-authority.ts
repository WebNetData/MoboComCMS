import type { Prisma, BackgroundJob } from '@prisma/client'
import type { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { auditAdminStrict } from '@/platform/audit/server'
import { logEvent } from '@/platform/observability/logger'
import { resolveCurrentUser, adminNeedsTwoFactor, type AuthedUser } from '@/modules/identity/server/access'
import { hasPermission } from '@/modules/identity/rbac'
import { enqueue } from '@/modules/operations/server/queue'

const KEY = '__mobocomManualAuthority'
type Grant = { version: 1; actorId: number; authAt: number | null; authorizedAt: string }
type Reader = Pick<Prisma.TransactionClient, 'user' | 'accessRestriction' | 'setting'>
type Context = { req: NextRequest; actor: AuthedUser; authAt: unknown }
const freshReader: Reader = { user: db.user, accessRestriction: db.accessRestriction, setting: db.setting }
const denied = () => new Error('اختیار اپراتور معتبر نیست یا بررسی آن در دسترس نیست؛ با حساب مجاز دوباره تلاش کنید.')

function grantFrom(payload: Record<string, unknown>): Grant | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  const value = payload[KEY]
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const grant = value as Grant
  if (grant.version !== 1 || !Number.isSafeInteger(grant.actorId) || grant.actorId <= 0
    || !(grant.authAt === null || (typeof grant.authAt === 'number' && Number.isFinite(grant.authAt) && grant.authAt > 0 && grant.authAt <= Date.now()))
    || typeof grant.authorizedAt !== 'string' || !Number.isFinite(Date.parse(grant.authorizedAt)) || Date.parse(grant.authorizedAt) > Date.now()) return null
  return grant
}

async function currentOperator(id: number, authAt: unknown, reader: Reader) {
  const actor = await resolveCurrentUser(id, authAt, reader)
  if (!actor || actor.role !== 'ADMIN' || await adminNeedsTwoFactor(actor, reader)
    || (actor.roleId != null && !hasPermission(actor.permissions || [], 'settings.manage'))) return null
  return actor
}

/** Only explicitly delegated work is human-bound. System/domain jobs keep their owning policy. */
export function isManualJob(job: Pick<BackgroundJob, 'dedupeKey' | 'payload'>, payload: Record<string, unknown>) {
  return !!job.dedupeKey?.startsWith('manual:') || job.payload.includes(`"${KEY}"`) || Object.prototype.hasOwnProperty.call(payload, KEY)
}

export async function authorizedManualJob(payload: Record<string, unknown>, reader: Reader = freshReader) {
  const grant = grantFrom(payload)
  if (!grant) return false // unattributed legacy manual work requires an explicit Admin retry
  try { return !!await currentOperator(grant.actorId, grant.authAt, reader) }
  catch (error) {
    logEvent('warn', 'queue.authority_unavailable', { errorName: error instanceof Error ? error.name : 'Unknown' })
    return false
  }
}

export function manualContinuation(payload: Record<string, unknown>, next: Record<string, unknown>) {
  return { ...next, [KEY]: payload[KEY] }
}

async function command<T>(context: Context, work: (tx: Prisma.TransactionClient, actor: AuthedUser, grant: Grant) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await db.$transaction(async tx => {
      if (/^postgres(?:ql)?:/i.test(process.env.DATABASE_URL || '')) await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${context.actor.id} FOR UPDATE`
      const actor = await currentOperator(context.actor.id, context.authAt, tx)
      if (!actor) throw denied()
      const signedIn = Number(context.authAt)
      const grant: Grant = { version: 1, actorId: actor.id, authAt: Number.isFinite(signedIn) && signedIn > 0 ? signedIn : null, authorizedAt: new Date().toISOString() }
      return work(tx, actor, grant)
    }) } catch (error) {
      if (attempt < 3 && ['P2002', 'P2034'].includes((error as { code?: string }).code || '')) continue
      throw error
    }
  }
}

export async function enqueueManualJob(kind: string, context: Context) {
  return command(context, async (tx, actor, grant) => {
    const job = await enqueue(kind, { [KEY]: grant }, { dedupeKey: `manual:${kind}` }, tx)
    // Dedupe does not steal another active operator's grant.
    await auditAdminStrict({ req: context.req, actor, action: 'operations.enqueue', targetType: 'job', targetId: job.id, metadata: { kind, requestedById: actor.id, effectiveActorId: grantFrom(parsePayload(job.payload))?.actorId ?? null } }, tx)
    return job
  })
}

function parsePayload(value: string): Record<string, unknown> {
  let payload: unknown
  try { payload = JSON.parse(value) }
  catch { throw new Error('دادهٔ کار معتبر نیست؛ مقدار ذخیره‌شده حفظ شد.') }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('دادهٔ کار معتبر نیست؛ مقدار ذخیره‌شده حفظ شد.')
  return payload as Record<string, unknown>
}

/** Failed manual jobs receive a fresh explicit operator; system jobs retain domain payload/policy. */
export async function retryManualJob(id: number, context: Context) {
  if (!Number.isSafeInteger(id) || id <= 0) return false
  return command(context, async (tx, actor, grant) => {
    const job = await tx.backgroundJob.findUnique({ where: { id } })
    if (!job || job.status !== 'FAILED') return false
    const payload = parsePayload(job.payload), manual = isManualJob(job, payload), previous = grantFrom(payload)
    const updated = await tx.backgroundJob.updateMany({
      where: { id, status: 'FAILED', attempts: job.attempts, payload: job.payload, lockedAt: job.lockedAt },
      data: { status: 'QUEUED', runAt: new Date(), attempts: 0, lastError: '', finishedAt: null, ...(manual ? { payload: JSON.stringify({ ...payload, [KEY]: grant }) } : {}) },
    })
    if (!updated.count) return false
    await auditAdminStrict({ req: context.req, actor, action: 'operations.retry', targetType: 'job', targetId: id, metadata: { kind: job.kind, manual, previousActorId: previous?.actorId ?? null, previousAuthorizedAt: previous?.authorizedAt ?? null, executionActorId: manual ? actor.id : null } }, tx)
    return true
  })
}
