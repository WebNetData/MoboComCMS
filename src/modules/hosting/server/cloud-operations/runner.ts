import { db } from '@/platform/database/prisma'
import { isModuleEnabled } from '@/extensions/server/modules'
import { globalAuthenticationDenied } from '@/modules/identity/server/authentication-restrictions'
import { userOpensSection } from '@/modules/account/server/section-access'
import { resolveCurrentUser, currentAdminHasPermission } from '@/modules/identity/server/access'
import { hostingDriver } from '@/modules/hosting/server/drivers/registry'
import { hasCloudOperations, type CloudOperationResult } from '@/modules/hosting/server/drivers/operations'
import { audit, binding, config, decode, encode, schedule, transaction, uid } from './common'
import { applyOperationResult } from './settle'

export async function runCloudOperation(payload: Record<string, unknown>) {
  const id = String(payload.id || '')
  if (!/^[a-f0-9-]{36}$/.test(id)) throw Error('Invalid Cloud intent')
  const current = await db.hostingOperation.findUnique({ where: { id } })
  if (!current || ['DONE', 'FAILED', 'BLOCKED'].includes(current.status))
    return { status: current?.status || 'MISSING' }
  if (current.status === 'RUNNING' && current.leaseAt && current.leaseAt.getTime() > Date.now() - 120000)
    return { status: 'RUNNING' }
  const snap = decode(current.snapshot),
    allowed = await userOpensSection('hosting', snap.ownerId)
  const actor = snap.actor === 'STAFF' && snap.actorId ? await resolveCurrentUser(snap.actorId, Date.now()) : null
  const attempt = await transaction(async (tx) => {
    const row = await tx.hostingOperation.findUniqueOrThrow({ where: { id } })
    if (row.version !== current.version || row.status !== current.status) return null
    const provider = await tx.hostingProvider.findUnique({ where: { id: row.providerId } }),
      owner = await tx.user.findUnique({ where: { id: snap.ownerId }, select: { status: true, erasedAt: true } })
    const service = row.serviceId ? await tx.hostingService.findUnique({ where: { id: row.serviceId } }) : null,
      domain = row.domainId ? await tx.domain.findUnique({ where: { id: row.domainId }, include: { tld: true } }) : null
    const order = row.orderId
      ? await tx.order.findUnique({ where: { id: row.orderId }, include: { invoice: true } })
      : null
    const paid =
      !row.orderId ||
      (order?.status === 'PAID' &&
        order.userId === snap.ownerId &&
        order.invoice?.status === 'PAID' &&
        order.invoice.userId === snap.ownerId)
    const staleDue =
      service &&
      snap.actor === 'SYSTEM' &&
      ['SUSPEND', 'TERMINATE'].includes(row.command) &&
      snap.expectedDue !== service.nextDueAt?.toISOString()
    const statusOk =
      paid &&
      !staleDue &&
      (service
        ? service.userId === snap.ownerId &&
          service.status === (row.command === 'CREATE' ? 'PROVISIONING' : snap.expected) &&
          service.providerId === row.providerId
        : domain?.userId === snap.ownerId &&
          domain.status === snap.expected &&
          domain.tld.registrarId === row.providerId)
    const authority =
      allowed &&
      owner?.status === 'ACTIVE' &&
      !owner.erasedAt &&
      !(await globalAuthenticationDenied(snap.ownerId, new Date(), tx)) &&
      (await isModuleEnabled('hosting', tx)) &&
      provider?.active &&
      config(provider.config).autoOperations === true &&
      binding(provider) === snap.binding &&
      (snap.actor !== 'STAFF' || currentAdminHasPermission(actor, 'hosting.manage'))
    if (!authority || !statusOk) {
      await tx.hostingOperation.updateMany({
        where: { id, version: row.version, status: row.status },
        data: {
          status: row.status === 'QUEUED' && row.attempts === 0 ? 'FAILED' : 'BLOCKED',
          code: 'AUTHORITY_OR_RESOURCE_CHANGED',
          version: { increment: 1 },
          token: '',
          leaseAt: null,
        },
      })
      await audit(tx, id, 'blocked')
      return null
    }
    const mode = row.status === 'QUEUED' ? 'write' : 'inspect',
      token = uid()
    const changed = await tx.hostingOperation.updateMany({
      where: { id, status: row.status, version: row.version },
      data: { status: 'RUNNING', token, leaseAt: new Date(), attempts: { increment: 1 }, version: { increment: 1 } },
    })
    if (!changed.count) return null
    if (row.status !== 'UNKNOWN') await schedule(tx, id, row.version + 1, 125000)
    await audit(tx, id, mode === 'write' ? 'dispatch' : 'inspect')
    return { row, token, mode }
  })
  if (!attempt) return { status: 'BLOCKED_OR_CLAIMED' }
  const driver = hostingDriver(snap.connection)
  let result: CloudOperationResult = { state: 'UNKNOWN', code: 'RESULT_UNKNOWN' }
  if (hasCloudOperations(driver))
    try {
      result =
        attempt.mode === 'write'
          ? await driver.performOperation(snap.input)
          : await driver.inspectOperation(snap.input, attempt.row.reference)
    } catch {
      /* Never retain raw exceptions or repeat an uncertain write. */
    }
  if (
    result.state === 'FAILED' &&
    (attempt.mode === 'inspect' || (attempt.row.command === 'CREATE' && !!snap.input.resourceId))
  )
    result = { state: 'UNKNOWN', code: 'RECONCILIATION_REQUIRED' }
  await transaction(async (tx) => {
    const row = await tx.hostingOperation.findUniqueOrThrow({ where: { id } })
    if (row.status !== 'RUNNING' || row.token !== attempt.token) return
    let state: string = result.state,
      code = /^[A-Z0-9_]{1,64}$/.test(result.code) ? result.code : 'RESULT_UNKNOWN'
    if (result.state === 'DONE') {
      const applied = await applyOperationResult(tx, row, snap, result)
      if (!applied) {
        state = 'UNKNOWN'
        code = 'LOCAL_STATE_CHANGED'
      }
    }
    if (result.state === 'NEXT') {
      if (!result.next?.stage || !/^[A-Z_]{1,32}$/.test(result.next.stage)) {
        state = 'UNKNOWN'
        code = 'INVALID_NEXT_STAGE'
      } else {
        snap.input.stage = result.next.stage
        snap.input.state = result.next.state
        state = 'QUEUED'
      }
    }
    if (result.resourceId) snap.input.resourceId = result.resourceId
    const changed = await tx.hostingOperation.updateMany({
      where: { id, status: 'RUNNING', token: attempt.token, version: row.version },
      data: {
        status: state,
        code,
        reference: (state === 'QUEUED' ? '' : (result.reference ?? row.reference)).slice(0, 512),
        snapshot: encode(snap),
        version: { increment: 1 },
        token: '',
        leaseAt: null,
      },
    })
    if (!changed.count) throw Error('Cloud result claim changed')
    await audit(tx, id, 'result')
    if (state === 'QUEUED' || state === 'PENDING')
      await schedule(tx, id, row.version + 1, state === 'QUEUED' ? 0 : 15000)
  })
  return { status: result.state }
}
/** Re-enqueues only persisted intents. Unknown rows reconcile by reads, never repeat a write. */
export async function recoverCloudOperations() {
  if (!(await isModuleEnabled('hosting'))) return { queued: 0 }
  const rows = await db.hostingOperation.findMany({
    where: {
      status: { in: ['QUEUED', 'PENDING', 'RUNNING'] },
      OR: [{ leaseAt: null }, { leaseAt: { lt: new Date(Date.now() - 120000) } }],
    },
    take: 100,
    orderBy: { updatedAt: 'asc' },
  })
  for (const row of rows) await transaction((tx) => schedule(tx, row.id, row.version))
  return { queued: rows.length }
}
