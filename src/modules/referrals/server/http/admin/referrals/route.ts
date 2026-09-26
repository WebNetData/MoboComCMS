import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { requirePerm } from '@/modules/identity/server/access'
import { auditAdmin } from '@/platform/audit/server'
import { awardReferralForInvoice, referralPolicy } from '@/modules/referrals/server/referrals'

export async function GET(req: NextRequest) {
  if (!await requirePerm(req, 'settings.manage')) return err('forbidden', 403)
  const [policy, total, rewarded, recent] = await Promise.all([referralPolicy(), db.referralAttribution.count(), db.referralAttribution.count({ where: { rewardedAt: { not: null } } }), db.referralAttribution.findMany({ orderBy: { id: 'desc' }, take: 30, select: { id: true, code: true, referredUserId: true, referrerUserId: true, rewardedAt: true, createdAt: true } })])
  return ok({ policy, total, rewarded, recent })
}

export async function PATCH(req: NextRequest) {
  const admin = await requirePerm(req, 'settings.manage')
  if (!admin) return err('forbidden', 403)
  const body = await req.json().catch(() => null)
  const percent = Number(body?.rewardPercent)
  if (!Number.isFinite(percent) || percent < 0 || percent > 20) return err('reward percent must be between 0 and 20')
  const enabled = body?.enabled === true
  await db.$transaction([
    db.setting.upsert({ where: { key: 'referral.enabled' }, create: { key: 'referral.enabled', value: String(enabled) }, update: { value: String(enabled) } }),
    db.setting.upsert({ where: { key: 'referral.rewardBps' }, create: { key: 'referral.rewardBps', value: String(Math.round(percent * 100)) }, update: { value: String(Math.round(percent * 100)) } }),
  ])
  await auditAdmin({ req, actor: admin, action: 'referral.policy.update', targetType: 'setting', targetId: 0, metadata: { enabled, rewardPercent: percent } })
  return ok({ enabled, rewardPercent: percent })
}

export async function POST(req: NextRequest) {
  const admin = await requirePerm(req, 'finance.manage')
  if (!admin) return err('forbidden', 403)
  const pending = await db.referralAttribution.findMany({ where: { rewardedAt: null }, select: { referredUserId: true }, take: 100 })
  let paid = 0
  for (const row of pending) {
    const invoice = await db.invoice.findFirst({ where: { userId: row.referredUserId, status: 'PAID', kind: 'BILLING', totalMinor: { gt: 0n } }, orderBy: { paidAt: 'asc' }, select: { id: true } })
    if (!invoice) continue
    try { await awardReferralForInvoice(invoice.id); paid++ } catch {}
  }
  await auditAdmin({ req, actor: admin, action: 'referral.reconcile', targetType: 'referral', targetId: 0, metadata: { scanned: pending.length, attempted: paid } })
  return ok({ scanned: pending.length, attempted: paid })
}
