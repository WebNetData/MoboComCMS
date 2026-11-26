import { db } from '@/platform/database/prisma'
import { isModuleEnabled } from '@/extensions/server/modules'
import { decryptPanelCredential } from '@/modules/providers/server/panel-credentials'
import { audit, binding, config, decode, encode, refusal, schedule, transaction } from './common'
import { cloudManaged, queueServiceOperation } from './intents'
import type { CloudAction } from '@/modules/hosting/server/drivers/operations'

export async function operationOverview() {
  const [operations, services, domains] = await Promise.all([
    db.hostingOperation.findMany({
      take: 80,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        serviceId: true,
        domainId: true,
        command: true,
        status: true,
        code: true,
        version: true,
        attempts: true,
        createdAt: true,
        updatedAt: true,
        provider: { select: { name: true, driver: true } },
      },
    }),
    db.hostingService.findMany({
      where: { status: { in: ['PENDING', 'FAILED', 'ACTIVE', 'SUSPENDED'] } },
      take: 100,
      orderBy: { id: 'desc' },
      select: { id: true, label: true, hostname: true, status: true, providerId: true },
    }),
    db.domainAction.findMany({
      where: { status: 'WAITING' },
      take: 50,
      orderBy: { createdAt: 'asc' },
      select: { id: true, kind: true, detail: true, domain: { select: { id: true, name: true } } },
    }),
  ])
  return { operations, services, domainTasks: domains }
}
export async function operateCloudResource(actorId: number, input: Record<string, unknown>) {
  const id = Number(input.serviceId),
    command = String(input.command),
    key = String(input.requestKey || '')
  if (
    !Number.isSafeInteger(id) ||
    id < 1 ||
    !['CREATE', 'SUSPEND', 'UNSUSPEND', 'TERMINATE', 'START', 'STOP', 'SHUTDOWN', 'REBOOT'].includes(command) ||
    !/^[a-zA-Z0-9._:-]{8,128}$/.test(key)
  )
    refusal('درخواست عملیات معتبر نیست')
  const service = await db.hostingService.findUniqueOrThrow({ where: { id } })
  if (['TERMINATE', 'STOP', 'REBOOT'].includes(command) && input.confirm !== service.hostname)
    refusal('برای این عملیات، نام میزبان سرویس را دقیق وارد کنید')
  return queueServiceOperation(id, command as CloudAction, { id: actorId, kind: 'STAFF', key })
}
export async function reconcileCloudOperation(actorId: number, id: string, version: number) {
  if (!/^[a-f0-9-]{36}$/.test(id) || !Number.isSafeInteger(version) || version < 1)
    refusal('شناسه یا نسخهٔ درخواست معتبر نیست')
  return transaction(async (tx) => {
    if (!(await isModuleEnabled('hosting', tx))) refusal('موبوکام کلاد غیرفعال است')
    const row = await tx.hostingOperation.findUniqueOrThrow({ where: { id } })
    if (
      row.version !== version ||
      !['UNKNOWN', 'PENDING', 'BLOCKED'].includes(row.status) ||
      row.code === 'ACCOUNT_ERASED'
    )
      refusal('وضعیت عملیات تغییر کرده است')
    const snap = decode(row.snapshot),
      provider = await tx.hostingProvider.findUniqueOrThrow({ where: { id: row.providerId } })
    if (
      !provider.active ||
      provider.driver !== snap.connection.driver ||
      provider.url !== snap.connection.url ||
      provider.username !== snap.connection.username
    )
      refusal('هویت اتصال تغییر کرده است؛ اتصال اصلی را بررسی کنید')
    snap.connection = {
      driver: provider.driver,
      url: provider.url,
      username: provider.username,
      secret: decryptPanelCredential(provider.secret),
      config: config(provider.config),
    }
    snap.binding = binding(provider)
    snap.actor = 'STAFF'
    snap.actorId = actorId
    const change = await tx.hostingOperation.updateMany({
      where: { id, version, status: row.status },
      data: { status: 'PENDING', snapshot: encode(snap), version: { increment: 1 } },
    })
    if (!change.count) refusal('عملیات هم‌زمان تغییر کرد')
    await schedule(tx, id, version + 1)
    await audit(tx, id, 'reconcile')
    return { id }
  })
}
/** Only a proven preflight rejection can be dispatched again; uncertain writes use reads. */
export async function retryCloudOperation(actorId: number, id: string, version: number) {
  if (!/^[a-f0-9-]{36}$/.test(id) || !Number.isSafeInteger(version) || version < 1)
    refusal('شناسه یا نسخهٔ درخواست معتبر نیست')
  return transaction(async (tx) => {
    if (!(await isModuleEnabled('hosting', tx))) refusal('موبوکام کلاد غیرفعال است')
    const row = await tx.hostingOperation.findUniqueOrThrow({ where: { id } })
    if (row.version !== version || row.status !== 'FAILED' || row.code === 'ACCOUNT_ERASED')
      refusal('فقط درخواست ردشدهٔ قطعی قابل تلاش دوباره است')
    const snap = decode(row.snapshot),
      provider = await tx.hostingProvider.findUniqueOrThrow({ where: { id: row.providerId } }),
      cfg = config(provider.config)
    if (
      !provider.active ||
      cfg.autoOperations !== true ||
      provider.driver !== snap.connection.driver ||
      provider.url !== snap.connection.url ||
      provider.username !== snap.connection.username
    )
      refusal('هویت اتصال تغییر کرده است؛ اتصال اصلی را بررسی کنید')
    await tx.hostingOperation
      .count({
        where: {
          id: { not: id },
          status: { in: ['QUEUED', 'RUNNING', 'PENDING', 'UNKNOWN', 'BLOCKED'] },
          ...(row.serviceId ? { serviceId: row.serviceId } : { domainId: row.domainId }),
        },
      })
      .then((count) => {
        if (count) refusal('عملیات دیگری هنوز تعیین تکلیف نشده است')
      })
    snap.connection = {
      driver: provider.driver,
      url: provider.url,
      username: provider.username,
      secret: decryptPanelCredential(provider.secret),
      config: cfg,
    }
    snap.binding = binding(provider)
    snap.actor = 'STAFF'
    snap.actorId = actorId
    if (!snap.input.resourceId) {
      snap.input.config = { ...snap.input.config, ...cfg }
      if (row.serviceId) {
        const s = await tx.hostingService.findUniqueOrThrow({
          where: { id: row.serviceId },
          include: { product: true },
        })
        snap.input.plan = s.product.providerPlan
      }
    }
    const change = await tx.hostingOperation.updateMany({
      where: { id, version, status: 'FAILED' },
      data: { status: 'QUEUED', snapshot: encode(snap), code: '', version: { increment: 1 } },
    })
    if (!change.count) refusal('وضعیت هم‌زمان تغییر کرد')
    await schedule(tx, id, version + 1)
    await audit(tx, id, 'retry')
    return { id }
  })
}
export async function customerPowerOperation(userId: number, id: number, command: string, key: string) {
  const service = await db.hostingService.findFirst({ where: { id, userId }, include: { product: true } })
  if (
    !service ||
    service.status !== 'ACTIVE' ||
    !['VPS', 'CLOUD_SERVER'].includes(service.product.kind) ||
    !(await cloudManaged(service.providerId))
  )
    refusal('سرویس قابل کنترل پیدا نشد')
  if (!['START', 'SHUTDOWN', 'REBOOT'].includes(command) || !/^[a-zA-Z0-9._:-]{8,128}$/.test(key))
    refusal('درخواست کنترل معتبر نیست')
  const row = await queueServiceOperation(id, command as CloudAction, { id: userId, kind: 'CUSTOMER', key })
  return { id: row.id, status: row.status }
}
