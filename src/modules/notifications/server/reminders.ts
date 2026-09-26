import { createHash, randomUUID } from 'node:crypto'
import { db } from '@/platform/database/prisma'
import { getPanelAdapter } from '@/modules/providers/server/panels'
import { bot, miniAppButton, telegramConfig } from '@/modules/notifications/server/telegram'
import { getReminderSettings } from './reminder-settings'
import { reminderFacts, renderReminder } from '@/modules/notifications/domain/reminders'
import { botText, getBotLocale } from './telegram-locale'
import { planName } from '@/modules/catalog/domain/plan-locale'

const LOCK = 'telegram.reminders.lock'
const CURSOR = 'telegram.reminders.cursor'
export const REMINDER_RUN = 'telegram.reminders.last-run'
const INTERVAL = 5 * 60_000

export function reminderKey(subscriptionId: number, recipient: string, expiresAt: number, limit: number, kind: string) {
  return createHash('sha256').update(JSON.stringify([subscriptionId, recipient, Math.floor(expiresAt / 1000), limit, kind])).digest('hex')
}

async function within<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try { return await Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('panel timeout')), ms) })]) }
  finally { if (timer) clearTimeout(timer) }
}

export async function claimReminder(id: string, subscriptionId: number, kind: string) {
  try { await db.subscriptionReminder.create({ data: { id, subscriptionId, kind } }); return true }
  catch (error: any) { if (error?.code !== 'P2002') throw error }
  const claimed = await db.subscriptionReminder.updateMany({ where: { id, status: 'RETRY', attempts: { lt: 4 }, retryAt: { lte: new Date() } }, data: { status: 'CLAIMED', attempts: { increment: 1 }, retryAt: null } })
  return claimed.count === 1
}

/** Bounded, database-leased batches; Telegram timeouts are never blindly retried. */
export async function runSubscriptionReminders() {
  const settings = await getReminderSettings()
  if (!settings.enabled) return { skipped: 'disabled' }
  const cfg = await telegramConfig()
  if (!cfg.ready) return { skipped: 'bot-not-ready' }
  const lockValue = JSON.stringify({ token: randomUUID(), at: Date.now() })
  try { await db.setting.create({ data: { key: LOCK, value: lockValue } }) }
  catch (error: any) {
    if (error?.code !== 'P2002') throw error
    const old = await db.setting.findUnique({ where: { key: LOCK } })
    let at = Date.now()
    try { at = JSON.parse(old?.value || '{}').at ?? at } catch {}
    if (!old || at > Date.now() - 180_000) return { skipped: 'running' }
    if (!(await db.setting.updateMany({ where: { key: LOCK, value: old.value }, data: { value: lockValue } })).count) return { skipped: 'running' }
  }
  const result = { checked: 0, sent: 0, failed: 0, skipped: 0, startedAt: new Date().toISOString() }
  try {
    const previous = await db.setting.findUnique({ where: { key: REMINDER_RUN } })
    if (previous && Date.now() - new Date(JSON.parse(previous.value).startedAt).getTime() < INTERVAL) return { skipped: 'not-due' }
    await db.subscriptionReminder.updateMany({ where: { status: 'CLAIMED', updatedAt: { lt: new Date(Date.now() - 180_000) } }, data: { status: 'UNKNOWN' } })
    const cursorRow = await db.setting.findUnique({ where: { key: CURSOR } })
    const cursor = Number(cursorRow?.value) || 0
    const where = { status: { in: ['ACTIVE', 'EXPIRED'] }, user: { status: 'ACTIVE', subscriptionAlerts: true, telegramId: { not: null } } }
    let subs = await db.subscription.findMany({ where: { ...where, id: { gt: cursor } }, orderBy: { id: 'asc' }, take: 50, include: { panel: true, plan: { include: { panel: true } }, user: true } })
    if (!subs.length && cursor) subs = await db.subscription.findMany({ where, orderBy: { id: 'asc' }, take: 50, include: { panel: true, plan: { include: { panel: true } }, user: true } })
    const deadline = Date.now() + 60_000
    let lastId = 0
    for (const sub of subs) {
      if (Date.now() > deadline) break
      lastId = sub.id; result.checked++
      try {
        const panel = sub.panel || sub.plan.panel
        if (!panel?.active || !sub.user.telegramId) { result.skipped++; continue }
        const adapter = getPanelAdapter(panel)
        if (!adapter) { result.skipped++; continue }
        const current = await within(adapter.getUser(sub.username), 20_000)
        if (!current.ok || !current.user || current.user.status === 'disabled' || current.user.status === 'unknown' || !current.user.expiresAt) { result.skipped++; continue }
        const live = current.user
        const expiry = live.expiresAt!.getTime()
        const facts = reminderFacts({ now: Date.now(), expiresAt: expiry, used: live.trafficUsed, limit: live.trafficLimit }, settings)
        if (!facts) { result.skipped++; continue }
        for (const kind of ['expiry', 'traffic', 'expired'] as const) {
          if (!facts[kind]) continue
          const user = await db.user.findUnique({ where: { id: sub.userId }, select: { telegramId: true, subscriptionAlerts: true, status: true } })
          if (!user?.subscriptionAlerts || user.status !== 'ACTIVE' || !user.telegramId || !(await getReminderSettings()).enabled) continue
          // A paid renewal in flight must finish before deciding a new warning cycle.
          if (await db.fulfillmentJob.findFirst({ where: { subscriptionId: sub.id, kind: 'RENEW_SUBSCRIPTION', status: { not: 'DONE' } } })) continue
          const id = reminderKey(sub.id, user.telegramId, expiry, live.trafficLimit, kind)
          const locale = await getBotLocale(user.telegramId) || 'en'
          const keyboard = [await miniAppButton(botText(locale, 'View and renew subscription', 'مشاهده و تمدید همین اشتراک'), `/miniapp?subscription=${sub.id}&renew=1`)]
          const template = settings[kind === 'expiry'
            ? locale === 'fa' ? 'expiryTemplate' : 'expiryTemplateEn'
            : kind === 'expired' ? locale === 'fa' ? 'expiredTemplate' : 'expiredTemplateEn'
            : locale === 'fa' ? 'trafficTemplate' : 'trafficTemplateEn']
          const text = renderReminder(template, {
            plan: planName(sub.plan, locale), username: sub.username, days: String(facts.days),
            expiry: new Date(expiry).toLocaleDateString(locale === 'fa' ? 'fa-IR' : 'en-US', { timeZone: 'Asia/Tehran' }),
            remainingGB: facts.remaining === null ? botText(locale, 'Unlimited', 'نامحدود') : `${(facts.remaining / 1024 ** 3).toLocaleString(locale === 'fa' ? 'fa-IR' : 'en-US', { maximumFractionDigits: 2 })} GB`,
            remainingPercent: facts.percent === null ? botText(locale, 'Unlimited', 'نامحدود') : facts.percent.toFixed(1),
          })
          if (!await claimReminder(id, sub.id, kind)) { result.skipped++; continue }
          const sent = await bot('sendMessage', { chat_id: user.telegramId, text, disable_web_page_preview: true, reply_markup: { inline_keyboard: keyboard } }, cfg)
          const attempts = sent.status === 429 ? (await db.subscriptionReminder.findUnique({ where: { id }, select: { attempts: true } }))?.attempts || 4 : 0
          const status = sent.ok ? 'SENT' : sent.status === 429 ? (attempts < 4 ? 'RETRY' : 'FAILED') : sent.status && sent.status >= 400 && sent.status < 500 ? 'FAILED' : 'UNKNOWN'
          await db.subscriptionReminder.update({ where: { id }, data: { status, sentAt: sent.ok ? new Date() : null, retryAt: status === 'RETRY' ? new Date(Date.now() + 15 * 60_000) : null } })
          if (sent.ok) result.sent++; else result.failed++
        }
      } catch { result.failed++ }
    }
    await db.setting.upsert({ where: { key: CURSOR }, create: { key: CURSOR, value: String(lastId) }, update: { value: String(lastId) } })
    await db.setting.upsert({ where: { key: REMINDER_RUN }, create: { key: REMINDER_RUN, value: JSON.stringify(result) }, update: { value: JSON.stringify(result) } })
    return result
  } finally { await db.setting.deleteMany({ where: { key: LOCK, value: lockValue } }) }
}
