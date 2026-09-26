import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { requireUser } from '@/modules/identity/server/access'
import { ensureReferralCode, referralPolicy } from '@/modules/referrals/server/referrals'
import { legacyNumber } from '@/shared/money'
import { siteBaseUrl } from '@/modules/site/server/site-url'

export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return err('unauthorized', 401)
  const policy = await referralPolicy()
  if (!policy.enabled) return ok({ enabled: false })
  const [code, referrals] = await Promise.all([ensureReferralCode(user.id), db.referralAttribution.findMany({ where: { referrerUserId: user.id }, select: { id: true, rewardedAt: true, rewardMinor: true, rewardCurrency: true, createdAt: true }, orderBy: { id: 'desc' }, take: 100 })])
  const origin = await siteBaseUrl()
  return ok({ enabled: true, code: code.code, link: `${origin}/register?ref=${encodeURIComponent(code.code)}`, rewardPercent: policy.rewardBps / 100, referrals: referrals.map(row => ({ id: row.id, status: row.rewardedAt ? 'REWARDED' : 'PENDING', reward: legacyNumber(row.rewardMinor, row.rewardCurrency), currency: row.rewardCurrency, createdAt: row.createdAt })) })
}
