import { randomBytes } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { isModuleEnabled } from '@/extensions/server/modules'
import { decryptPanelCredential } from '@/modules/providers/server/panel-credentials'
import { hostingDriver } from '@/modules/hosting/server/drivers/registry'
import {
  hasCloudOperations,
  type CloudAction,
  type CloudOperationInput,
} from '@/modules/hosting/server/drivers/operations'
import {
  audit,
  binding,
  config,
  decode,
  encode,
  live,
  refusal,
  schedule,
  transaction,
  uid,
  type Snapshot,
} from './common'

export async function cloudManaged(providerId: number | null) {
  if (!providerId) return false
  const p = await db.hostingProvider.findUnique({ where: { id: providerId } })
  return (
    !!p &&
    config(p.config).autoOperations === true &&
    hasCloudOperations(
      hostingDriver({ driver: p.driver, url: p.url, username: p.username, secret: '', config: config(p.config) }),
    )
  )
}
export async function assertNoCloudOperation(
  serviceId?: number,
  domainId?: number,
  reader: Pick<Prisma.TransactionClient, 'hostingOperation'> = db,
) {
  if (
    await reader.hostingOperation.count({
      where: { ...(serviceId ? { serviceId } : { domainId }), status: { in: live } },
    })
  )
    refusal('عملیات سامانه هنوز تعیین تکلیف نشده است؛ ابتدا در مرکز عملیات نتیجه را بررسی کنید')
}
async function provider(tx: Prisma.TransactionClient, id: number) {
  const p = await tx.hostingProvider.findUniqueOrThrow({ where: { id } }),
    cfg = config(p.config)
  if (!p.active || cfg.autoOperations !== true) refusal('عملیات خودکار این اتصال فعال نیست')
  const connection = {
    driver: p.driver,
    url: p.url,
    username: p.username,
    secret: decryptPanelCredential(p.secret),
    config: cfg,
  }
  if (!hasCloudOperations(hostingDriver(connection))) refusal('عملیات این سامانه پشتیبانی نمی‌شود')
  return { p, cfg, connection }
}
export async function queueServiceOperation(
  serviceId: number,
  action: CloudAction = 'CREATE',
  actor: { id?: number; kind?: 'SYSTEM' | 'STAFF' | 'CUSTOMER'; key?: string } = {},
) {
  if (!(await isModuleEnabled('hosting'))) refusal('موبوکام کلاد غیرفعال است')
  if (['START', 'STOP', 'SHUTDOWN', 'REBOOT', 'TERMINATE'].includes(action)) {
    const service = await db.hostingService.findUnique({
      where: { id: serviceId },
      select: { cycle: true, status: true },
    })
    if (service?.cycle === 'HOURLY' && service.status === 'ACTIVE')
      await (await import('@/modules/hosting/server/hourly-power')).prepareHourlyPower(serviceId, action)
  }
  return transaction(async (tx) => {
    if (!(await isModuleEnabled('hosting', tx))) refusal('موبوکام کلاد غیرفعال است')
    const s = await tx.hostingService.findUniqueOrThrow({
      where: { id: serviceId },
      include: { product: true, user: true },
    })
    if (!s.providerId) refusal('سرویس اتصال خودکار ندارد')
    if(action==='CREATE'&&s.product.fulfillment!=='DRIVER')refusal('تحویل این محصول با کارشناس است')
    const { p, cfg, connection } = await provider(tx, s.providerId),
      key = action === 'CREATE' ? 'cloud-create:' + s.id : 'cloud-command:' + s.id + ':' + actor.key
    const prior = await tx.hostingOperation.findUnique({ where: { key } })
    if (prior) {
      if (prior.command !== action) refusal('کلید درخواست برای فرمان دیگری استفاده شده است')
      return prior
    }
    await assertNoCloudOperation(s.id, undefined, tx)
    if (s.user.status !== 'ACTIVE' || s.user.erasedAt) refusal('حساب صاحب سرویس فعال نیست')
    if (
      (action === 'CREATE' && !['PENDING', 'FAILED'].includes(s.status)) ||
      (action !== 'CREATE' && !['ACTIVE', 'SUSPENDED'].includes(s.status))
    )
      refusal('وضعیت سرویس برای این عملیات مناسب نیست')
    if (
      (action === 'SUSPEND' && s.status !== 'ACTIVE') ||
      (action === 'UNSUSPEND' && s.status !== 'SUSPENDED') ||
      (['START', 'STOP', 'SHUTDOWN', 'REBOOT'].includes(action) && s.status !== 'ACTIVE')
    )
      refusal('وضعیت سرویس برای این فرمان مناسب نیست')
    const capability = (
      {
        CREATE: 'create',
        SUSPEND: p.driver === 'CPANEL' ? 'suspend' : 'stop',
        UNSUSPEND: p.driver === 'CPANEL' ? 'unsuspend' : 'start',
        TERMINATE: p.driver === 'CPANEL' ? 'terminate' : 'delete',
        START: 'start',
        STOP: 'stop',
        SHUTDOWN: 'shutdown',
        REBOOT: 'reboot',
      } as Record<string, string>
    )[action]
    if (!hostingDriver(connection).capabilities.includes(capability as never))
      refusal('این فرمان برای اتصال انتخاب‌شده پشتیبانی نمی‌شود')
    if (action === 'CREATE' && p.driver === 'CPANEL' && !['SHARED', 'CLOUD_HOSTING'].includes(s.product.kind))
      refusal('ساخت خودکار فقط برای حساب هاست فعال است')
    if (action === 'CREATE' && s.orderId) {
      await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id"=${s.orderId} FOR UPDATE`
      const order = await tx.order.findUnique({ where: { id: s.orderId }, include: { invoice: true } })
      if (
        order?.status !== 'PAID' ||
        order.userId !== s.userId ||
        order.invoice?.status !== 'PAID' ||
        order.invoice.userId !== s.userId
      )
        refusal('پرداخت قطعی سفارش پیدا نشد')
    }
    const create =
      action === 'CREATE'
        ? null
        : await tx.hostingOperation.findFirst({
            where: { serviceId: s.id, command: 'CREATE', status: 'DONE' },
            orderBy: { createdAt: 'asc' },
          })
    if (action !== 'CREATE' && !create) refusal('مالکیت سرویس روی سامانه تأیید نشده است')
    const original = create ? decode(create.snapshot).input : null,
      namespace = original?.namespace || randomBytes(16).toString('hex'),
      id = uid()
    const password = 'Mc9!' + randomBytes(18).toString('base64url')
    const input: CloudOperationInput = {
      operationId: id,
      action,
      namespace,
      resourceName: original?.resourceName || 'mc-' + s.id + '-' + namespace.slice(0, 8),
      name: s.hostname,
      serviceId: s.id,
      resourceId: action === 'CREATE' ? undefined : s.externalId,
      plan: s.product.providerPlan,
      username: 'mc' + s.id + namespace.slice(0, Math.max(2, 12 - String(s.id).length)),
      password: action === 'CREATE' ? password : undefined,
      email: s.user.email.includes('@phone.mobocom.local') ? '' : s.user.email,
      config: { ...cfg, kind: s.product.kind },
      stage: p.driver === 'PROXMOX' && action === 'CREATE' ? 'CLONE' : undefined,
    }
    const snap: Snapshot = {
      input,
      connection,
      binding: binding(p),
      ownerId: s.userId,
      expected: s.status,
      expectedDue: s.nextDueAt?.toISOString(),
      actorId: actor.id,
      actor: actor.kind || 'SYSTEM',
    }
    const touched = await tx.hostingService.updateMany({
      where: { id: s.id, status: s.status, updatedAt: s.updatedAt },
      data: { ...(action === 'CREATE' ? { status: 'PROVISIONING' } : { updatedAt: new Date() }) },
    })
    if (!touched.count) refusal('سرویس هم‌زمان تغییر کرد')
    const row = await tx.hostingOperation.create({
      data: {
        id,
        key,
        providerId: p.id,
        serviceId: s.id,
        orderId: action === 'CREATE' ? s.orderId : null,
        command: action,
        snapshot: encode(snap),
      },
    })
    await schedule(tx, id, row.version)
    await audit(tx, id, 'queued')
    return row
  })
}
export async function queueDomainOperation(domainId: number, orderId: number, action: 'REGISTER' | 'RENEW') {
  return transaction(async (tx) => {
    if (!(await isModuleEnabled('hosting', tx))) refusal('موبوکام کلاد غیرفعال است')
    const d = await tx.domain.findUniqueOrThrow({ where: { id: domainId }, include: { tld: true, user: true } })
    await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id"=${orderId} FOR UPDATE`
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { invoice: true } })
    const key = 'cloud-domain:' + orderId,
      prior = await tx.hostingOperation.findUnique({ where: { key } })
    if (prior) return prior
    if (
      order.status !== 'PAID' ||
      order.userId !== d.userId ||
      order.invoice?.status !== 'PAID' ||
      order.invoice.userId !== d.userId ||
      d.user.status !== 'ACTIVE'
    )
      refusal('سفارش پرداخت‌شده و صاحب دامنه معتبر نیست')
    const meta = config(order.meta)
    if (
      (action === 'REGISTER' &&
        (meta.kind !== 'domain' || d.orderId !== orderId || d.kind !== 'REGISTER' || d.status !== 'PENDING')) ||
      (action === 'RENEW' &&
        (meta.kind !== 'domain-renewal' || Number(meta.domainId) !== d.id || !['ACTIVE', 'EXPIRED'].includes(d.status)))
    )
      refusal('سفارش دامنه هم‌خوانی ندارد')
    if (!d.tld.registrarId) refusal('ثبت‌کننده تنظیم نشده است')
    const { p, cfg, connection } = await provider(tx, d.tld.registrarId)
    if (p.driver !== 'JOKER') refusal('ثبت‌کنندهٔ خودکار پشتیبانی نمی‌شود')
    await assertNoCloudOperation(undefined, d.id, tx)
    const id = uid(),
      years = action === 'REGISTER' ? d.years : Number(meta.years),
      target = action === 'RENEW' ? new Date(d.expiresAt!) : null
    if (target) {
      const month = target.getUTCMonth()
      target.setUTCFullYear(target.getUTCFullYear() + years)
      if (target.getUTCMonth() !== month) target.setUTCDate(0)
    }
    const ownerHandle = String(meta.jokerContact || '')
    if (action === 'REGISTER' && !/^[A-Za-z0-9-]{3,64}$/.test(ownerHandle))
      refusal('شناسهٔ تماس مالک دامنهٔ Joker لازم است')
    if (!cfg.jokerMaxPrice || !cfg.nameservers) refusal('سقف هزینه و نیم‌سرورهای ثبت‌کننده تعیین نشده است')
    const input: CloudOperationInput = {
      operationId: id,
      action,
      namespace: id,
      resourceName: d.name,
      name: d.name,
      domainId: d.id,
      years,
      config: { ...cfg, ownerHandle, targetExpiry: target?.toISOString(), previousExpiry: d.expiresAt?.toISOString() },
    }
    const snap: Snapshot = {
      input,
      connection,
      binding: binding(p),
      ownerId: d.userId,
      expected: d.status,
      expectedDue: d.expiresAt?.toISOString(),
      actor: 'SYSTEM',
    }
    const touched = await tx.domain.updateMany({
      where: { id: d.id, status: d.status, updatedAt: d.updatedAt },
      data: { updatedAt: new Date() },
    })
    if (!touched.count) refusal('دامنه هم‌زمان تغییر کرد')
    if (action === 'RENEW')
      await tx.domainAction.upsert({
        where: { idempotencyKey: 'renew:order:' + orderId },
        create: {
          domainId: d.id,
          actor: 'SYSTEM',
          kind: 'RENEW',
          status: 'WAITING',
          idempotencyKey: 'renew:order:' + orderId,
          detail: 'پرداخت ثبت شد؛ در انتظار تأیید واقعی تمدید',
        },
        update: {},
      })
    const row = await tx.hostingOperation.create({
      data: { id, key, providerId: p.id, domainId: d.id, orderId, command: action, snapshot: encode(snap) },
    })
    await schedule(tx, id, row.version)
    await audit(tx, id, 'queued')
    return row
  })
}
