import { db } from '@/platform/database/prisma'
import { userOpensSection } from '@/modules/account/server/section-access'
import { enqueueFulfillment, processFulfillmentJob } from '@/modules/fulfillment/server/jobs'

export async function trialPolicy() {
  const rows = await db.setting.findMany({ where: { key: { in: ['trial.enabled', 'trial.planId', 'trial.days', 'trial.trafficGB', 'trial.deviceLimit'] } } })
  const values = Object.fromEntries(rows.map(row => [row.key, row.value]))
  return {
    enabled: values['trial.enabled'] === 'true',
    planId: Number(values['trial.planId'] || 0),
    days: Number(values['trial.days'] || 1),
    trafficGB: Number(values['trial.trafficGB'] || 1),
    deviceLimit: Number(values['trial.deviceLimit'] || 1),
  }
}

export function validTrialPolicy(value: { days: number; trafficGB: number; deviceLimit: number }) {
  return Number.isSafeInteger(value.days) && value.days >= 1 && value.days <= 30 && Number.isFinite(value.trafficGB) && value.trafficGB >= 0.1 && value.trafficGB <= 100 && Number.isSafeInteger(value.deviceLimit) && value.deviceLimit >= 1 && value.deviceLimit <= 10
}

export async function claimTrial(userId: number) {
  if (!await userOpensSection('vpn', userId)) return { ok: false as const, status: 403, code: 'VPN_FORBIDDEN' }
  const policy = await trialPolicy()
  if (!policy.enabled || !validTrialPolicy(policy)) return { ok: false as const, status: 403, code: 'TRIAL_DISABLED' }
  const plan = await db.plan.findUnique({ where: { id: policy.planId }, include: { panel: true } })
  if (!plan?.active || !plan.panel?.active || (plan.days > 0 && plan.days < policy.days) || (plan.trafficGB > 0 && plan.trafficGB < policy.trafficGB) || (plan.deviceLimit > 0 && plan.deviceLimit < policy.deviceLimit)) return { ok: false as const, status: 503, code: 'TRIAL_PLAN_UNAVAILABLE' }

  let claim = await db.trialClaim.findUnique({ where: { userId } })
  if (!claim) {
    try {
      claim = await db.$transaction(async tx => {
        const order = await tx.order.create({ data: { userId, planId: plan.id, totalAmount: 0, totalMinor: 0n, currency: plan.currency, idempotencyKey: `trial:user:${userId}`, status: 'PAID', provider: 'TRIAL', meta: JSON.stringify({ kind: 'trial', trafficGB: policy.trafficGB, days: policy.days, deviceLimit: policy.deviceLimit }) } })
        return tx.trialClaim.create({ data: { userId, planId: plan.id, orderId: order.id } })
      })
    } catch {
      claim = await db.trialClaim.findUnique({ where: { userId } })
      if (!claim) throw Error('trial claim could not be created')
    }
  }
  const job = await enqueueFulfillment({ kind: 'TRIAL_PROVISION', dedupeKey: `TRIAL_PROVISION:user:${userId}`, orderId: claim.orderId, payload: { userId, trialClaimId: claim.id } })
  if (claim.status !== 'ACTIVE') await processFulfillmentJob(job.id)
  const current = await db.trialClaim.findUnique({ where: { userId } })
  return { ok: true as const, claim: current, alreadyClaimed: claim.createdAt.getTime() !== current?.createdAt.getTime() || claim.status === 'ACTIVE' }
}
