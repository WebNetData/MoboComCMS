import { randomBytes } from 'crypto'
import { db } from '@/platform/database/prisma'
import { logEvent } from '@/platform/observability/logger'
import { moveWallet } from '@/modules/wallet/server/wallet'
import { legacyNumber, normalizeCurrency } from '@/shared/money'

export const normalizeReferralCode = (value: unknown) => String(value || '').trim().toUpperCase()

export async function referralPolicy() {
  const rows = await db.setting.findMany({ where: { key: { in: ['referral.enabled', 'referral.rewardBps'] } } })
  const values = Object.fromEntries(rows.map(row => [row.key, row.value]))
  return { enabled: values['referral.enabled'] === 'true', rewardBps: Number(values['referral.rewardBps'] || 500) }
}

export async function ensureReferralCode(userId: number) {
  const existing = await db.referralCode.findUnique({ where: { ownerId: userId } })
  if (existing) return existing
  try { return await db.referralCode.create({ data: { ownerId: userId, code: `H${randomBytes(6).toString('hex').toUpperCase()}` } }) }
  catch {
    const current = await db.referralCode.findUnique({ where: { ownerId: userId } })
    if (current) return current
    throw Error('referral code could not be created')
  }
}

const paidPurchase = { status: 'PAID', kind: 'BILLING', totalMinor: { gt: 0n } } as const

type Attribution = { id: number; referredUserId: number; referrerUserId: number; rewardBps: number; rewardedAt: Date | null }

/**
 * Pays an attribution's reward if it is still owed. The reward always belongs to the referred
 * account's first settled purchase, whichever event brings us here, so an attempt that failed
 * or never ran at that purchase is made good later. The wallet key is the attribution's, so it
 * is paid once however often this runs.
 */
async function settleAttribution(attribution: Attribution): Promise<boolean> {
  if (attribution.rewardedAt || attribution.referrerUserId === attribution.referredUserId) return false
  const first = await db.invoice.findFirst({
    where: { userId: attribution.referredUserId, ...paidPurchase, paidAt: { lt: new Date() } },
    orderBy: [{ paidAt: 'asc' }, { id: 'asc' }], select: { id: true, orderId: true, totalMinor: true, currency: true },
  })
  // A first purchase without an order earns nothing, as before.
  if (!first?.orderId) return false
  const rewardMinor = first.totalMinor * BigInt(attribution.rewardBps) / 10_000n
  if (rewardMinor <= 0n) return false
  const currency = normalizeCurrency(first.currency)
  const credit = await moveWallet({ userId: attribution.referrerUserId, amount: legacyNumber(rewardMinor, currency), currency, type: 'REFERRAL', description: `Referral reward for invoice #${first.id}`, idempotencyKey: `referral:attribution:${attribution.id}` })
  if (!credit.ok) throw Error(credit.message || 'referral credit failed')
  await db.referralAttribution.updateMany({ where: { id: attribution.id, rewardedAt: null }, data: { rewardOrderId: first.orderId, rewardMinor, rewardCurrency: currency, rewardedAt: new Date() } })
  return !credit.idempotent
}

/** A reward is issued once, for the referred account's first real paid invoice. */
export async function awardReferralForInvoice(invoiceId: number) {
  const invoice = await db.invoice.findUnique({ where: { id: invoiceId }, select: { id: true, userId: true, orderId: true, status: true, kind: true, totalMinor: true, currency: true } })
  if (!invoice || invoice.status !== 'PAID' || invoice.kind !== 'BILLING' || invoice.totalMinor <= 0n || !invoice.orderId) return
  const attribution = await db.referralAttribution.findUnique({ where: { referredUserId: invoice.userId } })
  if (attribution) await settleAttribution(attribution)
}

/**
 * Worker step: rewards that were owed but not paid when the purchase settled (the attempt
 * failed, or the process stopped before it). Looks at accounts with a purchase paid in the last
 * days, not at every unrewarded attribution, so the many referred accounts that never bought
 * anything cost nothing. One attribution that fails does not stop the others.
 */
export async function recoverReferralRewards(days = 14) {
  const since = new Date(Date.now() - (Number(days) > 0 ? Number(days) : 14) * 86_400_000)
  const buyers = new Set<number>()
  for (let after = 0, pages = 0; pages < 4; pages++) {
    const page = await db.invoice.findMany({ where: { ...paidPurchase, paidAt: { gte: since }, id: { gt: after } }, orderBy: { id: 'asc' }, take: 500, select: { id: true, userId: true } })
    for (const row of page) buyers.add(row.userId)
    if (page.length < 500) break
    after = page[page.length - 1].id
  }
  if (!buyers.size) return { checked: 0, paid: 0, failed: 0 }
  let checked = 0
  let paid = 0
  let failed = 0
  // Every owed attribution among those buyers is looked at, in id pages: ones that can never be
  // paid (a first purchase without an order) must not hide the ones that can.
  for (let after = 0, pages = 0; pages < 10; pages++) {
    const owed = await db.referralAttribution.findMany({ where: { rewardedAt: null, referredUserId: { in: [...buyers] }, id: { gt: after } }, orderBy: { id: 'asc' }, take: 200 })
    for (const attribution of owed) {
      checked++
      try { if (await settleAttribution(attribution)) paid++ } catch (error) {
        failed++
        logEvent('error', 'referral.recovery_failed', { attributionId: attribution.id, message: error instanceof Error ? error.message : 'unknown' })
      }
    }
    if (owed.length < 200) break
    after = owed[owed.length - 1].id
  }
  return { checked, paid, failed }
}
