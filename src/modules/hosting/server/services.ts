// Hosting services: the quote checkout freezes on an order, delivery after payment, staff delivery and states,
// and what the customer sees. Spec: docs/specs/hosting-cloud/SPEC.md, slice 2.
import crypto from 'node:crypto'
import { db } from '@/platform/database/prisma'
import { logEvent } from '@/platform/observability/logger'
import { createInboxEvent } from '@/modules/notifications/server/inbox'
import { decryptPanelCredential, encryptPanelCredential } from '@/modules/providers/server/panel-credentials'
import { HostingError, cycleMeta, kindMeta } from '@/modules/hosting/domain/catalog'
import {
  SERVICE_STATUS, STAFF_TRANSITIONS, normalizeHostname, normalizeIpv4, normalizeIpv6, normalizePanelUrl, normalizeServiceName, termEnd,
  type ServiceStatus,
} from '@/modules/hosting/domain/services'
import { canProvision } from '@/modules/hosting/server/drivers/contract'
import { hostingDriver } from '@/modules/hosting/server/drivers/registry'

/** HostingError with an HTTP status and a code for checkout. */
export class HostingRefusal extends HostingError {
  constructor(message: string, readonly status = 400, readonly code = 'HOSTING') { super(message) }
}

const parseConfig = (value: string): Record<string, unknown> => { try { const data = JSON.parse(value); return data && typeof data === 'object' && !Array.isArray(data) ? data : {} } catch { return {} } }
const parseMeta = (value: string): Record<string, unknown> => { try { return JSON.parse(value || '{}') } catch { return {} } }
const OPEN: ServiceStatus[] = ['PENDING', 'PROVISIONING', 'ACTIVE', 'SUSPENDED', 'FAILED']

async function notify(userId: number, serviceId: number, key: string, titleFa: string, bodyFa: string) {
  await createInboxEvent({ userId, kind: 'HOSTING', dedupeKey: `hosting:${serviceId}:${key}`, titleFa, titleEn: titleFa, bodyFa, bodyEn: bodyFa, href: `/dashboard/services/${serviceId}` })
    .catch((error) => logEvent('error', 'hosting.notify_failed', { serviceId, key, error }))
}

// ============ Checkout ============

/**
 * What buying `productId` for `cycle` costs this customer and what the order carries. Checkout calls it and stores
 * `meta` on the order; delivery reads it back from there, so later price changes never touch a paid order.
 */
export async function hostingQuote(input: { productId: number; cycle: string; hostname: unknown }) {
  const product = await db.hostingProduct.findUnique({ where: { id: input.productId }, include: { prices: true, provider: { select: { id: true, active: true, capacity: true } } } })
  if (!product || !product.active) throw new HostingRefusal('این پلن در حال حاضر فروخته نمی‌شود', 404, 'HOSTING_PRODUCT_NOT_FOUND')
  if (input.cycle === 'HOURLY') throw new HostingRefusal('خرید ساعتی از کیف پول به‌زودی فعال می‌شود؛ فعلاً یک دورهٔ ماهانه یا بلندتر انتخاب کنید', 409, 'HOSTING_HOURLY_LATER')
  const price = product.prices.find((row) => row.cycle === input.cycle && row.currency === product.currency)
  if (!price || !cycleMeta(input.cycle)) throw new HostingRefusal('این دوره برای این پلن قیمت ندارد', 400, 'HOSTING_CYCLE')
  const hostname = normalizeServiceName(product.kind, input.hostname)
  if (product.fulfillment === 'DRIVER') {
    if (!product.provider?.active) throw new HostingRefusal('این پلن موقتاً قابل تحویل نیست؛ با پشتیبانی تماس بگیرید', 503, 'HOSTING_PROVIDER_INACTIVE')
    if (product.provider.capacity > 0) {
      const used = await db.hostingService.count({ where: { providerId: product.provider.id, status: { in: OPEN } } })
      if (used >= product.provider.capacity) throw new HostingRefusal('ظرفیت این پلن تکمیل شده است', 409, 'HOSTING_FULL')
    }
  }
  return {
    currency: product.currency,
    amountMinor: price.amountMinor + price.setupMinor,
    label: `${kindMeta(product.kind)?.label || ''} ${product.name}`.trim(),
    meta: {
      kind: 'hosting', hostingProductId: product.id, cycle: input.cycle, hostname, productName: product.name,
      priceMinor: price.amountMinor.toString(), setupMinor: price.setupMinor.toString(), contentPath: '/dashboard/services',
    },
  }
}

// ============ Delivery ============

/** After payment: the service exists once per order, then is created on its system or waits for staff. */
export async function fulfillHostingOrder(orderId: number) {
  const order = await db.order.findUnique({ where: { id: orderId }, select: { id: true, userId: true, status: true, meta: true, currency: true } })
  if (!order || order.status !== 'PAID') throw new Error('hosting order is not paid')
  const meta = parseMeta(order.meta)
  const productId = Number(meta.hostingProductId)
  if (meta.kind !== 'hosting' || !productId || !cycleMeta(String(meta.cycle))) throw new Error('hosting order has no product')
  let service = await db.hostingService.findUnique({ where: { orderId } })
  if (!service) {
    const product = await db.hostingProduct.findUnique({ where: { id: productId }, select: { id: true, name: true, providerId: true, fulfillment: true } })
    if (!product) throw new Error('hosting product of a paid order is missing')
    try {
      service = await db.hostingService.create({ data: {
        userId: order.userId, productId, orderId, cycle: String(meta.cycle), currency: order.currency,
        priceMinor: BigInt(String(meta.priceMinor || '0')), label: String(meta.productName || product.name),
        hostname: String(meta.hostname || ''), providerId: product.fulfillment === 'DRIVER' ? product.providerId : null,
      } })
    } catch (error) {
      // A second worker created it first: the unique order id keeps it to one.
      if ((error as { code?: string })?.code !== 'P2002') throw error
      service = await db.hostingService.findUniqueOrThrow({ where: { orderId } })
    }
  }
  await provisionService(service.id)
  return service.id
}

function newPassword() {
  // 20 characters from a set every panel accepts, with at least one of each class.
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnpqrstuvwxyz', '23456789', '@#%+=_']
  const all = sets.join('')
  const chars = sets.map((set) => set[crypto.randomInt(set.length)])
  while (chars.length < 20) chars.push(all[crypto.randomInt(all.length)])
  for (let i = chars.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]] }
  return chars.join('')
}

/**
 * Creates the service on its system when its driver can, otherwise leaves it for staff. A failed call puts the
 * service back to PENDING and throws, so the fulfillment job retries with backoff and stuck jobs alert staff.
 * Drivers name what they create after the service id, so a retry after a lost answer finds it instead of
 * creating a second one.
 */
export async function provisionService(serviceId: number) {
  const service = await db.hostingService.findUnique({ where: { id: serviceId }, include: { product: true, provider: true, user: { select: { email: true } } } })
  if (!service) throw new Error('hosting service not found')
  if (!['PENDING', 'PROVISIONING', 'FAILED'].includes(service.status)) return { status: service.status }
  const driver = service.product.fulfillment === 'DRIVER' && service.provider?.active
    ? hostingDriver({ driver: service.provider.driver, url: service.provider.url, username: service.provider.username, secret: decryptPanelCredential(service.provider.secret), config: parseConfig(service.provider.config) })
    : null
  if (!driver || !canProvision(driver)) {
    // Manual delivery, or a system whose driver cannot create yet: staff deliver it by hand.
    await db.hostingAction.upsert({
      where: { idempotencyKey: `deliver:${service.id}` },
      create: { serviceId: service.id, actor: 'SYSTEM', kind: 'DELIVER', status: 'WAITING', idempotencyKey: `deliver:${service.id}`, detail: driver ? 'سامانهٔ متصل هنوز ساخت خودکار ندارد' : 'تحویل دستی' },
      update: {},
    })
    await notify(service.userId, service.id, 'received', 'سفارش سرویس شما ثبت شد', `«${service.label}» در حال آماده‌سازی است. اطلاعات ورود پس از تحویل در داشبورد نمایش داده می‌شود.`)
    return { status: service.status, waiting: true }
  }
  const claimed = await db.hostingService.updateMany({ where: { id: service.id, status: { in: ['PENDING', 'FAILED', 'PROVISIONING'] } }, data: { status: 'PROVISIONING' } })
  if (claimed.count !== 1) return { status: service.status }
  const username = `u${service.id}`.slice(0, 16)
  const password = newPassword()
  try {
    const result = await driver.provision({ serviceId: service.id, kind: service.product.kind, plan: service.product.providerPlan, hostname: service.hostname || `svc-${service.id}`, username, password, email: service.user.email })
    if (!result.externalId) throw new Error('the system did not return an id')
    const startedAt = new Date()
    await db.$transaction([
      db.hostingService.update({ where: { id: service.id }, data: {
        status: 'ACTIVE', externalId: result.externalId, ipv4: result.ipv4 || '', ipv6: result.ipv6 || '', panelUrl: result.panelUrl || '',
        loginUser: result.username || username, loginSecret: encryptPanelCredential(result.password || password),
        startedAt, nextDueAt: termEnd(startedAt, service.cycle),
      } }),
      db.hostingAction.create({ data: { serviceId: service.id, actor: 'SYSTEM', kind: 'PROVISION', status: 'DONE', detail: `ساخته شد روی ${service.provider!.name}`, finishedAt: startedAt } }),
    ])
    await notify(service.userId, service.id, 'ready', 'سرویس شما آماده است', `«${service.label}» فعال شد. اطلاعات ورود را در داشبورد ببینید.`)
    return { status: 'ACTIVE' as const }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await db.hostingService.updateMany({ where: { id: service.id, status: 'PROVISIONING' }, data: { status: 'FAILED' } })
    await db.hostingAction.create({ data: { serviceId: service.id, actor: 'SYSTEM', kind: 'PROVISION', status: 'FAILED', error: message.slice(0, 500), finishedAt: new Date() } })
    throw new Error(`hosting provision failed: ${message}`)
  }
}

/** A paid hosting order that never got its delivery job (a crash between payment and enqueue). */
export async function hostingOrdersWithoutDelivery(limit = 20) {
  const orders = await db.order.findMany({
    where: { status: 'PAID', meta: { contains: '"kind":"hosting"' }, invoice: { status: 'PAID' } },
    orderBy: { id: 'desc' }, take: 200, select: { id: true, invoice: { select: { id: true } } },
  })
  if (!orders.length) return []
  const ids = orders.map((order) => order.id)
  const [jobs, services] = await Promise.all([
    db.fulfillmentJob.findMany({ where: { orderId: { in: ids }, kind: 'HOSTING_PROVISION' }, select: { orderId: true } }),
    db.hostingService.findMany({ where: { orderId: { in: ids } }, select: { orderId: true } }),
  ])
  const covered = new Set([...jobs.map((job) => job.orderId), ...services.map((service) => service.orderId)])
  return orders.filter((order) => !covered.has(order.id)).slice(0, limit).map((order) => ({ orderId: order.id, invoiceId: order.invoice?.id ?? null }))
}

// ============ Staff ============

export type DeliveryInput = { hostname?: unknown; ipv4?: unknown; ipv6?: unknown; panelUrl?: unknown; loginUser?: unknown; password?: unknown; note?: unknown; allowTraffic?: unknown; allowUpgrade?: unknown }

/**
 * Staff hand over a service (or correct its details). The first delivery starts the term; later edits leave the
 * dates alone. An empty password keeps the stored one.
 */
export async function deliverService(serviceId: number, input: DeliveryInput, actorId: number) {
  const service = await db.hostingService.findUnique({ where: { id: serviceId }, include: { product: { select: { kind: true } } } })
  if (!service) throw new HostingRefusal('سرویس پیدا نشد', 404)
  if (service.status === 'TERMINATED') throw new HostingRefusal('سرویس حذف‌شده تحویل نمی‌شود', 409)
  const ipv4 = normalizeIpv4(input.ipv4), ipv6 = normalizeIpv6(input.ipv6), panelUrl = normalizePanelUrl(input.panelUrl)
  const hostname = input.hostname === undefined ? service.hostname : kindMeta(service.product.kind)?.group === 'hosting' ? normalizeServiceName(service.product.kind, input.hostname) : normalizeHostname(input.hostname)
  const loginUser = String(input.loginUser ?? '').trim().slice(0, 120)
  const password = String(input.password ?? '').slice(0, 300)
  const first = ['PENDING', 'PROVISIONING', 'FAILED'].includes(service.status)
  if (first && !ipv4 && !panelUrl) throw new HostingRefusal('برای تحویل، آی‌پی یا نشانی پنل را وارد کنید')
  if (first && (!loginUser || (!password && !service.loginSecret))) throw new HostingRefusal('نام کاربری و رمز ورود را وارد کنید')
  const tri = (value: unknown) => (value === true ? true : value === false ? false : null)
  const startedAt = new Date()
  const data = {
    hostname, ipv4, ipv6, panelUrl, loginUser, note: String(input.note ?? '').trim().slice(0, 2000),
    ...(password ? { loginSecret: encryptPanelCredential(password) } : {}),
    ...('allowTraffic' in input ? { allowTraffic: tri(input.allowTraffic) } : {}),
    ...('allowUpgrade' in input ? { allowUpgrade: tri(input.allowUpgrade) } : {}),
    ...(first ? { status: 'ACTIVE', startedAt, nextDueAt: termEnd(startedAt, service.cycle) } : {}),
  }
  // The status the decision was made on: a concurrent delivery or suspension makes this one refuse.
  const updated = await db.hostingService.updateMany({ where: { id: service.id, status: service.status }, data })
  if (updated.count !== 1) throw new HostingRefusal('وضعیت سرویس همزمان تغییر کرد؛ صفحه را تازه کنید', 409)
  await db.hostingAction.updateMany({ where: { serviceId: service.id, kind: 'DELIVER', status: 'WAITING' }, data: { status: 'DONE', actorId, finishedAt: startedAt } })
  await db.hostingAction.create({ data: { serviceId: service.id, actorId, actor: 'STAFF', kind: first ? 'DELIVER' : 'NOTE', detail: first ? 'تحویل شد' : 'اطلاعات سرویس به‌روز شد', finishedAt: startedAt } })
  if (first) await notify(service.userId, service.id, 'ready', 'سرویس شما آماده است', `«${service.label}» تحویل شد. اطلاعات ورود را در داشبورد ببینید.`)
  return { id: service.id, delivered: first }
}

/** Suspend, unsuspend or terminate by hand. The system follows in the lifecycle slice. */
export async function changeServiceStatus(serviceId: number, op: keyof typeof STAFF_TRANSITIONS, actorId: number, reason = '') {
  const rule = STAFF_TRANSITIONS[op]
  if (!rule) throw new HostingRefusal('عملیات نامعتبر است')
  const service = await db.hostingService.findUnique({ where: { id: serviceId }, select: { id: true, userId: true, label: true, status: true } })
  if (!service) throw new HostingRefusal('سرویس پیدا نشد', 404)
  if (!rule.from.includes(service.status as ServiceStatus)) throw new HostingRefusal(`سرویس «${SERVICE_STATUS[service.status as ServiceStatus]?.label || service.status}» است و این کار روی آن انجام نمی‌شود`, 409)
  const now = new Date()
  const data = op === 'SUSPEND' ? { status: rule.to, suspendedAt: now } : op === 'UNSUSPEND' ? { status: rule.to, suspendedAt: null } : { status: rule.to, terminatedAt: now }
  const updated = await db.hostingService.updateMany({ where: { id: service.id, status: service.status }, data })
  if (updated.count !== 1) throw new HostingRefusal('وضعیت سرویس همزمان تغییر کرد؛ صفحه را تازه کنید', 409)
  const detail = String(reason).trim().slice(0, 500)
  await db.hostingAction.create({ data: { serviceId: service.id, actorId, actor: 'STAFF', kind: op, detail, finishedAt: now } })
  if (op === 'TERMINATE') await db.hostingAction.updateMany({ where: { serviceId: service.id, status: 'WAITING' }, data: { status: 'DONE', finishedAt: now, detail: 'سرویس حذف شد' } })
  const words = { SUSPEND: ['سرویس شما معلق شد', 'دسترسی به سرویس موقتاً بسته شده است.'], UNSUSPEND: ['سرویس شما دوباره فعال شد', 'دسترسی به سرویس باز شد.'], TERMINATE: ['سرویس شما حذف شد', 'این سرویس دیگر فعال نیست.'] }[op]
  await notify(service.userId, service.id, `${op.toLowerCase()}:${now.getTime()}`, words[0], `«${service.label}»: ${words[1]}${detail ? ` ${detail}` : ''}`)
  return { id: service.id, status: rule.to }
}

export async function adminHostingServices(filter: { status?: string; q?: string; page?: number }) {
  const page = Math.max(1, Math.trunc(Number(filter.page) || 1)), take = 30
  const q = String(filter.q || '').trim().slice(0, 80)
  const where = {
    ...(filter.status && filter.status in SERVICE_STATUS ? { status: filter.status } : {}),
    ...(q ? { OR: [{ label: { contains: q, mode: 'insensitive' as const } }, { hostname: { contains: q, mode: 'insensitive' as const } }, { ipv4: { contains: q } }, { user: { email: { contains: q, mode: 'insensitive' as const } } }, ...(/^\d+$/.test(q) ? [{ id: Number(q) }] : [])] } : {}),
  }
  const [rows, total, waiting] = await Promise.all([
    db.hostingService.findMany({ where, orderBy: { id: 'desc' }, skip: (page - 1) * take, take, include: { user: { select: { id: true, email: true, name: true } }, product: { select: { kind: true, fulfillment: true, allowTraffic: true, allowUpgrade: true } }, provider: { select: { name: true } }, actions: { orderBy: { id: 'desc' }, take: 12 } } }),
    db.hostingService.count({ where }),
    db.hostingService.count({ where: { status: { in: ['PENDING', 'FAILED'] } } }),
  ])
  return {
    page, pages: Math.max(1, Math.ceil(total / take)), total, waiting,
    services: rows.map(({ loginSecret, priceMinor, ...row }) => ({ ...row, priceMinor: priceMinor.toString(), hasPassword: Boolean(loginSecret) })),
  }
}

// ============ Customer ============

/** The customer's own services; nobody else's are ever read here. */
export async function memberHostingServices(userId: number) {
  const rows = await db.hostingService.findMany({ where: { userId }, orderBy: [{ status: 'asc' }, { id: 'desc' }], include: { product: { select: { kind: true, cpuCores: true, ramMb: true, diskGb: true, diskType: true, location: true } } } })
  return rows.map(({ loginSecret: _secret, priceMinor, ...row }) => ({ ...row, priceMinor: priceMinor.toString() }))
}

export async function memberHostingService(userId: number, serviceId: number) {
  const row = await db.hostingService.findFirst({ where: { id: serviceId, userId }, include: { product: true, actions: { where: { kind: { not: 'REVEAL' } }, orderBy: { id: 'desc' }, take: 20 } } })
  if (!row) return null
  const { loginSecret, priceMinor, product, actions, ...service } = row
  return {
    ...service, priceMinor: priceMinor.toString(), hasPassword: Boolean(loginSecret),
    allowTraffic: service.allowTraffic ?? product.allowTraffic, allowUpgrade: service.allowUpgrade ?? product.allowUpgrade,
    product: { kind: product.kind, name: product.name, cpuCores: product.cpuCores, ramMb: product.ramMb, diskGb: product.diskGb, diskType: product.diskType, trafficGb: product.trafficGb, bandwidthMbps: product.bandwidthMbps, sites: product.sites, mailboxes: product.mailboxes, databases: product.databases, location: product.location, fulfillment: product.fulfillment },
    actions: actions.map((action) => ({ id: action.id, kind: action.kind, status: action.status, actor: action.actor, detail: action.detail, createdAt: action.createdAt })),
  }
}

/** The login password, to its owner only, while the service is usable; every reveal is recorded. */
export async function revealServicePassword(userId: number, serviceId: number) {
  const service = await db.hostingService.findFirst({ where: { id: serviceId, userId }, select: { id: true, status: true, loginSecret: true } })
  if (!service) throw new HostingRefusal('سرویس پیدا نشد', 404)
  if (!['ACTIVE', 'SUSPENDED'].includes(service.status) || !service.loginSecret) throw new HostingRefusal('رمزی برای نمایش وجود ندارد', 409)
  const password = decryptPanelCredential(service.loginSecret)
  await db.hostingAction.create({ data: { serviceId: service.id, actorId: userId, actor: 'CUSTOMER', kind: 'REVEAL', finishedAt: new Date() } })
  return password
}
