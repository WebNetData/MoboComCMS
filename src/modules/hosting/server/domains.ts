// Domains: the price list of extensions, search, ordering through checkout, staff registration at the registry,
// renewal, name servers and the yearly lifecycle. Until a registrar driver exists, registry work is a staff task.
import { domainToASCII, domainToUnicode } from 'node:url'
import { db } from '@/platform/database/prisma'
import { logEvent } from '@/platform/observability/logger'
import { getModuleSettings, isModuleEnabled } from '@/extensions/server/modules'
import { createInboxEvent } from '@/modules/notifications/server/inbox'
import { encryptPanelCredential } from '@/modules/providers/server/panel-credentials'
import { moveWallet } from '@/modules/wallet/server/wallet'
import { legacyNumber, normalizeCurrency } from '@/shared/money'
import { HostingError } from '@/modules/hosting/domain/catalog'
import {
  cleanDomainInput, domainSettings, domainStep, matchSuffix, normalizeHandle, normalizeNameservers, normalizeSuffix, parseYears, renewedExpiry, validLabel,
  type Availability,
} from '@/modules/hosting/domain/domains'
import { checkDomain } from '@/modules/hosting/server/domain-check'
import { HostingRefusal } from '@/modules/hosting/server/services'

const parseMeta = (value: string): Record<string, unknown> => { try { return JSON.parse(value || '{}') } catch { return {} } }
const parseList = (value: string): string[] => { try { const list = JSON.parse(value); return Array.isArray(list) ? list.map(String) : [] } catch { return [] } }
const unicode = (name: string) => domainToUnicode(name) || name
const notify = (userId: number, domainId: number, key: string, titleFa: string, bodyFa: string) =>
  createInboxEvent({ userId, kind: 'HOSTING', dedupeKey: `domain:${domainId}:${key}`, titleFa, titleEn: titleFa, bodyFa, bodyEn: bodyFa, href: `/dashboard/domains/${domainId}` })
    .then(() => 1).catch((error) => { logEvent('error', 'domain.notify_failed', { domainId, key, error }); return 0 })

/** Any script in, ASCII (punycode) out: «فروشگاه.ایران» works as well as shop.ir. */
function toAscii(value: unknown): string {
  const cleaned = cleanDomainInput(value)
  if (!cleaned) return ''
  const ascii = /^[\x00-\x7f]*$/.test(cleaned) ? cleaned : domainToASCII(cleaned)
  return ascii.toLowerCase()
}

// ============ Price list (staff) ============

export async function adminTlds() {
  const rows = await db.domainTld.findMany({ orderBy: [{ sort: 'asc' }, { suffix: 'asc' }], include: { _count: { select: { domains: true } }, registrar: { select: { name: true } } } })
  return rows.map(({ registerMinor, renewMinor, transferMinor, _count, ...row }) => ({ ...row, registerMinor: registerMinor.toString(), renewMinor: renewMinor.toString(), transferMinor: transferMinor.toString(), domains: _count.domains }))
}

const money = (value: unknown, positive: boolean) => {
  const text = String(value ?? '').trim()
  if (!/^\d{1,15}$/.test(text)) throw new HostingError('مبلغ باید عددی صحیح باشد')
  const amount = BigInt(text)
  if (positive && amount <= 0n) throw new HostingError('قیمت ثبت و تمدید باید بیشتر از صفر باشد')
  return amount
}

export async function saveTld(raw: Record<string, unknown>) {
  const suffix = normalizeSuffix(raw.suffix)
  const years = parseYears(raw.years)
  if (!years.length) throw new HostingError('دست‌کم یک مدت ثبت (سال) وارد کنید')
  const registrarId = Number(raw.registrarId) > 0 ? Number(raw.registrarId) : null
  if (registrarId && (await db.hostingProvider.findUnique({ where: { id: registrarId }, select: { family: true } }))?.family !== 'REGISTRAR') throw new HostingError('سامانهٔ انتخاب‌شده ثبت‌کنندهٔ دامنه نیست')
  const data = {
    suffix, registrarId, years: years.join(','), registerMinor: money(raw.registerMinor, true), renewMinor: money(raw.renewMinor, true), transferMinor: money(raw.transferMinor ?? '0', false),
    needsHandle: raw.needsHandle === true || (raw.needsHandle === undefined && (suffix === 'ir' || suffix.endsWith('.ir'))),
    active: raw.active !== false, featured: raw.featured === true, sort: Math.max(0, Math.min(100_000, Math.trunc(Number(raw.sort) || 0))),
  }
  try {
    const id = Number(raw.id) || 0
    return id ? await db.domainTld.update({ where: { id }, data, select: { id: true } }) : await db.domainTld.create({ data, select: { id: true } })
  } catch (error) {
    if ((error as { code?: string })?.code === 'P2002') throw new HostingError('این پسوند قبلاً تعریف شده است')
    throw error
  }
}

export async function deleteTld(id: number) {
  const row = await db.domainTld.findUnique({ where: { id }, select: { _count: { select: { domains: true } } } })
  if (!row) return false
  if (row._count.domains) throw new HostingError('این پسوند دامنهٔ ثبت‌شده دارد؛ غیرفعالش کنید')
  await db.domainTld.delete({ where: { id } })
  return true
}

// ============ Search (public) ============

export type DomainResult = { name: string; display: string; suffix: string; state: Availability; register: number; renew: number; transfer: number; years: number[]; needsHandle: boolean }

/**
 * What a visitor typed, checked on its own extension and on the featured ones: "shop" is tried as shop.ir, shop.com…;
 * "shop.co.ir" first on co.ir. A name already ordered here counts as taken.
 */
export async function searchDomains(query: unknown): Promise<{ query: string; results: DomainResult[]; error?: string }> {
  const ascii = toAscii(query)
  if (!ascii) return { query: '', results: [] }
  const tlds = await db.domainTld.findMany({ where: { active: true }, orderBy: [{ featured: 'desc' }, { sort: 'asc' }] })
  const suffix = matchSuffix(ascii, tlds.map((tld) => tld.suffix))
  const label = suffix ? ascii.slice(0, -(suffix.length + 1)) : ascii.split('.')[0]
  if (!label || label.includes('.')) return { query: ascii, results: [], error: 'فقط نام دامنه را بنویسید، بدون زیردامنه' }
  const picked = [...(suffix ? tlds.filter((tld) => tld.suffix === suffix) : []), ...tlds.filter((tld) => tld.featured && tld.suffix !== suffix)].slice(0, 8)
  if (!picked.length && tlds.length) picked.push(...tlds.slice(0, 6))
  const valid = picked.filter((tld) => validLabel(label, tld.suffix))
  if (!valid.length) return { query: ascii, results: [], error: label.length < 3 ? 'نام دامنه دست‌کم سه حرف باشد' : 'نام دامنه فقط حروف، عدد و خط تیره است' }
  const names = valid.map((tld) => `${label}.${tld.suffix}`)
  const ordered = new Set((await db.domain.findMany({ where: { name: { in: names }, status: { not: 'CANCELLED' } }, select: { name: true } })).map((row) => row.name))
  const states = await Promise.all(names.map((name) => (ordered.has(name) ? Promise.resolve('taken' as const) : checkDomain(name))))
  return {
    query: ascii,
    results: valid.map((tld, i) => ({ name: names[i], display: unicode(names[i]), suffix: tld.suffix, state: states[i], register: Number(tld.registerMinor), renew: Number(tld.renewMinor), transfer: Number(tld.transferMinor), years: parseYears(tld.years), needsHandle: tld.needsHandle })),
  }
}

export async function publicTlds() {
  const rows = await db.domainTld.findMany({ where: { active: true }, orderBy: [{ featured: 'desc' }, { sort: 'asc' }, { suffix: 'asc' }] })
  return rows.map((row) => ({ suffix: row.suffix, register: Number(row.registerMinor), renew: Number(row.renewMinor), transfer: Number(row.transferMinor), years: parseYears(row.years), needsHandle: row.needsHandle, featured: row.featured }))
}

// ============ Ordering ============

export type DomainOrderRequest = { name: unknown; years: unknown; transfer?: boolean; handle?: unknown; authCode?: unknown }

/** Registration or transfer in, priced from the list; checkout freezes it on the order. */
export async function domainOrderQuote(request: DomainOrderRequest) {
  const name = toAscii(request.name)
  const tlds = await db.domainTld.findMany({ where: { active: true } })
  const suffix = matchSuffix(name, tlds.map((tld) => tld.suffix))
  const tld = tlds.find((row) => row.suffix === suffix)
  if (!tld || !suffix) throw new HostingRefusal('این پسوند دامنه فروخته نمی‌شود', 400, 'DOMAIN_SUFFIX')
  const label = name.slice(0, -(suffix.length + 1))
  if (label.includes('.') || !validLabel(label, suffix)) throw new HostingRefusal('نام دامنه معتبر نیست', 400, 'DOMAIN_NAME')
  const transfer = request.transfer === true
  const years = transfer ? 1 : Math.trunc(Number(request.years))
  if (!transfer && !parseYears(tld.years).includes(years)) throw new HostingRefusal('این مدت برای این پسوند نیست', 400, 'DOMAIN_YEARS')
  if (transfer && tld.transferMinor <= 0n) throw new HostingRefusal('انتقال این پسوند پذیرفته نمی‌شود', 400, 'DOMAIN_NO_TRANSFER')
  const handle = tld.needsHandle ? normalizeHandle(request.handle) : ''
  const authCode = String(request.authCode ?? '').trim().slice(0, 200)
  if (transfer && !tld.needsHandle && authCode.length < 4) throw new HostingRefusal('کد انتقال (Auth code) دامنه را وارد کنید', 400, 'DOMAIN_AUTHCODE')
  if (await db.domain.findFirst({ where: { name, status: { not: 'CANCELLED' } }, select: { id: true } })) throw new HostingRefusal('این دامنه قبلاً در این سایت سفارش داده شده است', 409, 'DOMAIN_ALREADY_ORDERED')
  const state = await checkDomain(name)
  if (!transfer && state === 'taken') throw new HostingRefusal('این دامنه قبلاً ثبت شده است؛ اگر مال شماست، انتقال دهید', 409, 'DOMAIN_TAKEN')
  if (transfer && state === 'available') throw new HostingRefusal('این دامنه هنوز ثبت نشده است؛ آن را ثبت کنید', 409, 'DOMAIN_NOT_REGISTERED')
  return {
    currency: tld.currency,
    amountMinor: transfer ? tld.transferMinor : tld.registerMinor * BigInt(years),
    label: `${transfer ? 'انتقال' : 'ثبت'} دامنهٔ ${unicode(name)}${transfer ? '' : ` · ${years.toLocaleString('fa-IR')} سال`}`,
    meta: { kind: 'domain', name, tldId: tld.id, years, action: transfer ? 'TRANSFER' : 'REGISTER', handle, authCode: authCode ? encryptPanelCredential(authCode) : '', renewMinor: tld.renewMinor.toString(), availability: state, productName: unicode(name), contentPath: '/dashboard/services' },
  }
}

/** After payment: the domain row (once per order, one live row per name) and a registry task for staff. */
export async function fulfillDomainOrder(orderId: number) {
  const order = await db.order.findUnique({ where: { id: orderId }, select: { id: true, userId: true, status: true, meta: true, currency: true } })
  if (!order || order.status !== 'PAID' || order.userId === null) throw new Error('domain order is not paid or has no buyer')
  const buyerId = order.userId
  const meta = parseMeta(order.meta)
  if (meta.kind !== 'domain') throw new Error('not a domain order')
  let domain = await db.domain.findUnique({ where: { orderId } })
  if (!domain) {
    try {
      domain = await db.$transaction(async (tx) => {
        const created = await tx.domain.create({ data: {
          userId: buyerId, tldId: Number(meta.tldId), name: String(meta.name), kind: String(meta.action) === 'TRANSFER' ? 'TRANSFER' : 'REGISTER', years: Number(meta.years) || 1,
          renewMinor: BigInt(String(meta.renewMinor)), currency: order.currency, orderId, handle: String(meta.handle || ''), authCode: String(meta.authCode || ''),
        } })
        await tx.domainAction.create({ data: { domainId: created.id, actor: 'SYSTEM', kind: created.kind, status: 'WAITING', idempotencyKey: `order:${orderId}`, detail: `${created.kind === 'TRANSFER' ? 'انتقال' : 'ثبت'} در رجیستری${meta.availability === 'unknown' ? ' (وضعیت آزاد بودن بررسی نشد)' : ''}` } })
        return created
      })
    } catch (error) {
      if ((error as { code?: string })?.code !== 'P2002') throw error
      const existing = await db.domain.findUnique({ where: { orderId } })
      if (existing) domain = existing
      else {
        // The name was taken by another order between quote and payment: the money goes back.
        await refundOrder(order.id, order.userId, `دامنهٔ ${unicode(String(meta.name))} همزمان سفارش داده شد`)
        return null
      }
    }
  }
  await notify(order.userId, domain.id, 'received', 'سفارش دامنه ثبت شد', `${unicode(domain.name)} در حال ${domain.kind === 'TRANSFER' ? 'انتقال' : 'ثبت'} است. پس از تکمیل اطلاع می‌دهیم.`)
  return domain.id
}

async function refundOrder(orderId: number, userId: number, reason: string) {
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, select: { totalMinor: true, currency: true, invoice: { select: { id: true } } } })
  const refund = await moveWallet({ userId, amount: legacyNumber(order.totalMinor, normalizeCurrency(order.currency)), currency: order.currency, type: 'REFUND', description: reason, orderId, invoiceId: order.invoice?.id ?? null, idempotencyKey: `domain-refund:${orderId}` })
  if (!refund.ok) throw new Error(`domain refund failed: ${refund.message || ''}`)
}

// ============ Staff ============

export async function adminDomains(filter: { status?: string; q?: string; page?: number }) {
  const page = Math.max(1, Math.trunc(Number(filter.page) || 1)), take = 30
  const q = toAscii(filter.q).slice(0, 80) || String(filter.q || '').trim().slice(0, 80)
  const where = {
    ...(filter.status && ['PENDING', 'ACTIVE', 'EXPIRED', 'CANCELLED'].includes(filter.status) ? { status: filter.status } : {}),
    ...(filter.status === 'TASKS' ? { actions: { some: { status: 'WAITING' } } } : {}),
    ...(q ? { OR: [{ name: { contains: q } }, { user: { email: { contains: q, mode: 'insensitive' as const } } }, { handle: { contains: q } }] } : {}),
  }
  const [rows, total, tasks] = await Promise.all([
    db.domain.findMany({ where, orderBy: { id: 'desc' }, skip: (page - 1) * take, take, include: { user: { select: { email: true, name: true } }, actions: { orderBy: { id: 'desc' }, take: 10 } } }),
    db.domain.count({ where }),
    db.domainAction.count({ where: { status: 'WAITING' } }),
  ])
  return { page, pages: Math.max(1, Math.ceil(total / take)), total, tasks, domains: rows.map(({ renewMinor, authCode, nameservers, ...row }) => ({ ...row, display: unicode(row.name), renewMinor: renewMinor.toString(), hasAuthCode: Boolean(authCode), nameservers: parseList(nameservers) })) }
}

/** Staff finished the registration or transfer at the registry: the domain is active until the given date. */
export async function completeDomainRegistration(domainId: number, input: { expiresAt?: unknown; nameservers?: unknown }, actorId: number) {
  const domain = await db.domain.findUnique({ where: { id: domainId } })
  if (!domain) throw new HostingRefusal('دامنه پیدا نشد', 404)
  if (domain.status !== 'PENDING') throw new HostingRefusal('این دامنه در انتظار ثبت نیست', 409)
  const now = new Date()
  const given = input.expiresAt ? new Date(String(input.expiresAt)) : null
  if (given && (Number.isNaN(given.getTime()) || given <= now)) throw new HostingRefusal('تاریخ انقضا باید در آینده باشد')
  const expiresAt = given || renewedExpiry(now, domain.years)
  const nameservers = input.nameservers ? normalizeNameservers(input.nameservers) : null
  const claimed = await db.domain.updateMany({ where: { id: domain.id, status: 'PENDING' }, data: { status: 'ACTIVE', registeredAt: now, expiresAt, ...(nameservers ? { nameservers: JSON.stringify(nameservers) } : {}), authCode: '' } })
  if (claimed.count !== 1) throw new HostingRefusal('وضعیت دامنه همزمان تغییر کرد', 409)
  await db.domainAction.updateMany({ where: { domainId: domain.id, kind: { in: ['REGISTER', 'TRANSFER'] }, status: 'WAITING' }, data: { status: 'DONE', actorId, finishedAt: now } })
  await notify(domain.userId, domain.id, 'active', 'دامنهٔ شما فعال شد', `${unicode(domain.name)} ثبت شد و تا ${new Intl.DateTimeFormat('fa-IR-u-ca-persian', { dateStyle: 'long', timeZone: 'Asia/Tehran' }).format(expiresAt)} اعتبار دارد.`)
  return { id: domain.id, expiresAt }
}

/** Staff could not register it (taken, refused by the registry): the order is cancelled and the money returned. */
export async function cancelDomainOrder(domainId: number, reason: string, actorId: number) {
  const domain = await db.domain.findUnique({ where: { id: domainId } })
  if (!domain) throw new HostingRefusal('دامنه پیدا نشد', 404)
  if (domain.status !== 'PENDING') throw new HostingRefusal('فقط سفارشی که هنوز ثبت نشده لغو می‌شود', 409)
  const claimed = await db.domain.updateMany({ where: { id: domain.id, status: 'PENDING' }, data: { status: 'CANCELLED', authCode: '' } })
  if (claimed.count !== 1) throw new HostingRefusal('وضعیت دامنه همزمان تغییر کرد', 409)
  if (domain.orderId) await refundOrder(domain.orderId, domain.userId, `برگشت سفارش دامنهٔ ${unicode(domain.name)}`)
  const text = String(reason || '').trim().slice(0, 300)
  await db.domainAction.updateMany({ where: { domainId: domain.id, status: 'WAITING' }, data: { status: 'DONE', finishedAt: new Date() } })
  await db.domainAction.create({ data: { domainId: domain.id, actorId, actor: 'STAFF', kind: 'CANCEL', detail: text || 'ثبت نشد', finishedAt: new Date() } })
  await notify(domain.userId, domain.id, 'cancelled', 'سفارش دامنه لغو شد', `${unicode(domain.name)} ثبت نشد${text ? `: ${text}` : ''}. مبلغ به کیف پول شما برگشت.`)
  return { id: domain.id }
}

/** A registry task (renewal, name servers, transfer code) done by staff. */
export async function completeDomainTask(actionId: number, actorId: number, note = '') {
  const action = await db.domainAction.findUnique({ where: { id: actionId }, include: { domain: { select: { id: true, userId: true, name: true } } } })
  if (!action || !['RENEW', 'NAMESERVERS', 'AUTHCODE'].includes(action.kind)) throw new HostingRefusal('کار پیدا نشد', 404)
  const done = await db.domainAction.updateMany({ where: { id: action.id, status: 'WAITING' }, data: { status: 'DONE', actorId, finishedAt: new Date() } })
  if (done.count !== 1) throw new HostingRefusal('این کار قبلاً انجام شده است', 409)
  const text = String(note || '').trim().slice(0, 500)
  if (text) await db.domainAction.create({ data: { domainId: action.domainId, actorId, actor: 'STAFF', kind: 'NOTE', detail: text, finishedAt: new Date() } })
  await notify(action.domain.userId, action.domainId, `task:${action.id}`, 'درخواست دامنه انجام شد', `${action.detail} برای ${unicode(action.domain.name)} انجام شد.${text ? ` ${text}` : ''}`)
  return { id: action.id }
}

// ============ Renewal ============

export async function domainRenewQuote(userId: number, domainId: number, yearsInput: unknown) {
  const domain = await db.domain.findFirst({ where: { id: domainId, userId }, include: { tld: { select: { years: true } } } })
  if (!domain) throw new HostingRefusal('دامنه پیدا نشد', 404, 'DOMAIN_NOT_FOUND')
  if (!['ACTIVE', 'EXPIRED'].includes(domain.status) || !domain.expiresAt) throw new HostingRefusal('این دامنه قابل تمدید نیست', 409, 'DOMAIN_NOT_RENEWABLE')
  const years = Math.trunc(Number(yearsInput))
  if (!parseYears(domain.tld.years).includes(years)) throw new HostingRefusal('این مدت برای این پسوند نیست', 400, 'DOMAIN_YEARS')
  return {
    currency: domain.currency, amountMinor: domain.renewMinor * BigInt(years), label: `تمدید دامنهٔ ${unicode(domain.name)} · ${years.toLocaleString('fa-IR')} سال`,
    meta: { kind: 'domain-renewal', domainId: domain.id, years, expiresAt: domain.expiresAt.toISOString(), productName: unicode(domain.name), contentPath: `/dashboard/domains/${domain.id}` },
  }
}

/** A paid renewal moves the expiry by its years once per order and asks staff to renew at the registry. */
export async function applyDomainRenewal(orderId: number) {
  const order = await db.order.findUnique({ where: { id: orderId }, select: { id: true, userId: true, status: true, meta: true } })
  if (!order || order.status !== 'PAID') throw new Error('domain renewal order is not paid')
  const meta = parseMeta(order.meta)
  if (meta.kind !== 'domain-renewal') throw new Error('not a domain renewal order')
  const key = `renew:order:${order.id}`
  if (await db.domainAction.findUnique({ where: { idempotencyKey: key } })) return { repeated: true }
  const domain = await db.domain.findUnique({ where: { id: Number(meta.domainId) } })
  if (!domain || domain.userId !== order.userId) throw new Error('domain of a renewal is missing or not the buyer\'s')
  if (domain.status === 'CANCELLED' || !domain.expiresAt) {
    await refundOrder(order.id, order.userId, `برگشت تمدید ${unicode(domain.name)}`)
    await db.domainAction.create({ data: { domainId: domain.id, actor: 'SYSTEM', kind: 'RENEW', status: 'FAILED', idempotencyKey: key, detail: 'دامنه فعال نبود؛ مبلغ برگشت', finishedAt: new Date() } })
    return { refunded: true }
  }
  const years = Number(meta.years) || 1
  const expiresAt = renewedExpiry(domain.expiresAt, years)
  await db.$transaction(async (tx) => {
    await tx.domainAction.create({ data: { domainId: domain.id, actorId: order.userId, actor: 'CUSTOMER', kind: 'RENEW', status: 'WAITING', idempotencyKey: key, detail: `تمدید ${years.toLocaleString('fa-IR')} ساله در رجیستری` } })
    const moved = await tx.domain.updateMany({ where: { id: domain.id, expiresAt: domain.expiresAt }, data: { expiresAt, status: 'ACTIVE' } })
    if (moved.count !== 1) throw new Error('domain changed during renewal; retry')
  })
  await notify(order.userId, domain.id, `renewed:${order.id}`, 'دامنهٔ شما تمدید شد', `${unicode(domain.name)} تا ${new Intl.DateTimeFormat('fa-IR-u-ca-persian', { dateStyle: 'long', timeZone: 'Asia/Tehran' }).format(expiresAt)} تمدید شد.`)
  return { expiresAt }
}

export async function domainOrdersWithoutDelivery(limit = 20) {
  const orders = await db.order.findMany({ where: { status: 'PAID', OR: [{ meta: { contains: '"kind":"domain"' } }, { meta: { contains: '"kind":"domain-renewal"' } }], invoice: { status: 'PAID' } }, orderBy: { id: 'desc' }, take: 200, select: { id: true, invoice: { select: { id: true } } } })
  if (!orders.length) return []
  const ids = orders.map((order) => order.id)
  const [jobs, domains, actions] = await Promise.all([
    db.fulfillmentJob.findMany({ where: { orderId: { in: ids }, kind: { in: ['DOMAIN_ORDER', 'DOMAIN_RENEW'] } }, select: { orderId: true } }),
    db.domain.findMany({ where: { orderId: { in: ids } }, select: { orderId: true } }),
    db.domainAction.findMany({ where: { idempotencyKey: { in: ids.map((id) => `renew:order:${id}`) } }, select: { idempotencyKey: true } }),
  ])
  const covered = new Set([...jobs.map((job) => job.orderId), ...domains.map((row) => row.orderId), ...actions.map((action) => Number(String(action.idempotencyKey).split(':').pop()))])
  return orders.filter((order) => !covered.has(order.id)).slice(0, limit).map((order) => ({ orderId: order.id, invoiceId: order.invoice?.id ?? null }))
}

// ============ Customer ============

export async function memberDomains(userId: number) {
  const rows = await db.domain.findMany({ where: { userId }, orderBy: [{ status: 'asc' }, { id: 'desc' }], select: { id: true, name: true, status: true, kind: true, expiresAt: true, autoRenew: true } })
  return rows.map((row) => ({ ...row, display: unicode(row.name) }))
}

export async function memberDomain(userId: number, domainId: number) {
  const row = await db.domain.findFirst({ where: { id: domainId, userId }, include: { tld: { select: { suffix: true, years: true, needsHandle: true } }, actions: { orderBy: { id: 'desc' }, take: 20 } } })
  if (!row) return null
  const { authCode: _authCode, renewMinor, nameservers, actions, tld, ...domain } = row
  return {
    ...domain, display: unicode(domain.name), renewMinor: renewMinor.toString(), nameservers: parseList(nameservers), suffix: tld.suffix, yearOptions: parseYears(tld.years),
    actions: actions.map((action) => ({ id: action.id, kind: action.kind, status: action.status, actor: action.actor, detail: action.detail, createdAt: action.createdAt })),
  }
}

async function ownLive(userId: number, domainId: number) {
  const domain = await db.domain.findFirst({ where: { id: domainId, userId } })
  if (!domain) throw new HostingRefusal('دامنه پیدا نشد', 404)
  if (!['ACTIVE', 'EXPIRED'].includes(domain.status)) throw new HostingRefusal('این دامنه هنوز فعال نشده است', 409)
  return domain
}

export async function setDomainAutoRenew(userId: number, domainId: number, on: boolean) {
  const domain = await ownLive(userId, domainId)
  await db.domain.update({ where: { id: domain.id }, data: { autoRenew: on } })
  await db.domainAction.create({ data: { domainId: domain.id, actorId: userId, actor: 'CUSTOMER', kind: 'NOTE', detail: on ? 'تمدید خودکار از کیف پول روشن شد' : 'تمدید خودکار خاموش شد', finishedAt: new Date() } })
  return { autoRenew: on }
}

/** The customer's name servers are stored at once and handed to staff to set at the registry. */
export async function requestNameservers(userId: number, domainId: number, list: unknown) {
  const domain = await ownLive(userId, domainId)
  const nameservers = normalizeNameservers(list)
  await db.$transaction([
    db.domain.update({ where: { id: domain.id }, data: { nameservers: JSON.stringify(nameservers) } }),
    db.domainAction.updateMany({ where: { domainId: domain.id, kind: 'NAMESERVERS', status: 'WAITING' }, data: { status: 'DONE', finishedAt: new Date(), detail: 'جایگزین با درخواست تازه' } }),
    db.domainAction.create({ data: { domainId: domain.id, actorId: userId, actor: 'CUSTOMER', kind: 'NAMESERVERS', status: 'WAITING', detail: `تغییر نیم‌سرورها: ${nameservers.join('، ')}` } }),
  ])
  return { nameservers }
}

/** A transfer-out code, at most once a day; staff send it after checking the request. */
export async function requestAuthCode(userId: number, domainId: number) {
  const domain = await ownLive(userId, domainId)
  try {
    await db.domainAction.create({ data: { domainId: domain.id, actorId: userId, actor: 'CUSTOMER', kind: 'AUTHCODE', status: 'WAITING', idempotencyKey: `authcode:${domain.id}:${new Date().toISOString().slice(0, 10)}`, detail: 'درخواست کد انتقال' } })
  } catch (error) {
    if ((error as { code?: string })?.code === 'P2002') throw new HostingRefusal('امروز این درخواست را ثبت کرده‌اید', 429)
    throw error
  }
  return { requested: true }
}

// ============ Scheduled ============

/** Reminders, wallet renewal from three days before expiry, and EXPIRED after it. Hourly; repeats safely. */
export async function runDomainLifecycle(now = new Date()) {
  const counters = { checked: 0, reminded: 0, renewed: 0, expired: 0, failed: 0 }
  if (!await isModuleEnabled('hosting')) return counters
  const settings = domainSettings(await getModuleSettings('hosting').catch(() => ({} as Record<string, unknown>)))
  const horizon = new Date(now.getTime() + (Math.max(...settings.reminderDays) + 1) * 86_400_000)
  const rows = await db.domain.findMany({ where: { status: { in: ['ACTIVE', 'EXPIRED'] }, expiresAt: { lte: horizon } }, select: { id: true, userId: true, name: true, status: true, expiresAt: true, autoRenew: true }, take: 5000 })
  for (const row of rows) {
    counters.checked++
    try {
      const step = domainStep(row, now, settings)
      if (!step || !row.expiresAt) continue
      const stamp = row.expiresAt.toISOString()
      if (step.kind === 'remind') counters.reminded += await notify(row.userId, row.id, `due:${step.days}:${stamp}`, 'زمان تمدید دامنه نزدیک است', `${step.days.toLocaleString('fa-IR')} روز تا انقضای ${unicode(row.name)} مانده است.${row.autoRenew ? ' از کیف پول تمدید می‌شود؛ موجودی را بررسی کنید.' : ''}`)
      else if (step.kind === 'expire') {
        const moved = await db.domain.updateMany({ where: { id: row.id, status: 'ACTIVE', expiresAt: row.expiresAt }, data: { status: 'EXPIRED' } })
        if (moved.count !== 1) continue
        await db.domainAction.create({ data: { domainId: row.id, actor: 'SYSTEM', kind: 'EXPIRE', detail: 'اعتبار دامنه تمام شد', finishedAt: now } })
        counters.expired++
        await notify(row.userId, row.id, `expired:${stamp}`, 'دامنهٔ شما منقضی شد', `${unicode(row.name)} منقضی شد. هرچه زودتر تمدید کنید تا از دست نرود.`)
      } else if (step.kind === 'renew') {
        const { executeCheckout } = await import('@/modules/checkout/server/checkout')
        const { getSettings } = await import('@/modules/settings/server')
        const outcome = await executeCheckout({ userId: row.userId, domainRenew: { domainId: row.id, years: 1 }, payWith: 'wallet', idempotencyKey: `domain-renew-${row.id}-${row.expiresAt.getTime()}`, siteUrl: (await getSettings()).siteUrl || process.env.NEXTAUTH_URL || '' })
        if (outcome.ok) counters.renewed++
        else await notify(row.userId, row.id, `renew-failed:${stamp}`, 'تمدید خودکار دامنه انجام نشد', `${unicode(row.name)}: ${outcome.code === 'INSUFFICIENT_FUNDS' ? 'موجودی کیف پول کافی نبود.' : outcome.message} کیف پول را شارژ کنید یا دستی تمدید کنید.`)
      }
    } catch (error) {
      counters.failed++
      logEvent('error', 'domain.lifecycle_failed', { domainId: row.id, error: String(error) })
    }
  }
  return counters
}
