import { cache } from 'react'
import { db } from '@/platform/database/prisma'
import { isModuleEnabled } from '@/extensions/server/modules'
import { itemCard, itemCards } from '@/modules/content/server/registry'
import { itemPath } from '@/modules/content/domain/items'
import { createInboxEvent } from '@/modules/notifications/server/inbox'
import {
  OWNER_TYPES, PaywallError, contentKey, decideAccess, formatPrice, normalizePaidInput, pickRule, priceInput,
  type AccessDecision, type OwnerType,
} from '@/modules/paywall/domain/paywall'

/**
 * Paid content: prices on articles and downloadable items, who bought what,
 * and the access decision every gate (article page, download link, music
 * player) asks for. Enabled with the `paywall` module.
 */

export type Chain = { ownerType: OwnerType; ownerId: number }[]

export const paywallEnabled = cache(() => isModuleEnabled('paywall'))

/** The rules on an item and its parents, plus whether the viewer bought the one that applies. */
export async function accessFor(viewer: { userId: number | null; member: boolean }, chain: Chain): Promise<{ decision: AccessDecision; key: string | null }> {
  if (!chain.length || !await paywallEnabled()) return { decision: { open: true, reason: 'free' }, key: null }
  const rules = await db.paidItem.findMany({ where: { OR: chain.map((link) => ({ ownerType: link.ownerType, ownerId: link.ownerId })), active: true } }).catch(() => [])
  const rule = pickRule(rules, chain)
  if (!rule) return { decision: { open: true, reason: 'free' }, key: null }
  const purchased = viewer.userId ? !!await db.contentPurchase.findFirst({ where: { userId: viewer.userId, ownerType: rule.ownerType, ownerId: rule.ownerId, revokedAt: null }, select: { id: true } }) : false
  return { decision: decideAccess(rule, { member: viewer.member, purchased }), key: contentKey(rule.ownerType, rule.ownerId) }
}

/** Is there an active price on this item (the paywall replaces the plain "VIP only" gate)? */
export async function isPaid(chain: Chain): Promise<boolean> {
  if (!chain.length || !await paywallEnabled()) return false
  return (await db.paidItem.count({ where: { OR: chain.map((link) => ({ ownerType: link.ownerType, ownerId: link.ownerId })), active: true } }).catch(() => 0)) > 0
}

export type PaywallView = {
  key: string
  open: boolean
  reason: string
  price: string
  listPrice: string
  vipFree: boolean
  vipPrice: string
  memberPrice: boolean
  title: string
}

/** What the buy box shows for an item (null when it is not for sale). */
export async function paywallView(viewer: { userId: number | null; member: boolean }, chain: Chain): Promise<PaywallView | null> {
  const { decision, key } = await accessFor(viewer, chain)
  if (!key) return null
  const [ownerType, ownerId] = key.split(':')
  const card = await itemCard({ type: ownerType as OwnerType, id: Number(ownerId) }).catch(() => null)
  if (decision.open) return { key, open: true, reason: decision.reason, price: '', listPrice: '', vipFree: false, vipPrice: '', memberPrice: false, title: card?.title || '' }
  return {
    key, open: false, reason: 'buy', title: card?.title || '',
    price: formatPrice(decision.priceMinor, decision.currency), listPrice: formatPrice(decision.listPriceMinor, decision.currency),
    vipFree: decision.vipFree, vipPrice: decision.vipPriceMinor ? formatPrice(decision.vipPriceMinor, decision.currency) : '', memberPrice: decision.memberPrice,
  }
}

// ------------------------------------------------------------------ checkout & fulfilment

export type CheckoutQuote = { ownerType: OwnerType; ownerId: number; amountMinor: bigint; currency: string; label: string; path: string; memberPrice: boolean }

/** Price for checkout. Refuses items that are free for this viewer or already bought. */
export async function quoteContent(key: { ownerType: OwnerType; ownerId: number }, viewer: { userId: number; member: boolean }): Promise<CheckoutQuote> {
  if (!await paywallEnabled()) throw new PaywallError('فروش محتوا در حال حاضر فعال نیست', 403, 'PAYWALL_DISABLED')
  const card = await itemCard({ type: key.ownerType, id: key.ownerId })
  if (!card) throw new PaywallError('این مورد یافت نشد', 404, 'CONTENT_NOT_FOUND')
  const { decision } = await accessFor(viewer, [key])
  if (decision.open) throw new PaywallError(decision.reason === 'purchased' ? 'این مورد را قبلاً خریده‌اید' : 'این مورد برای شما رایگان است', 409, 'ALREADY_OPEN')
  return { ...key, amountMinor: decision.priceMinor, currency: decision.currency, label: card.title, path: card.url, memberPrice: decision.memberPrice }
}

/** Grants a paid content order (fulfilment job). Safe to run more than once. */
export async function fulfillContentOrder(orderId: number): Promise<void> {
  const order = await db.order.findUnique({ where: { id: orderId }, select: { id: true, userId: true, status: true, meta: true, totalMinor: true, currency: true } })
  if (!order || order.status !== 'PAID') throw new Error('content order is not paid')
  let meta: Record<string, unknown> = {}
  try { meta = JSON.parse(order.meta || '{}') } catch { /* ignore */ }
  const ownerType = String(meta.ownerType || '') as OwnerType
  const ownerId = Number(meta.ownerId)
  if (!OWNER_TYPES.includes(ownerType) || !ownerId) throw new Error('content order has no item')
  const created = await grantContent({ userId: order.userId, ownerType, ownerId, orderId: order.id, paidMinor: order.totalMinor, currency: order.currency, source: 'PURCHASE' })
  if (!created) return
  await db.paidItem.updateMany({ where: { ownerType, ownerId }, data: { sales: { increment: 1 }, revenueMinor: { increment: order.totalMinor } } }).catch(() => undefined)
  const path = String(meta.contentPath || itemPath(ownerType, { id: ownerId }))
  await createInboxEvent({
    userId: order.userId, kind: 'CONTENT_PURCHASE', dedupeKey: `content:order:${order.id}`,
    titleFa: `خرید «${String(meta.contentTitle || '').slice(0, 80)}» انجام شد`, titleEn: 'Your purchase is ready',
    bodyFa: 'دسترسی دائمی شما فعال شد؛ همیشه از «خریدهای من» در دسترس است.', bodyEn: 'You now have lifetime access.',
    href: path,
  }).catch(() => undefined)
}

/** Adds (or restores) access. Returns false when the user already had it. */
export async function grantContent(input: { userId: number; ownerType: OwnerType; ownerId: number; orderId?: number | null; paidMinor?: bigint; currency?: string; source: 'PURCHASE' | 'ADMIN'; note?: string }): Promise<boolean> {
  const where = { userId_ownerType_ownerId: { userId: input.userId, ownerType: input.ownerType, ownerId: input.ownerId } }
  const existing = await db.contentPurchase.findUnique({ where })
  if (existing && !existing.revokedAt) return false
  if (existing) {
    await db.contentPurchase.update({ where: { id: existing.id }, data: { revokedAt: null, orderId: input.orderId ?? existing.orderId, source: input.source, note: String(input.note || existing.note).slice(0, 300) } })
    return true
  }
  try {
    await db.contentPurchase.create({ data: {
      userId: input.userId, ownerType: input.ownerType, ownerId: input.ownerId, orderId: input.orderId ?? null,
      paidMinor: input.paidMinor ?? 0n, currency: input.currency || 'IRT', source: input.source, note: String(input.note || '').slice(0, 300),
    } })
    return true
  } catch {
    return false // a concurrent grant won
  }
}

// ------------------------------------------------------------------ customer

/** "My purchases": everything the user bought, newest first. */
export async function myPurchases(userId: number) {
  const rows = await db.contentPurchase.findMany({ where: { userId, revokedAt: null }, orderBy: { createdAt: 'desc' }, take: 500 })
  const cards = await itemCards(rows.map((row) => ({ type: row.ownerType as OwnerType, id: row.ownerId })))
  return rows.map((row) => {
    const card = cards.get(`${row.ownerType}:${row.ownerId}`)
    return {
      id: row.id, ownerType: row.ownerType, title: card?.title || 'موردی که دیگر منتشر نیست', url: card?.url || '', image: card?.image || '', subtitle: card?.subtitle || '',
      paid: row.source === 'ADMIN' ? 'هدیهٔ مدیر' : formatPrice(row.paidMinor, row.currency), createdAt: row.createdAt.toISOString(),
    }
  })
}

// ------------------------------------------------------------------ admin

type OwnerRow = { id: number; title: string; path: string; image: string; status: string }

/** Titles of items for the admin (drafts included). */
async function ownerRows(refs: { ownerType: string; ownerId: number }[]): Promise<Map<string, OwnerRow>> {
  const out = new Map<string, OwnerRow>()
  const ids = (type: string) => [...new Set(refs.filter((ref) => ref.ownerType === type).map((ref) => ref.ownerId))]
  const put = (type: string, rows: { id: number; title: string; slug: string; status: string; image: string }[]) => {
    for (const row of rows) out.set(`${type}:${row.id}`, { id: row.id, title: row.title, path: itemPath(type as OwnerType, row), image: row.image, status: row.status })
  }
  const pick = { id: true, title: true, slug: true, status: true } as const
  await Promise.all([
    ids('post').length && db.post.findMany({ where: { id: { in: ids('post') } }, select: { ...pick, cover: true } }).then((rows) => put('post', rows.map((r) => ({ ...r, image: r.cover })))),
    ids('software').length && db.softwareTitle.findMany({ where: { id: { in: ids('software') } }, select: { ...pick, icon: true } }).then((rows) => put('software', rows.map((r) => ({ ...r, image: r.icon })))),
    ids('game').length && db.gameTitle.findMany({ where: { id: { in: ids('game') } }, select: { ...pick, cover: true } }).then((rows) => put('game', rows.map((r) => ({ ...r, image: r.cover })))),
    ids('title').length && db.cinemaTitle.findMany({ where: { id: { in: ids('title') } }, select: { ...pick, poster: true } }).then((rows) => put('title', rows.map((r) => ({ ...r, image: r.poster })))),
    ids('album').length && db.musicAlbum.findMany({ where: { id: { in: ids('album') } }, select: { ...pick, cover: true } }).then((rows) => put('album', rows.map((r) => ({ ...r, image: r.cover })))),
    ids('track').length && db.musicTrack.findMany({ where: { id: { in: ids('track') } }, select: { ...pick, cover: true } }).then((rows) => put('track', rows.map((r) => ({ ...r, image: r.cover })))),
  ])
  return out
}

const adminItem = (row: { id: number; ownerType: string; ownerId: number; priceMinor: bigint; currency: string; vipAccess: string; memberPriceMinor: bigint | null; active: boolean; sales: number; revenueMinor: bigint; updatedAt: Date }) => ({
  id: row.id, ownerType: row.ownerType, ownerId: row.ownerId, key: contentKey(row.ownerType, row.ownerId),
  price: priceInput(row.priceMinor, row.currency), memberPrice: priceInput(row.memberPriceMinor, row.currency), priceLabel: formatPrice(row.priceMinor, row.currency),
  memberPriceLabel: row.memberPriceMinor ? formatPrice(row.memberPriceMinor, row.currency) : '', currency: row.currency, vipAccess: row.vipAccess, active: row.active,
  sales: row.sales, revenue: formatPrice(row.revenueMinor, row.currency), updatedAt: row.updatedAt.toISOString(),
})

/** Price panel of one item in a section editor. */
export async function getPaidItem(ownerType: OwnerType, ownerId: number) {
  const row = await db.paidItem.findUnique({ where: { ownerType_ownerId: { ownerType, ownerId } } })
  return { enabled: await paywallEnabled(), item: row ? adminItem(row) : null }
}

export async function savePaidItem(ownerType: OwnerType, ownerId: number, input: Record<string, unknown>) {
  if (!(await ownerRows([{ ownerType, ownerId }])).size) throw new PaywallError('این مورد یافت نشد', 404)
  const data = normalizePaidInput(input)
  const row = await db.paidItem.upsert({ where: { ownerType_ownerId: { ownerType, ownerId } }, create: { ownerType, ownerId, ...data }, update: data })
  return adminItem(row)
}

export async function removePaidItem(ownerType: OwnerType, ownerId: number) {
  await db.paidItem.deleteMany({ where: { ownerType, ownerId } })
}

/** The paid content dashboard: KPIs, every priced item and recent sales. */
export async function paywallOverview(input: { type?: string; q?: string } = {}) {
  const since = new Date(Date.now() - 30 * 86_400_000)
  const [items, recent, sales30, buyers] = await Promise.all([
    db.paidItem.findMany({ where: input.type && OWNER_TYPES.includes(input.type as OwnerType) ? { ownerType: input.type } : {}, orderBy: [{ sales: 'desc' }, { updatedAt: 'desc' }], take: 500 }),
    db.contentPurchase.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }),
    db.contentPurchase.findMany({ where: { createdAt: { gte: since }, source: 'PURCHASE', revokedAt: null }, select: { paidMinor: true, currency: true } }),
    db.contentPurchase.groupBy({ by: ['userId'], where: { revokedAt: null } }).then((rows) => rows.length).catch(() => 0),
  ])
  const owners = await ownerRows([...items, ...recent])
  const users = await db.user.findMany({ where: { id: { in: [...new Set(recent.map((row) => row.userId))] } }, select: { id: true, name: true, email: true, phone: true } })
  const byUser = new Map(users.map((user) => [user.id, user]))
  const needle = String(input.q || '').trim().toLocaleLowerCase()
  const revenue = new Map<string, bigint>()
  for (const row of sales30) revenue.set(row.currency, (revenue.get(row.currency) || 0n) + row.paidMinor)
  return {
    enabled: await paywallEnabled(),
    kpis: {
      items: items.filter((row) => row.active).length,
      sales30: sales30.length,
      revenue30: [...revenue].map(([currency, minor]) => formatPrice(minor, currency)).join(' + ') || '—',
      buyers,
    },
    items: items.map((row) => ({ ...adminItem(row), owner: owners.get(`${row.ownerType}:${row.ownerId}`) || null }))
      .filter((row) => !needle || (row.owner?.title || '').toLocaleLowerCase().includes(needle)),
    recent: recent.map((row) => {
      const user = byUser.get(row.userId)
      return {
        id: row.id, userId: row.userId, user: user?.name || user?.email || user?.phone || `#${row.userId}`, source: row.source, revoked: !!row.revokedAt,
        paid: row.source === 'ADMIN' ? 'هدیه' : formatPrice(row.paidMinor, row.currency), createdAt: row.createdAt.toISOString(), orderId: row.orderId,
        owner: owners.get(`${row.ownerType}:${row.ownerId}`) || null, ownerType: row.ownerType,
      }
    }),
  }
}

/** Admin gives (or takes back) access for one user. */
export async function adminGrant(input: { user: string; key: { ownerType: OwnerType; ownerId: number }; note?: string }) {
  const text = String(input.user || '').trim()
  const user = await db.user.findFirst({ where: /^\d+$/.test(text) ? { id: Number(text) } : { OR: [{ email: text.toLowerCase() }, { phone: text }] }, select: { id: true } })
  if (!user) throw new PaywallError('کاربر پیدا نشد (شناسه، ایمیل یا موبایل)', 404)
  if (!(await ownerRows([input.key])).size) throw new PaywallError('این مورد یافت نشد', 404)
  const created = await grantContent({ userId: user.id, ...input.key, source: 'ADMIN', note: input.note })
  if (!created) throw new PaywallError('این کاربر از قبل به این مورد دسترسی دارد', 409)
  return user.id
}

export async function revokePurchase(id: number) {
  const row = await db.contentPurchase.update({ where: { id }, data: { revokedAt: new Date() } })
  return row.id
}
