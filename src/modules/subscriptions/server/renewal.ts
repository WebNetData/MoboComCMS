import { randomUUID } from 'node:crypto'
import { db } from '@/platform/database/prisma'
import { getPanelAdapter } from '@/modules/providers/server/panels'
import { renewalTarget } from '@/modules/subscriptions/domain/renewal'

/** Serialize paid renewals per subscription and persist absolute targets before panel I/O. */
export async function applyPaidRenewal(job: { id: number; subscriptionId: number | null; payload: string }) {
  const payload = JSON.parse(job.payload || '{}')
  const subId = Number(job.subscriptionId || payload.subscriptionId)
  if (!subId) throw new Error('renewal subscription is missing')
  if (payload.applied === true) return subId
  const key = `subscription.renewal-lock.${subId}`
  const lock = JSON.stringify({ token: randomUUID(), at: Date.now() })
  let acquired = false
  try {
    try { await db.setting.create({ data: { key, value: lock } }); acquired = true }
    catch (e: any) {
      if (e?.code !== 'P2002') throw e
      const current = await db.setting.findUnique({ where: { key } })
      let at = Date.now()
      try { at = JSON.parse(current?.value || '{}').at || at } catch {}
      if (current && at < Date.now() - 10 * 60_000) {
        acquired = (await db.setting.updateMany({ where: { key, value: current.value }, data: { value: lock } })).count === 1
      }
    }
    if (!acquired) throw new Error('another renewal is processing; retry later')
    const earlier = await db.fulfillmentJob.findFirst({ where: { kind: 'RENEW_SUBSCRIPTION', subscriptionId: subId, id: { lt: job.id }, status: { not: 'DONE' } }, orderBy: { id: 'asc' } })
    if (earlier) throw new Error('an earlier paid renewal must finish first')
    const sub = await db.subscription.findUnique({ where: { id: subId }, include: { panel: true, plan: { include: { panel: true } } } })
    if (!sub) throw new Error('subscription not found')
    const panel = sub.panel || sub.plan.panel
    const adapter = panel && getPanelAdapter(panel)
    if (!adapter) throw new Error('panel adapter unavailable')

    if (!payload.target) {
      // Old jobs may already have been applied before this additive implementation.
      if (!payload.renewalVersion && payload.targetExpiresAt && sub.expiresAt.getTime() >= new Date(payload.targetExpiresAt).getTime() - 1000) return subId
      const current = await adapter.getUser(sub.username)
      if (!current.ok || !current.user) throw new Error(current.message || 'cannot read current allowance')
      payload.target = renewalTarget({
        now: Date.now(), localExpiresAt: sub.expiresAt.getTime(), panelExpiresAt: current.user.expiresAt?.getTime() ?? null,
        localLimitGB: sub.trafficLimit, panelLimitGB: current.user.trafficLimit / 1024 ** 3,
        days: Number(payload.days ?? sub.plan.days), trafficGB: Number(payload.trafficGB ?? sub.plan.trafficGB),
      })
      // Retries must use the same absolute target, even if the panel succeeded but the DB did not.
      await db.fulfillmentJob.update({ where: { id: job.id }, data: { payload: JSON.stringify(payload) } })
    }
    const expiresAt = new Date(payload.target.expiresAt)
    const trafficLimit = Number(payload.target.trafficLimitGB)
    if (!Number.isFinite(expiresAt.getTime()) || !Number.isFinite(trafficLimit) || trafficLimit < 0) throw new Error('invalid persisted renewal target')
    const result = await adapter.updateUser(sub.username, { expiresAt, trafficGB: trafficLimit, disabled: false })
    if (!result.ok) throw new Error(result.message || 'panel rejected renewal')
    const verified = result.user || (await adapter.getUser(sub.username)).user
    if (!verified || !verified.expiresAt || verified.expiresAt.getTime() < expiresAt.getTime() - 1000
      || (trafficLimit === 0 ? verified.trafficLimit !== 0 : verified.trafficLimit < Math.round(trafficLimit * 1024 ** 3) - 1)) throw new Error('panel has not confirmed the renewed allowance')
    await db.$transaction(async tx => {
      await tx.subscription.update({ where: { id: sub.id }, data: {
        expiresAt: verified.expiresAt!, trafficLimit: verified.trafficLimit / 1024 ** 3,
        trafficUsed: verified.trafficUsed / 1024 ** 3, status: 'ACTIVE',
        panelSubUrl: verified.subUrl || sub.panelSubUrl, lastSyncAt: new Date(),
      } })
      await tx.fulfillmentJob.update({ where: { id: job.id }, data: { payload: JSON.stringify({ ...payload, applied: true }) } })
    })
    return subId
  } finally {
    if (acquired) await db.setting.deleteMany({ where: { key, value: lock } })
  }
}
