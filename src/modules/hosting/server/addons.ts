// Add-ons on a running service: extra traffic packs and plan upgrades, bought by the customer through checkout and
// applied once per paid order. Where the service is delivered by hand, staff get a task to apply it on the server.
import { db } from '@/platform/database/prisma'
import { logEvent } from '@/platform/observability/logger'
import { createInboxEvent } from '@/modules/notifications/server/inbox'
import { cycleMeta } from '@/modules/hosting/domain/catalog'
import { addonAllowed, trafficPacks, upgradeCharge, upgradeTargets } from '@/modules/hosting/domain/addons'
import { HostingRefusal } from '@/modules/hosting/server/services'

const parseMeta = (value: string): Record<string, unknown> => { try { return JSON.parse(value || '{}') } catch { return {} } }
const notify = (userId: number, serviceId: number, key: string, titleFa: string, bodyFa: string) =>
  createInboxEvent({ userId, kind: 'HOSTING', dedupeKey: `hosting:${serviceId}:${key}`, titleFa, titleEn: titleFa, bodyFa, bodyEn: bodyFa, href: `/dashboard/services/${serviceId}` })
    .catch((error) => logEvent('error', 'hosting.notify_failed', { serviceId, key, error }))

const USABLE = ['ACTIVE', 'SUSPENDED']

async function ownService(userId: number, serviceId: number) {
  const service = await db.hostingService.findFirst({ where: { id: serviceId, userId }, include: { product: true } })
  if (!service) throw new HostingRefusal('سرویس پیدا نشد', 404, 'HOSTING_SERVICE_NOT_FOUND')
  if (!USABLE.includes(service.status)) throw new HostingRefusal('روی این سرویس افزودنی خریده نمی‌شود', 409, 'HOSTING_NOT_ACTIVE')
  return service
}

async function candidates(service: { productId: number; currency: string; cycle: string; priceMinor: bigint; product: { kind: string } }) {
  const products = await db.hostingProduct.findMany({ where: { kind: service.product.kind, active: true }, include: { prices: true }, orderBy: [{ sort: 'asc' }, { id: 'asc' }] })
  return upgradeTargets({ productId: service.productId, kind: service.product.kind, cycle: service.cycle, currency: service.currency, priceMinor: service.priceMinor }, products)
}

// ============ Checkout ============

export type AddonRequest = { serviceId: number; kind: 'TRAFFIC' | 'UPGRADE'; packs?: unknown; productId?: unknown }

/** What an add-on costs this customer now; checkout freezes it on the order. */
export async function hostingAddonQuote(userId: number, request: AddonRequest, now = new Date()) {
  const service = await ownService(userId, request.serviceId)
  if (request.kind === 'TRAFFIC') {
    if (!addonAllowed(service.allowTraffic, service.product.allowTraffic) || !service.product.trafficPackGb || service.product.trafficPackMinor <= 0n) throw new HostingRefusal('خرید ترافیک برای این سرویس باز نیست', 403, 'HOSTING_ADDON_CLOSED')
    const packs = trafficPacks(request.packs)
    const gb = packs * service.product.trafficPackGb
    return {
      currency: service.currency, amountMinor: service.product.trafficPackMinor * BigInt(packs), label: `ترافیک اضافه ${gb.toLocaleString('fa-IR')} گیگ · ${service.label}`,
      meta: { kind: 'hosting-addon', addon: 'TRAFFIC', serviceId: service.id, packs, gb, productName: service.label, contentPath: `/dashboard/services/${service.id}` },
    }
  }
  if (request.kind !== 'UPGRADE') throw new HostingRefusal('افزودنی نامعتبر است', 400, 'HOSTING_ADDON')
  if (!addonAllowed(service.allowUpgrade, service.product.allowUpgrade)) throw new HostingRefusal('ارتقا برای این سرویس باز نیست', 403, 'HOSTING_ADDON_CLOSED')
  if (service.cycle === 'HOURLY') throw new HostingRefusal('سرویس ساعتی بدون پرداخت ارتقا می‌یابد و نرخ تازه از ساعت بعد حساب می‌شود', 409, 'HOSTING_UPGRADE_HOURLY')
  if (service.status !== 'ACTIVE' || !service.nextDueAt || service.nextDueAt <= now) throw new HostingRefusal('پیش از ارتقا سرویس را تمدید کنید', 409, 'HOSTING_RENEW_FIRST')
  const target = (await candidates(service)).find((row) => row.id === Number(request.productId))
  if (!target) throw new HostingRefusal('این پلن برای ارتقای این سرویس نیست', 400, 'HOSTING_UPGRADE_TARGET')
  const charge = upgradeCharge({ cycle: service.cycle, currentPriceMinor: service.priceMinor, newPriceMinor: target.newPriceMinor, nextDueAt: service.nextDueAt, now })
  if (charge <= 0n) throw new HostingRefusal('مبلغی برای ارتقا باقی نمانده است؛ پس از تمدید ارتقا دهید', 409, 'HOSTING_RENEW_FIRST')
  return {
    currency: service.currency, amountMinor: charge, label: `ارتقای ${service.label} به ${target.name}`,
    meta: {
      kind: 'hosting-addon', addon: 'UPGRADE', serviceId: service.id, fromProductId: service.productId, toProductId: target.id, toName: target.name,
      newPriceMinor: target.newPriceMinor.toString(), dueAt: service.nextDueAt.toISOString(), productName: service.label, contentPath: `/dashboard/services/${service.id}`,
    },
  }
}

// ============ Fulfilment ============

/**
 * A paid add-on is applied once per order (the action's unique key). Traffic is added to the service; an upgrade
 * moves it to the new plan and its renewal price. A task waits for staff when the service is delivered by hand,
 * so the change reaches the server too.
 */
export async function applyHostingAddon(orderId: number) {
  const order = await db.order.findUnique({ where: { id: orderId }, select: { id: true, userId: true, status: true, meta: true } })
  if (!order || order.status !== 'PAID') throw new Error('hosting add-on order is not paid')
  const meta = parseMeta(order.meta)
  const serviceId = Number(meta.serviceId)
  if (meta.kind !== 'hosting-addon' || !serviceId) throw new Error('hosting add-on order has no service')
  const key = `addon:order:${order.id}`
  if (await db.hostingAction.findUnique({ where: { idempotencyKey: key } })) return { applied: false, repeated: true }
  const service = await db.hostingService.findUnique({ where: { id: serviceId }, include: { product: { select: { fulfillment: true } } } })
  if (!service || service.userId !== order.userId) throw new Error('hosting add-on service is missing or not the buyer\'s')
  const manual = service.product.fulfillment !== 'DRIVER'
  const now = new Date()
  if (meta.addon === 'TRAFFIC') {
    const gb = Math.trunc(Number(meta.gb))
    if (!(gb > 0)) throw new Error('hosting traffic order has no amount')
    await db.$transaction([
      db.hostingAction.create({ data: { serviceId, actorId: order.userId, actor: 'CUSTOMER', kind: 'TRAFFIC', status: manual ? 'WAITING' : 'DONE', idempotencyKey: key, detail: `${gb.toLocaleString('fa-IR')} گیگ ترافیک اضافه`, finishedAt: manual ? null : now } }),
      db.hostingService.update({ where: { id: serviceId }, data: { extraTrafficGb: { increment: gb } } }),
    ])
    await notify(order.userId, serviceId, `traffic:${order.id}`, 'ترافیک اضافه ثبت شد', `${gb.toLocaleString('fa-IR')} گیگابایت به «${service.label}» اضافه شد.${manual ? ' کارشناس آن را روی سرور اعمال می‌کند.' : ''}`)
    return { applied: true, gb }
  }
  if (meta.addon === 'UPGRADE') {
    const target = await db.hostingProduct.findUnique({ where: { id: Number(meta.toProductId) }, select: { id: true, name: true } })
    if (!target) throw new Error('hosting upgrade target product is missing')
    await db.$transaction(async (tx) => {
      await tx.hostingAction.create({ data: { serviceId, actorId: order.userId, actor: 'CUSTOMER', kind: 'UPGRADE', status: manual ? 'WAITING' : 'DONE', idempotencyKey: key, detail: `ارتقا به ${target.name}`, finishedAt: manual ? null : now } })
      // Claim the plan it was bought from: two upgrades paid at once apply in order, never both from the same plan.
      const moved = await tx.hostingService.updateMany({ where: { id: serviceId, productId: Number(meta.fromProductId) }, data: { productId: target.id, label: target.name, priceMinor: BigInt(String(meta.newPriceMinor)) } })
      if (moved.count !== 1) throw new Error('hosting service changed plan during upgrade; staff review needed')
    })
    await notify(order.userId, serviceId, `upgrade:${order.id}`, 'سرویس شما ارتقا یافت', `«${service.label}» به ${target.name} ارتقا یافت.${manual ? ' کارشناس منابع را روی سرور افزایش می‌دهد.' : ''}`)
    return { applied: true, upgraded: target.id }
  }
  throw new Error('unknown hosting add-on')
}

/** Paid add-on orders that never got their job (a crash between payment and enqueue). */
export async function addonOrdersWithoutDelivery(limit = 20) {
  const orders = await db.order.findMany({ where: { status: 'PAID', meta: { contains: '"kind":"hosting-addon"' }, invoice: { status: 'PAID' } }, orderBy: { id: 'desc' }, take: 200, select: { id: true, invoice: { select: { id: true } } } })
  if (!orders.length) return []
  const ids = orders.map((order) => order.id)
  const [jobs, actions] = await Promise.all([
    db.fulfillmentJob.findMany({ where: { orderId: { in: ids }, kind: 'HOSTING_ADDON' }, select: { orderId: true } }),
    db.hostingAction.findMany({ where: { idempotencyKey: { in: ids.map((id) => `addon:order:${id}`) } }, select: { idempotencyKey: true } }),
  ])
  const covered = new Set([...jobs.map((job) => job.orderId), ...actions.map((action) => Number(String(action.idempotencyKey).split(':').pop()))])
  return orders.filter((order) => !covered.has(order.id)).slice(0, limit).map((order) => ({ orderId: order.id, invoiceId: order.invoice?.id ?? null }))
}

// ============ Customer ============

/** What the service page offers: traffic packs and the plans it can move to, with what each costs now. */
export async function memberAddons(userId: number, serviceId: number, now = new Date()) {
  const service = await db.hostingService.findFirst({ where: { id: serviceId, userId }, include: { product: true } })
  if (!service || !USABLE.includes(service.status)) return null
  const traffic = addonAllowed(service.allowTraffic, service.product.allowTraffic) && service.product.trafficPackGb > 0 && service.product.trafficPackMinor > 0n
  const upgrades = addonAllowed(service.allowUpgrade, service.product.allowUpgrade) ? await candidates(service) : []
  return {
    extraTrafficGb: service.extraTrafficGb,
    traffic: traffic ? { packGb: service.product.trafficPackGb, packPrice: Number(service.product.trafficPackMinor) } : null,
    upgrades: upgrades.map((row) => ({
      productId: row.id, name: row.name, tagline: row.tagline, cpuCores: row.cpuCores, ramMb: row.ramMb, diskGb: row.diskGb, diskType: row.diskType, trafficGb: row.trafficGb,
      newPrice: Number(row.newPriceMinor),
      now: service.cycle === 'HOURLY' ? 0 : Number(upgradeCharge({ cycle: service.cycle, currentPriceMinor: service.priceMinor, newPriceMinor: row.newPriceMinor, nextDueAt: service.nextDueAt, now })),
    })),
    cycleLabel: cycleMeta(service.cycle)?.short || '',
    renewFirst: service.cycle !== 'HOURLY' && (service.status !== 'ACTIVE' || !service.nextDueAt || service.nextDueAt <= now),
  }
}

/** An hourly service changes plan without payment; the new rate is charged from the next hour. */
export async function upgradeHourlyService(userId: number, serviceId: number, productId: number) {
  const service = await ownService(userId, serviceId)
  if (service.cycle !== 'HOURLY') throw new HostingRefusal('ارتقای سرویس دوره‌ای با پرداخت مابه‌التفاوت انجام می‌شود', 409, 'HOSTING_UPGRADE_FIXED')
  if (!addonAllowed(service.allowUpgrade, service.product.allowUpgrade)) throw new HostingRefusal('ارتقا برای این سرویس باز نیست', 403, 'HOSTING_ADDON_CLOSED')
  const target = (await candidates(service)).find((row) => row.id === productId)
  if (!target) throw new HostingRefusal('این پلن برای ارتقای این سرویس نیست', 400, 'HOSTING_UPGRADE_TARGET')
  const manual = service.product.fulfillment !== 'DRIVER'
  await db.$transaction(async (tx) => {
    const moved = await tx.hostingService.updateMany({ where: { id: service.id, productId: service.productId }, data: { productId: target.id, label: target.name, priceMinor: target.newPriceMinor, stoppedHourlyMinor: target.stoppedHourlyMinor } })
    if (moved.count !== 1) throw new HostingRefusal('سرویس همزمان تغییر کرد؛ صفحه را تازه کنید', 409)
    await tx.hostingAction.create({ data: { serviceId: service.id, actorId: userId, actor: 'CUSTOMER', kind: 'UPGRADE', status: manual ? 'WAITING' : 'DONE', detail: `ارتقا به ${target.name}`, finishedAt: manual ? null : new Date() } })
  })
  return { productId: target.id }
}

// ============ Staff ============

/** Staff mark a waiting task (delivery is separate) done once it is applied on the server. */
export async function completeHostingTask(actionId: number, actorId: number) {
  const action = await db.hostingAction.findUnique({ where: { id: actionId }, select: { id: true, kind: true, status: true, serviceId: true, detail: true, service: { select: { userId: true, label: true } } } })
  if (!action || !['TRAFFIC', 'UPGRADE'].includes(action.kind)) throw new HostingRefusal('کار پیدا نشد', 404)
  const done = await db.hostingAction.updateMany({ where: { id: action.id, status: 'WAITING' }, data: { status: 'DONE', finishedAt: new Date() } })
  if (done.count !== 1) throw new HostingRefusal('این کار قبلاً انجام شده است', 409)
  await db.hostingAction.create({ data: { serviceId: action.serviceId, actorId, actor: 'STAFF', kind: 'NOTE', detail: `${action.detail}: روی سرور اعمال شد`, finishedAt: new Date() } })
  await notify(action.service.userId, action.serviceId, `task-done:${action.id}`, 'تغییر سرویس اعمال شد', `${action.detail} روی «${action.service.label}» اعمال شد.`)
  return { id: action.id }
}

