import { randomBytes } from 'crypto'
import { db } from '@/platform/database/prisma'
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

/** A reward is issued once, after the referred account's first real paid invoice. */
export async function awardReferralForInvoice(invoiceId: number) {
  const invoice = await db.invoice.findUnique({ where: { id: invoiceId }, select: { id: true, userId: true, orderId: true, status: true, kind: true, totalMinor: true, currency: true } })
  if (!invoice || invoice.status !== 'PAID' || invoice.kind !== 'BILLING' || invoice.totalMinor <= 0n || !invoice.orderId) return
  const attribution = await db.referralAttribution.findUnique({ where: { referredUserId: invoice.userId } })
  if (!attribution || attribution.rewardedAt || attribution.referrerUserId === invoice.userId) return
  const prior = await db.invoice.findFirst({ where: { userId: invoice.userId, status: 'PAID', kind: 'BILLING', totalMinor: { gt: 0n }, paidAt: { lt: new Date() } }, orderBy: { paidAt: 'asc' }, select: { id: true } })
  // An attribution belongs to the first settled purchase only. The idempotent
  // wallet key prevents concurrent gateway callbacks from paying it twice.
  if (prior && prior.id !== invoice.id) return
  const rewardMinor = invoice.totalMinor * BigInt(attribution.rewardBps) / 10_000n
  if (rewardMinor <= 0n) return
  const currency = normalizeCurrency(invoice.currency)
  const credit = await moveWallet({ userId: attribution.referrerUserId, amount: legacyNumber(rewardMinor, currency), currency, type: 'REFERRAL', description: `Referral reward for invoice #${invoice.id}`, idempotencyKey: `referral:attribution:${attribution.id}` })
  if (!credit.ok) throw Error(credit.message || 'referral credit failed')
  await db.referralAttribution.updateMany({ where: { id: attribution.id, rewardedAt: null }, data: { rewardOrderId: invoice.orderId, rewardMinor, rewardCurrency: currency, rewardedAt: new Date() } })
}
