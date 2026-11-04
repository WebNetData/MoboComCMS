import { db } from '@/platform/database/prisma'
import { bot, telegramConfig } from '@/modules/notifications/server/telegram'
import { logEvent } from '@/platform/observability/logger'

const RETRY_MS = 5 * 60_000

async function claimAlert(jobId: number) {
  const key = `fulfillment.alert.${jobId}`
  const value = JSON.stringify({ state: 'SENDING', at: Date.now() })
  try {
    await db.setting.create({ data: { key, value } })
    return { key, value }
  } catch (error: any) {
    if (error?.code !== 'P2002') throw error
  }
  const current = await db.setting.findUnique({ where: { key } })
  if (!current) return null
  let previous: { state?: string; at?: number } = {}
  try { previous = JSON.parse(current.value) } catch {}
  if (previous.state === 'SENT' || Date.now() - Number(previous.at || 0) < RETRY_MS) return null
  const changed = await db.setting.updateMany({ where: { key, value: current.value }, data: { value } })
  return changed.count === 1 ? { key, value } : null
}

/** Best-effort operator alerts. The claim prevents parallel workers from sending the same alert. */
export async function alertStuckFulfillment(limit = 10) {
  const settings = await db.setting.findMany({ where: { key: { in: ['fulfillmentAlertsEnabled', 'fulfillmentAlertsChatId'] } } })
  const config = Object.fromEntries(settings.map((row) => [row.key, row.value]))
  if (config.fulfillmentAlertsEnabled !== 'true' || !config.fulfillmentAlertsChatId) return { sent: 0, failed: 0 }
  const telegram = await telegramConfig()
  if (!telegram.ready) return { sent: 0, failed: 0 }

  const jobs = await db.fulfillmentJob.findMany({
    where: { status: 'FAILED', attempts: { gte: 2 }, orderId: { not: null }, kind: { in: ['PROVISION_SUBSCRIPTION', 'RENEW_SUBSCRIPTION', 'DELIVER_PRODUCT', 'RESELLER_PROVISION', 'GRANT_MEMBERSHIP', 'HOSTING_PROVISION', 'HOSTING_RENEW', 'HOSTING_ADDON', 'DOMAIN_ORDER', 'DOMAIN_RENEW'] } },
    orderBy: { updatedAt: 'desc' },
    take: 500,
  })
  let sent = 0
  let failed = 0
  for (const job of jobs) {
    if (sent + failed >= Math.max(1, Math.min(limit, 50))) break
    const paid = await db.invoice.findFirst({ where: { orderId: job.orderId!, status: 'PAID' }, select: { id: true } })
    if (!paid) continue
    const claim = await claimAlert(job.id)
    if (!claim) continue
    const current = await db.fulfillmentJob.findUnique({ where: { id: job.id }, select: { status: true } })
    if (current?.status !== 'FAILED') {
      await db.setting.deleteMany({ where: { key: claim.key, value: claim.value } })
      continue
    }
    const result = await bot('sendMessage', {
      chat_id: config.fulfillmentAlertsChatId,
      text: `⚠️ MoboComCMS: paid order #${job.orderId} has not been fulfilled. Job #${job.id} failed after ${job.attempts} attempts. Check Admin → Operations.`,
      disable_web_page_preview: true,
    }, telegram)
    await db.setting.updateMany({ where: { key: claim.key, value: claim.value }, data: { value: JSON.stringify({ state: result.ok ? 'SENT' : 'FAILED', at: Date.now() }) } })
    if (result.ok) sent++
    else {
      failed++
      logEvent('warn', 'fulfillment.alert_failed', { jobId: job.id, orderId: job.orderId, status: result.status })
    }
  }
  return { sent, failed }
}
