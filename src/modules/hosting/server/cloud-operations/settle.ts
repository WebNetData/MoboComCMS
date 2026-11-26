import type { HostingOperation, Prisma } from '@prisma/client'
import { encryptPanelCredential } from '@/modules/providers/server/panel-credentials'
import { termEnd } from '@/modules/hosting/domain/services'
import { createInboxEvent } from '@/modules/notifications/server/inbox'
import type { CloudOperationResult } from '@/modules/hosting/server/drivers/operations'
import type { Snapshot } from './common'

/** Persist only confirmed effects. Money/order/wallet are never re-applied here. */
export async function applyOperationResult(
  tx: Prisma.TransactionClient,
  row: HostingOperation,
  s: Snapshot,
  r: CloudOperationResult,
) {
  await tx.$queryRawUnsafe("SELECT set_config('mobocom.cloud_operation',$1,true)", row.id)
  const now = new Date(),
    data = r.data || {}
  if (row.serviceId) {
    const service = await tx.hostingService.findUniqueOrThrow({ where: { id: row.serviceId } })
    const expected = row.command === 'CREATE' ? 'PROVISIONING' : s.expected
    if (service.status !== expected || service.userId !== s.ownerId || service.providerId !== row.providerId)
      return false
    const patch: Prisma.HostingServiceUpdateManyMutationInput = {}
    if (row.command === 'CREATE') {
      if (!r.resourceId || !s.input.password) return false
      Object.assign(patch, {
        status: 'ACTIVE',
        externalId: r.resourceId,
        loginUser: data.username || s.input.username || 'root',
        loginSecret: encryptPanelCredential(data.password || s.input.password),
        ipv4: data.ipv4 || '',
        ipv6: data.ipv6 || '',
        panelUrl: data.panelUrl || '',
        startedAt: now,
        nextDueAt: service.cycle === 'HOURLY' ? null : termEnd(now, service.cycle),
        chargedUntil: service.cycle === 'HOURLY' ? now : null,
        powerState: data.powerState || 'RUNNING',
      })
    } else if (row.command === 'SUSPEND') Object.assign(patch, { status: 'SUSPENDED', suspendedAt: now })
    else if (row.command === 'UNSUSPEND')
      Object.assign(patch, {
        status: 'ACTIVE',
        suspendedAt: null,
        chargedUntil: service.cycle === 'HOURLY' ? now : service.chargedUntil,
      })
    else if (row.command === 'TERMINATE') Object.assign(patch, { status: 'TERMINATED', terminatedAt: now })
    if (data.powerState) patch.powerState = data.powerState
    const changed = await tx.hostingService.updateMany({
      where: { id: service.id, status: expected, updatedAt: service.updatedAt },
      data: patch,
    })
    if (!changed.count) return false
    await tx.hostingAction.create({
      data: {
        serviceId: service.id,
        actor: s.actor,
        actorId: s.actorId,
        kind: row.command === 'CREATE' ? 'PROVISION' : row.command,
        status: 'DONE',
        idempotencyKey: 'cloud-result:' + row.id,
        detail: 'نتیجهٔ قطعی سامانه ثبت شد',
        finishedAt: now,
      },
    })
  } else if (row.domainId) {
    const domain = await tx.domain.findUniqueOrThrow({ where: { id: row.domainId } }),
      expiry = new Date(data.expiresAt || '')
    if (
      domain.userId !== s.ownerId ||
      domain.status !== s.expected ||
      !Number.isFinite(expiry.getTime()) ||
      expiry <= now
    )
      return false
    if (row.command === 'RENEW' && domain.expiresAt?.toISOString() !== s.expectedDue) return false
    if (row.command === 'RENEW' && expiry < new Date(String(s.input.config.targetExpiry))) return false
    const changed = await tx.domain.updateMany({
      where: { id: domain.id, status: s.expected, expiresAt: domain.expiresAt },
      data: {
        status: 'ACTIVE',
        expiresAt: expiry,
        ...(row.command === 'REGISTER'
          ? {
              registeredAt: now,
              authCode: '',
              nameservers: JSON.stringify(data.nameservers || s.input.config.nameservers || []),
            }
          : {}),
      },
    })
    if (!changed.count) return false
    await tx.domainAction.updateMany({
      where: {
        domainId: domain.id,
        status: 'WAITING',
        ...(row.command === 'RENEW' ? { idempotencyKey: 'renew:order:' + row.orderId } : { kind: 'REGISTER' }),
      },
      data: { status: 'DONE', finishedAt: now },
    })
    await tx.domainAction.create({
      data: {
        domainId: domain.id,
        actor: 'SYSTEM',
        kind: row.command,
        status: 'DONE',
        idempotencyKey: 'cloud-result:' + row.id,
        detail: 'نتیجهٔ قطعی ثبت‌کننده دریافت شد',
        finishedAt: now,
      },
    })
  }
  const title = 'عملیات سرویس ابری تکمیل شد',
    body = 'نتیجهٔ قطعی سامانه دریافت و وضعیت سرویس شما به‌روز شد.'
  await createInboxEvent(
    {
      userId: s.ownerId,
      kind: 'HOSTING',
      dedupeKey: 'cloud-result:' + row.id,
      titleFa: title,
      titleEn: title,
      bodyFa: body,
      bodyEn: body,
      href: row.serviceId ? '/cloud/dashboard/services/' + row.serviceId : '/cloud/dashboard/domains',
      channels: [],
    },
    tx,
  )
  return true
}
