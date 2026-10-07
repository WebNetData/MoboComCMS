import { randomInt } from 'node:crypto'
import { db } from '@/platform/database/prisma'
import { logEvent } from '@/platform/observability/logger'
import { moveWallet } from '@/modules/wallet/server/wallet'
import { MarketingError, pointsFor, redeemValue, reversalPoints, tierFor, tomanOf, type LoyaltySettings } from '@/modules/store/domain/marketing'
import { getLoyaltySettings, notify, positive } from '@/modules/store/server/marketing/core'
import { cleanText } from '@/modules/store/server/marketing/gift-cards'
import { runStockAlerts } from '@/modules/store/server/marketing/back-in-stock'
import { runCartRecovery } from '@/modules/store/server/marketing/abandoned-carts'

/** Adds a ledger entry once per key and keeps the account totals in step. */
async function addPoints(userId: number, points: number, kind: string, key: string, note: string, orderId: number | null = null) {
  if (!points) return null
  try {
    return await db.$transaction(async (tx) => {
      const entry = await tx.loyaltyEntry.create({ data: { userId, points, kind, note: note.slice(0, 200), orderId, idempotencyKey: key } })
      const earned = points > 0 && (kind === 'EARN_ORDER' || kind === 'BONUS')
      await tx.loyaltyAccount.upsert({ where: { userId }, create: { userId, balance: points, lifetime: earned ? points : 0 }, update: { balance: { increment: points }, ...(earned ? { lifetime: { increment: points } } : kind === 'REVERSE_ORDER' ? { lifetime: { increment: points } } : {}) } })
      return entry
    })
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002') return null // already recorded
    throw error
  }
}

async function tierOf(settings: LoyaltySettings, userId: number) {
  const account = await db.loyaltyAccount.findUnique({ where: { userId } })
  return { account, ...tierFor(settings, account?.lifetime || 0) }
}

async function signupBonus(settings: LoyaltySettings, userId: number) {
  if (!settings.enabled || !settings.signupBonus || !settings.since) return
  const user = await db.user.findUnique({ where: { id: userId }, select: { createdAt: true } })
  if (user && user.createdAt >= new Date(settings.since)) await addPoints(userId, settings.signupBonus, 'BONUS', `signup:${userId}`, 'هدیهٔ عضویت در باشگاه')
}

/**
 * Points for every paid order since the club started (idempotent per order).
 * The recent orders are read in id pages, so orders that already have their
 * points never hide the ones that do not; one failing order does not stop the rest.
 */
export async function runLoyaltyAwards(now = new Date(), limit = 500) {
  const settings = await getLoyaltySettings()
  if (!settings.enabled || !settings.since) return { awarded: 0 }
  const where = { status: { in: ['PAID', 'COMPLETED'] }, createdAt: { gte: new Date(settings.since) }, updatedAt: { gte: new Date(now.getTime() - 3 * 86_400_000) } }
  let awarded = 0
  for (let after = 0, handled = 0; handled < limit;) {
    const orders = await db.order.findMany({ where: { ...where, id: { gt: after } }, select: { id: true, userId: true, totalMinor: true, currency: true, meta: true }, orderBy: { id: 'asc' }, take: 500 })
    if (!orders.length) break
    after = orders[orders.length - 1].id
    const done = new Set((await db.loyaltyEntry.findMany({ where: { orderId: { in: orders.map((order) => order.id) }, kind: 'EARN_ORDER' }, select: { orderId: true } })).map((row) => row.orderId))
    for (const order of orders) {
      if (done.has(order.id)) continue
      if (handled++ >= limit) break
      try {
        if (await awardOrder(settings, order)) awarded++
      } catch (error) {
        logEvent('warn', 'store.loyalty_award_failed', { orderId: order.id, error: String(error) })
      }
    }
  }
  return { awarded }
}

async function awardOrder(settings: LoyaltySettings, order: { id: number; userId: number; totalMinor: bigint; currency: string; meta: string | null }) {
  let shipping = 0n
  try { shipping = BigInt(JSON.parse(order.meta || '{}').shippingMinor || 0) } catch { shipping = 0n }
  const before = await tierOf(settings, order.userId)
  const points = pointsFor(settings, tomanOf(order.totalMinor - shipping, order.currency), before.tier.multiplier)
  // Zero-point orders still get a row, so they are not looked at again.
  const entry = points > 0
    ? await addPoints(order.userId, points, 'EARN_ORDER', `order:${order.id}`, `خرید سفارش #${order.id}`, order.id)
    : await db.loyaltyEntry.create({ data: { userId: order.userId, points: 0, kind: 'EARN_ORDER', note: `سفارش #${order.id}`, orderId: order.id, idempotencyKey: `order:${order.id}` } }).catch(() => null)
  if (!entry || points <= 0) return false
  await signupBonus(settings, order.userId)
  const after = await tierOf(settings, order.userId)
  const upgraded = after.tier.id !== before.tier.id
  await notify({
    userId: order.userId, kind: 'LOYALTY', dedupeKey: `loyalty:order:${order.id}`,
    titleFa: upgraded ? `تبریک! به سطح ${after.tier.name} باشگاه مشتریان رسیدید` : `${points.toLocaleString('fa-IR')} امتیاز باشگاه مشتریان گرفتید`,
    titleEn: upgraded ? `You reached ${after.tier.name}` : `You earned ${points} points`,
    bodyFa: `بابت سفارش #${order.id}. موجودی امتیاز: ${(after.account?.balance || 0).toLocaleString('fa-IR')}`, bodyEn: '', href: '/dashboard/club',
  })
  return true
}

/** Takes back the points of a refunded part of an order (cancellation or return). */
export async function reverseOrderPoints(orderId: number, refundedMinor: bigint, key: string) {
  const order = await db.order.findUnique({ where: { id: orderId }, select: { userId: true, totalMinor: true } })
  if (!order) return
  const idempotencyKey = `order:${orderId}:reverse:${key}`
  try {
    await db.$transaction(async (tx) => {
      // Take the member's account row first: a second refund of the same order waits here and then
      // reads the first one's reversal, so two refunds together never take back more than was earned.
      await tx.loyaltyAccount.updateMany({ where: { userId: order.userId }, data: { balance: { increment: 0 } } })
      const entries = await tx.loyaltyEntry.findMany({ where: { orderId }, select: { points: true, kind: true } })
      const earned = entries.filter((row) => row.kind === 'EARN_ORDER').reduce((sum, row) => sum + row.points, 0)
      const reversed = -entries.filter((row) => row.kind === 'REVERSE_ORDER').reduce((sum, row) => sum + row.points, 0)
      const points = Math.min(earned - reversed, reversalPoints(earned, refundedMinor, order.totalMinor))
      if (points <= 0) return
      await tx.loyaltyEntry.create({ data: { userId: order.userId, points: -points, kind: 'REVERSE_ORDER', note: `برگشت امتیاز سفارش #${orderId}`, orderId, idempotencyKey } })
      await tx.loyaltyAccount.update({ where: { userId: order.userId }, data: { balance: { decrement: points }, lifetime: { decrement: points } } })
    })
  } catch (error) {
    if ((error as { code?: string }).code !== 'P2002') throw error // this refund's reversal is already recorded
  }
}

export async function awardReviewBonus(userId: number, reviewId: number) {
  const settings = await getLoyaltySettings()
  if (settings.enabled && settings.reviewBonus) await addPoints(userId, settings.reviewBonus, 'BONUS', `review:${reviewId}`, 'امتیاز ثبت نظر')
}

export async function loyaltyOverview(userId: number) {
  const settings = await getLoyaltySettings()
  if (settings.enabled) await signupBonus(settings, userId)
  const { account, tier, next, toNext } = await tierOf(settings, userId)
  const history = await db.loyaltyEntry.findMany({ where: { userId, points: { not: 0 } }, orderBy: { id: 'desc' }, take: 40 })
  const balance = account?.balance || 0
  return {
    enabled: settings.enabled, balance, lifetime: account?.lifetime || 0, tier, next, toNext, tiers: settings.tiers,
    rules: { earnPoints: settings.earnPoints, earnStepToman: settings.earnStepToman, pointValueToman: settings.pointValueToman, minRedeem: settings.minRedeem, signupBonus: settings.signupBonus, reviewBonus: settings.reviewBonus },
    balanceValue: Number(redeemValue(settings, balance)),
    history: history.map((row) => ({ id: row.id, points: row.points, kind: row.kind, note: row.note, createdAt: row.createdAt })),
  }
}

/** Turns points into wallet credit. */
export async function redeemPoints(userId: number, pointsInput: unknown) {
  const settings = await getLoyaltySettings()
  if (!settings.enabled || !settings.pointValueToman) throw new MarketingError('تبدیل امتیاز در حال حاضر فعال نیست', 403)
  const points = Math.floor(Number(pointsInput))
  if (!Number.isSafeInteger(points) || points < settings.minRedeem) throw new MarketingError(`حداقل ${settings.minRedeem.toLocaleString('fa-IR')} امتیاز قابل تبدیل است`)
  const entry = await db.$transaction(async (tx) => {
    const taken = await tx.loyaltyAccount.updateMany({ where: { userId, balance: { gte: points } }, data: { balance: { decrement: points } } })
    if (!taken.count) throw new MarketingError('امتیاز کافی ندارید', 409)
    return tx.loyaltyEntry.create({ data: { userId, points: -points, kind: 'REDEEM', note: 'تبدیل به اعتبار کیف پول', idempotencyKey: `redeem:${userId}:${Date.now()}:${randomInt(1_000_000)}` } })
  })
  const toman = Number(redeemValue(settings, points))
  const credit = await moveWallet({ userId, amount: toman, currency: 'IRT', type: 'LOYALTY', description: `تبدیل ${points.toLocaleString('fa-IR')} امتیاز باشگاه`, idempotencyKey: `loyalty:redeem:${entry.id}` })
  if (!credit.ok) {
    await addPoints(userId, points, 'ADMIN', `redeem-undo:${entry.id}`, 'برگشت تبدیل ناموفق')
    throw new MarketingError('شارژ کیف پول انجام نشد؛ امتیاز برگشت داده شد', 500)
  }
  return { points, toman, balance: credit.balance }
}

/**
 * Finishes point redemptions that took the points but never reached the wallet (the process
 * stopped between the two). Looks at redemptions of the last week that are at least ten minutes
 * old, so a request still in flight is left to finish or undo itself. The wallet credit is keyed
 * by the ledger entry, so nothing is ever paid twice; a redemption that was undone is skipped.
 * When points no longer have a wallet value, they are given back instead.
 */
export async function recoverPointRedemptions(now = new Date()) {
  const settings = await getLoyaltySettings()
  const counters = { checked: 0, credited: 0, returned: 0, failed: 0 }
  const window = { gte: new Date(now.getTime() - 7 * 86_400_000), lte: new Date(now.getTime() - 10 * 60_000) }
  for (let after = 0, pages = 0; pages < 4; pages++) {
    const rows = await db.loyaltyEntry.findMany({ where: { kind: 'REDEEM', createdAt: window, id: { gt: after } }, orderBy: { id: 'asc' }, take: 500, select: { id: true, userId: true, points: true } })
    if (!rows.length) break
    after = rows[rows.length - 1].id
    const [paid, undone] = await Promise.all([
      db.walletTx.findMany({ where: { idempotencyKey: { in: rows.map((row) => `loyalty:redeem:${row.id}`) }, status: 'DONE' }, select: { idempotencyKey: true } }),
      db.loyaltyEntry.findMany({ where: { idempotencyKey: { in: rows.map((row) => `redeem-undo:${row.id}`) } }, select: { idempotencyKey: true } }),
    ])
    const settled = new Set([...paid.map((row) => String(row.idempotencyKey).replace('loyalty:redeem:', '')), ...undone.map((row) => row.idempotencyKey.replace('redeem-undo:', ''))])
    for (const row of rows) {
      if (settled.has(String(row.id)) || row.points >= 0) continue
      counters.checked++
      try {
        const points = -row.points
        const toman = Number(redeemValue(settings, points))
        if (toman > 0) {
          const credit = await moveWallet({ userId: row.userId, amount: toman, currency: 'IRT', type: 'LOYALTY', description: `تبدیل ${points.toLocaleString('fa-IR')} امتیاز باشگاه`, idempotencyKey: `loyalty:redeem:${row.id}` })
          if (!credit.ok) throw new Error(credit.message || 'wallet credit failed')
          counters.credited++
        } else if (await addPoints(row.userId, points, 'ADMIN', `redeem-undo:${row.id}`, 'برگشت تبدیل ناموفق')) counters.returned++
      } catch (error) {
        counters.failed++
        logEvent('error', 'store.point_redemption_recovery_failed', { entryId: row.id, error: String(error) })
      }
    }
    if (rows.length < 500) break
  }
  return counters
}

export async function adjustPoints(userIdInput: unknown, pointsInput: unknown, noteInput: unknown, adminId: number) {
  const userId = positive(userIdInput)
  const points = Math.round(Number(pointsInput))
  if (!userId || !Number.isSafeInteger(points) || !points || Math.abs(points) > 10_000_000) throw new MarketingError('کاربر یا مقدار امتیاز معتبر نیست')
  if (!await db.user.count({ where: { id: userId } })) throw new MarketingError('کاربر پیدا نشد', 404)
  await addPoints(userId, points, 'ADMIN', `admin:${adminId}:${Date.now()}:${randomInt(1_000_000)}`, cleanText(noteInput, 160) || 'تنظیم دستی مدیر')
  return (await db.loyaltyAccount.findUnique({ where: { userId } }))?.balance || 0
}

export async function adminLoyalty() {
  const settings = await getLoyaltySettings()
  const [members, totals, top, recent] = await Promise.all([
    db.loyaltyAccount.count(),
    db.loyaltyAccount.aggregate({ _sum: { balance: true, lifetime: true } }),
    db.loyaltyAccount.findMany({ orderBy: { lifetime: 'desc' }, take: 20 }),
    db.loyaltyEntry.findMany({ where: { points: { not: 0 } }, orderBy: { id: 'desc' }, take: 30 }),
  ])
  const users = await db.user.findMany({ where: { id: { in: [...new Set([...top.map((row) => row.userId), ...recent.map((row) => row.userId)])] } }, select: { id: true, name: true, email: true } })
  const name = (id: number) => { const user = users.find((row) => row.id === id); return user ? user.name || user.email : `#${id}` }
  const tierCounts = settings.tiers.map((tier, index) => ({ ...tier, count: 0, next: settings.tiers[index + 1]?.minLifetime ?? null }))
  for (const tier of tierCounts) tier.count = await db.loyaltyAccount.count({ where: { lifetime: { gte: tier.minLifetime, ...(tier.next !== null ? { lt: tier.next } : {}) } } })
  return {
    settings, members, outstanding: totals._sum.balance || 0, lifetime: totals._sum.lifetime || 0, outstandingValue: Number(redeemValue(settings, totals._sum.balance || 0)),
    tiers: tierCounts,
    top: top.map((row) => ({ userId: row.userId, name: name(row.userId), balance: row.balance, lifetime: row.lifetime, tier: tierFor(settings, row.lifetime).tier.name })),
    recent: recent.map((row) => ({ id: row.id, userId: row.userId, name: name(row.userId), points: row.points, kind: row.kind, note: row.note, createdAt: row.createdAt })),
  }
}

/** Every minute from the job scheduler. */
export async function runMarketingJobs() {
  const results = await Promise.allSettled([runStockAlerts(), runCartRecovery(), runLoyaltyAwards(), recoverPointRedemptions()])
  for (const result of results) if (result.status === 'rejected') logEvent('error', 'store.marketing_job_failed', { error: String(result.reason) })
  return results.map((result) => (result.status === 'fulfilled' ? result.value : null))
}
