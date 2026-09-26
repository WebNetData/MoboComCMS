import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { requirePerm } from '@/modules/identity/server/access'
import { auditAdmin } from '@/platform/audit/server'
import { listFulfillmentOperations, listPaymentIssues, retryPaidFulfillment } from '@/modules/fulfillment/server/operations'
import { bot, telegramConfig } from '@/modules/notifications/server/telegram'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ALERT_ENABLED = 'fulfillmentAlertsEnabled'
const ALERT_CHAT = 'fulfillmentAlertsChatId'

export async function GET(req: NextRequest) {
  const admin = await requirePerm(req, 'orders.manage')
  if (!admin) return err('forbidden', 403)
  const [queue, paymentIssues, rows] = await Promise.all([
    listFulfillmentOperations(),
    listPaymentIssues(),
    db.setting.findMany({ where: { key: { in: [ALERT_ENABLED, ALERT_CHAT] } } }),
  ])
  const settings = Object.fromEntries(rows.map((row) => [row.key, row.value]))
  return ok({ ...queue, paymentIssues, alerts: { enabled: settings[ALERT_ENABLED] === 'true', chatId: settings[ALERT_CHAT] || '' } })
}

export async function PATCH(req: NextRequest) {
  const admin = await requirePerm(req, 'orders.manage')
  if (!admin) return err('forbidden', 403)
  const body = await req.json().catch(() => null)
  if (body?.action === 'retry') {
    const orderId = Number(body.orderId)
    if (!Number.isSafeInteger(orderId) || orderId <= 0) return err('Invalid order ID.')
    const result = await retryPaidFulfillment(orderId).catch((error) => ({ ok: false as const, message: error instanceof Error ? error.message : 'Retry failed.' }))
    await auditAdmin({ req, actor: admin, action: 'fulfillment.retry', targetType: 'order', targetId: orderId, metadata: { ok: result.ok, jobId: 'jobId' in result ? result.jobId : null } })
    if (!result.ok) return err(result.message || 'Retry failed.', 409)
    return ok(result)
  }
  if (body?.action === 'alerts') {
    if (typeof body.enabled !== 'boolean' || typeof body.chatId !== 'string') return err('Invalid alert settings.')
    const chatId = body.chatId.trim()
    if (chatId && !/^-?[1-9]\d{0,19}$/.test(chatId)) return err('Enter a numeric Telegram chat ID.')
    if (body.enabled && !chatId) return err('Telegram chat ID is required when alerts are enabled.')
    if (body.enabled && !(await telegramConfig()).ready) return err('Configure and enable the Telegram bot first.', 409)
    await db.$transaction([
      db.setting.upsert({ where: { key: ALERT_ENABLED }, create: { key: ALERT_ENABLED, value: String(body.enabled) }, update: { value: String(body.enabled) } }),
      db.setting.upsert({ where: { key: ALERT_CHAT }, create: { key: ALERT_CHAT, value: chatId }, update: { value: chatId } }),
    ])
    await auditAdmin({ req, actor: admin, action: 'fulfillment.alerts.update', targetType: 'setting', metadata: { enabled: body.enabled, hasChatId: Boolean(chatId) } })
    return ok({ enabled: body.enabled, chatId })
  }
  if (body?.action === 'testAlert') {
    const settings = await db.setting.findMany({ where: { key: { in: [ALERT_ENABLED, ALERT_CHAT] } } })
    const values = Object.fromEntries(settings.map((row) => [row.key, row.value]))
    const telegram = await telegramConfig()
    if (values[ALERT_ENABLED] !== 'true' || !values[ALERT_CHAT] || !telegram.ready) return err('Enable alerts and configure the Telegram bot first.', 409)
    const result = await bot('sendMessage', { chat_id: values[ALERT_CHAT], text: '✅ HappVPN order operations alert test.' }, telegram)
    await auditAdmin({ req, actor: admin, action: 'fulfillment.alerts.test', targetType: 'setting', metadata: { ok: result.ok } })
    return result.ok ? ok({ sent: true }) : err('Telegram did not accept the test message.', 502)
  }
  return err('Unknown action.')
}
