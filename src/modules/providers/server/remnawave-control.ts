import { randomUUID } from 'node:crypto'
import { db } from '@/platform/database/prisma'
import { getPanelAdapter, RemnaWaveAdapter } from '@/modules/providers/server/panels'
import { reconcileSubscription, safeRepairable } from '@/modules/providers/domain/remnawave-reconciliation'
import { getExtensionState } from '@/extensions/server/state'
import { logEvent } from '@/platform/observability/logger'
import { listFulfillmentOperations, retryPaidFulfillment } from '@/modules/fulfillment/server/operations'

const LOCK = 'remnawave.control.lock'
const LAST = 'remnawave.control.last-run'
const CURSOR = (id: number) => `remnawave.control.cursor.${id}`
const GB = 1024 ** 3

async function panelAdapter(panelId: number) {
  const panel = await db.panel.findUnique({ where: { id: panelId } })
  if (!panel || panel.type !== 'REMNAWAVE') throw new Error('RemnaWave panel not found')
  const adapter = getPanelAdapter(panel)
  if (!(adapter instanceof RemnaWaveAdapter)) throw new Error('RemnaWave adapter unavailable')
  return { panel, adapter }
}

export async function listRemnaPanels() {
  return db.panel.findMany({ where: { type: 'REMNAWAVE' }, select: { id: true, name: true, active: true }, orderBy: { id: 'asc' } })
}

export async function remnaPanelOverview(panelId: number) {
  const { panel, adapter } = await panelAdapter(panelId)
  const [health, subscriptions, lastRun] = await Promise.all([
    adapter.getHealth(),
    db.subscription.count({ where: { OR: [{ panelId }, { panelId: null, plan: { panelId } }] } }),
    db.setting.findUnique({ where: { key: LAST } }),
  ])
  let last: unknown = null
  try { last = lastRun ? JSON.parse(lastRun.value) : null } catch {}
  return { panel: { id: panel.id, name: panel.name, active: panel.active }, health, subscriptions, lastRun: last }
}

export async function repairRemnaSubscription(subscriptionId: number) {
  const pendingRenewal = await db.fulfillmentJob.findFirst({ where: { subscriptionId, kind: 'RENEW_SUBSCRIPTION', status: { not: 'DONE' } }, select: { id: true } })
  if (pendingRenewal) throw new Error('A paid renewal is still processing; repair is temporarily blocked')
  const sub = await db.subscription.findUnique({ where: { id: subscriptionId }, include: { panel: true, plan: { include: { panel: true } } } })
  if (!sub) throw new Error('Subscription not found')
  const panel = sub.panel || sub.plan.panel
  if (!panel || panel.type !== 'REMNAWAVE' || !panel.active) throw new Error('Active RemnaWave panel not found')
  const adapter = getPanelAdapter(panel)
  if (!(adapter instanceof RemnaWaveAdapter)) throw new Error('RemnaWave adapter unavailable')
  const live = await adapter.getUser(sub.username)
  if (!live.ok || !live.user) throw new Error(live.message || 'Panel user unavailable; automatic recreation is not allowed')
  const before = reconcileSubscription(sub, { found: true, ...live.user })
  const repairable = safeRepairable(before)
  if (repairable.includes('DISABLED_LEAK')) {
    const disabled = await adapter.updateUser(sub.username, { disabled: true })
    if (!disabled.ok) throw new Error(disabled.message || 'Could not disable remote account')
  }
  if (repairable.includes('SQUADS_MISSING')) {
    const repaired = await adapter.updateUser(sub.username, {})
    if (!repaired.ok) throw new Error(repaired.message || 'Could not restore internal squad')
  }
  const verified = await adapter.getUser(sub.username)
  if (!verified.ok || !verified.user) throw new Error('Could not verify repair')
  const after = reconcileSubscription(sub, { found: true, ...verified.user })
  const repaired = repairable.filter(issue => !after.includes(issue))
  logEvent('info', 'remnawave.safe_repair', { panelId: panel.id, subscriptionId, attempted: repairable, repaired })
  return { subscriptionId, before, after, repaired }
}

export async function scanRemnaPanel(panelId: number, cursor = 0, limit = 10, autoRepair = false) {
  const { panel, adapter } = await panelAdapter(panelId)
  const health = await adapter.getHealth()
  if (!health.ok) return { panelId, health, items: [], cursor, nextCursor: cursor, scanned: 0, repaired: 0, unavailable: true }
  const take = Math.max(1, Math.min(20, Math.floor(limit)))
  const subs = await db.subscription.findMany({
    where: { id: { gt: Math.max(0, cursor) }, OR: [{ panelId }, { panelId: null, plan: { panelId } }] },
    select: { id: true, username: true, userId: true, status: true, trafficLimit: true, trafficUsed: true, expiresAt: true, panelSubUrl: true, lastSyncAt: true },
    orderBy: { id: 'asc' }, take,
  })
  const items = []
  let repaired = 0
  for (const sub of subs) {
    const live = await adapter.getUser(sub.username)
    const remote = live.ok && live.user ? live.user : null
    const issues = reconcileSubscription(sub, remote ? { found: true, ...remote } : { found: false, error: live.message !== 'not found' })
    let repairResult: string[] = []
    if (autoRepair && safeRepairable(issues).length) {
      try { repairResult = (await repairRemnaSubscription(sub.id)).repaired; repaired += repairResult.length }
      catch { /* keep original diagnosis for an operator; never guess about quota or expiry */ }
    }
    items.push({
      id: sub.id, username: sub.username, status: sub.status, issues, repaired: repairResult,
      local: { trafficUsedGB: sub.trafficUsed, trafficLimitGB: sub.trafficLimit, expiresAt: sub.expiresAt, lastSyncAt: sub.lastSyncAt },
      remote: remote ? { status: remote.status, trafficUsedGB: Math.round(remote.trafficUsed / GB * 100) / 100, trafficLimitGB: Math.round(remote.trafficLimit / GB * 100) / 100, expiresAt: remote.expiresAt, squads: remote.squads?.length ?? null, lastOpenedAt: remote.lastOpenedAt || null, lastUserAgent: remote.lastUserAgent || null, lifetimeUsedGB: remote.lifetimeTrafficUsed == null ? null : Math.round(remote.lifetimeTrafficUsed / GB * 100) / 100, deviceLimit: remote.deviceLimit ?? null } : null,
    })
  }
  return { panelId: panel.id, health, items, cursor, nextCursor: subs.at(-1)?.id || 0, scanned: items.length, repaired, unavailable: false }
}

export async function remnaProvisioningQueue(panelId: number) {
  await panelAdapter(panelId)
  const orders = await db.order.findMany({ where: { plan: { panelId }, invoice: { status: 'PAID' } }, select: { id: true }, orderBy: { updatedAt: 'desc' }, take: 200 })
  const ids = new Set(orders.map(order => order.id))
  const queue = await listFulfillmentOperations()
  return queue.items.filter(item => ids.has(item.orderId)).map(item => ({ orderId: item.orderId, jobId: item.jobId, status: item.status, attempts: item.attempts, paidAt: item.paidAt, nextAttemptAt: item.nextAttemptAt, retryable: item.retryable, error: item.lastError })).slice(0, 50)
}

export async function syncRemnaSubscription(subscriptionId: number) {
  const pending = await db.fulfillmentJob.findFirst({ where: { subscriptionId, kind: 'RENEW_SUBSCRIPTION', status: { not: 'DONE' } }, select: { id: true } })
  if (pending) throw new Error('A paid renewal is still processing; sync is temporarily blocked')
  const sub = await db.subscription.findUnique({ where: { id: subscriptionId }, include: { panel: true, plan: { include: { panel: true } } } })
  if (!sub || (sub.panel || sub.plan.panel)?.type !== 'REMNAWAVE') throw new Error('RemnaWave subscription not found')
  const adapter = getPanelAdapter((sub.panel || sub.plan.panel)!)
  if (!(adapter instanceof RemnaWaveAdapter)) throw new Error('RemnaWave adapter unavailable')
  const live = await adapter.getUser(sub.username)
  if (!live.ok || !live.user) throw new Error(live.message || 'Panel user unavailable')
  // Usage is telemetry. Purchased traffic and expiry remain unchanged until an
  // operator explicitly resolves drift, or the paid renewal workflow updates them.
  await db.subscription.update({ where: { id: sub.id }, data: { trafficUsed: Math.round(live.user.trafficUsed / GB * 1000) / 1000, lastSyncAt: new Date(), ...(live.user.subUrl ? { panelSubUrl: live.user.subUrl } : {}) } })
  return { ok: true, issues: reconcileSubscription(sub, { found: true, ...live.user }) }
}

export async function retryRemnaPaidOrder(orderId: number) {
  const order = await db.order.findUnique({ where: { id: orderId }, include: { plan: { include: { panel: true } } } })
  if (!order || order.status !== 'PAID' || order.plan?.panel?.type !== 'REMNAWAVE') throw new Error('Paid RemnaWave service order not found')
  return retryPaidFulfillment(orderId)
}

async function acquire() {
  const value = JSON.stringify({ token: randomUUID(), at: Date.now() })
  try { await db.setting.create({ data: { key: LOCK, value } }); return value }
  catch (error: unknown) { if ((error as { code?: string })?.code !== 'P2002') throw error }
  const old = await db.setting.findUnique({ where: { key: LOCK } })
  if (!old) return null
  let at = Date.now()
  try { at = Number(JSON.parse(old.value)?.at) || at } catch {}
  if (at > Date.now() - 10 * 60_000) return null
  const updated = await db.setting.updateMany({ where: { key: LOCK, value: old.value }, data: { value } })
  return updated.count ? value : null
}

export async function runRemnaControl() {
  const extension = await getExtensionState('remnawave-control')
  if (!extension.enabled) return { skipped: 'disabled' as const }
  const lease = await acquire()
  if (!lease) return { skipped: 'running' as const }
  try {
    const panels = await db.panel.findMany({ where: { type: 'REMNAWAVE', active: true }, select: { id: true, name: true } })
    const summaries = []
    for (const panel of panels) {
      try {
        const cursorRow = await db.setting.findUnique({ where: { key: CURSOR(panel.id) } })
        const cursor = Number(cursorRow?.value) || 0
        let scan = await scanRemnaPanel(panel.id, cursor, Number(extension.settings['batch-size']) || 5, extension.settings['auto-repair'] === true)
        if (!scan.unavailable && !scan.scanned && cursor) scan = await scanRemnaPanel(panel.id, 0, Number(extension.settings['batch-size']) || 5, extension.settings['auto-repair'] === true)
        if (!scan.unavailable) await db.setting.upsert({ where: { key: CURSOR(panel.id) }, create: { key: CURSOR(panel.id), value: String(scan.nextCursor) }, update: { value: String(scan.nextCursor) } })
        summaries.push({ panelId: panel.id, name: panel.name, healthy: scan.health.ok, scanned: scan.scanned, issues: scan.items.filter(item => item.issues.length).length, repaired: scan.repaired })
      } catch { summaries.push({ panelId: panel.id, name: panel.name, healthy: false, scanned: 0, issues: 0, repaired: 0 }) }
    }
    const result = { at: new Date().toISOString(), panels: summaries }
    await db.setting.upsert({ where: { key: LAST }, create: { key: LAST, value: JSON.stringify(result) }, update: { value: JSON.stringify(result) } })
    return result
  } finally { await db.setting.deleteMany({ where: { key: LOCK, value: lease } }) }
}
