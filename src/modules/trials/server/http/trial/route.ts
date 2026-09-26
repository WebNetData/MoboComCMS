import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { requireUser } from '@/modules/identity/server/access'
import { claimTrial, trialPolicy } from '@/modules/trials/server/trials'
import { rateLimitHit, clientIp } from '@/platform/http/rate-limit'

export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  const [policy, claim] = await Promise.all([trialPolicy(), user ? db.trialClaim.findUnique({ where: { userId: user.id }, select: { status: true, subscriptionId: true, createdAt: true } }) : null])
  return ok({ enabled: policy.enabled, days: policy.days, trafficGB: policy.trafficGB, deviceLimit: policy.deviceLimit, claimed: Boolean(claim), claim })
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return err('sign in to start a trial', 401)
  if (!rateLimitHit(`trial:${clientIp(req.headers)}:${user.id}`, 5, 60 * 60_000).ok) return err('too many requests', 429)
  const result = await claimTrial(user.id)
  if (!result.ok) return err(result.code, result.status, { code: result.code })
  return ok({ status: result.claim?.status || 'PENDING', subscriptionId: result.claim?.subscriptionId || null, alreadyClaimed: result.alreadyClaimed })
}
