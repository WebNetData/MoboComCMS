import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { requirePerm } from '@/modules/identity/server/access'
import { trialPolicy, validTrialPolicy } from '@/modules/trials/server/trials'
import { auditAdmin } from '@/platform/audit/server'

export async function GET(req: NextRequest) {
  if (!await requirePerm(req, 'plans.manage')) return err('forbidden', 403)
  const [policy, plans, claims] = await Promise.all([trialPolicy(), db.plan.findMany({ where: { active: true }, select: { id: true, name: true, nameEn: true, days: true, trafficGB: true, deviceLimit: true, panel: { select: { active: true } } }, orderBy: { sort: 'asc' } }), db.trialClaim.groupBy({ by: ['status'], _count: { _all: true } })])
  return ok({ policy, plans, claims })
}

export async function PATCH(req: NextRequest) {
  const admin = await requirePerm(req, 'plans.manage')
  if (!admin) return err('forbidden', 403)
  const body = await req.json().catch(() => null)
  const policy = { enabled: body?.enabled === true, planId: Number(body?.planId), days: Number(body?.days), trafficGB: Number(body?.trafficGB), deviceLimit: Number(body?.deviceLimit) }
  if (!validTrialPolicy(policy) || !Number.isSafeInteger(policy.planId) || policy.planId <= 0) return err('invalid trial policy')
  const plan = await db.plan.findUnique({ where: { id: policy.planId }, include: { panel: true } })
  if (!plan?.active || !plan.panel?.active || (plan.days > 0 && plan.days < policy.days) || (plan.trafficGB > 0 && plan.trafficGB < policy.trafficGB) || (plan.deviceLimit > 0 && plan.deviceLimit < policy.deviceLimit)) return err('choose an active plan that supports the trial limits')
  await db.$transaction(Object.entries({ 'trial.enabled': String(policy.enabled), 'trial.planId': String(policy.planId), 'trial.days': String(policy.days), 'trial.trafficGB': String(policy.trafficGB), 'trial.deviceLimit': String(policy.deviceLimit) }).map(([key, value]) => db.setting.upsert({ where: { key }, create: { key, value }, update: { value } })))
  await auditAdmin({ req, actor: admin, action: 'trial.policy.update', targetType: 'setting', targetId: 0, metadata: policy })
  return ok({ policy })
}
