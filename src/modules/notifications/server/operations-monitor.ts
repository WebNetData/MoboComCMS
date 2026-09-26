import fs from 'node:fs/promises'
import path from 'node:path'
import { db } from '@/platform/database/prisma'
import { getExtensionState } from '@/extensions/server/state'
import { listFulfillmentOperations, listPaymentIssues } from '@/modules/fulfillment/server/operations'
import { bot, telegramConfig } from '@/modules/notifications/server/telegram'
import { logEvent } from '@/platform/observability/logger'
import { getPanelAdapter, RemnaWaveAdapter } from '@/modules/providers/server/panels'
import { botText, getBotLocale } from '@/modules/notifications/server/telegram-locale'

type Status = 'ok' | 'warning' | 'critical' | 'disabled'
type Signal = { id: string; status: Status; title: string; detail: string; titleFa: string; detailFa: string }
type Settings = Record<string, unknown>
const PREFIX = 'operations.monitor.signal.'
const RETRY_MS = 10 * 60_000

function limit(value: unknown, fallback: number, min: number, max: number) {
  const number = Number(value)
  return Number.isFinite(number) && number >= min && number <= max ? number : fallback
}

async function latestBackup() {
  const dir = path.resolve(process.env.BACKUP_DIR || 'storage/backups')
  const names = await fs.readdir(dir).catch(() => [] as string[])
  const latest = names.filter(name => /^backup-\d{13}-[a-f0-9]{12}\.json$/.test(name)).sort().at(-1)
  if (!latest) return null
  try {
    const meta = JSON.parse(await fs.readFile(path.join(dir, latest), 'utf8'))
    if (meta.id !== latest.slice(0, -5) || !Number.isFinite(Date.parse(meta.createdAt))) return null
    await fs.access(path.join(dir, meta.id + '.dump.enc'))
    return meta as { id: string; createdAt: string; restore?: { ok?: boolean } | null }
  } catch { return null }
}

export async function sampleMonitoring(settings?: Settings) {
  const state = settings || (await getExtensionState('operations-monitor')).settings
  const checkedAt = new Date().toISOString()
  const signals: Signal[] = []
  let disk: { usedPercent: number; freeBytes: number; totalBytes: number } | undefined

  try {
    const stat = await fs.statfs(process.env.MONITOR_DISK_PATH || '/')
    const totalBytes = stat.blocks * stat.bsize
    const freeBytes = stat.bavail * stat.bsize
    const usedPercent = Math.round((1 - freeBytes / totalBytes) * 100)
    if (!Number.isFinite(usedPercent) || totalBytes <= 0) throw new Error('DISK_METRICS_UNAVAILABLE')
    disk = { usedPercent, freeBytes, totalBytes }
    const warning = limit(state['disk-warning'], 75, 1, 95)
    const critical = limit(state['disk-critical'], Math.max(85, warning + 1), warning + 1, 99)
    signals.push({ id: 'disk', status: usedPercent >= critical ? 'critical' : usedPercent >= warning ? 'warning' : 'ok', title: 'Disk space', titleFa: 'فضای دیسک', detail: `${usedPercent}% used · ${(freeBytes / 1024 ** 3).toFixed(1)} GiB free`, detailFa: `${usedPercent}٪ استفاده‌شده · ${(freeBytes / 1024 ** 3).toFixed(1)} گیگابایت آزاد` })
  } catch {
    signals.push({ id: 'disk', status: 'warning', title: 'Disk space', titleFa: 'فضای دیسک', detail: 'Disk metrics unavailable; check the host manually.', detailFa: 'اطلاعات دیسک در دسترس نیست؛ سرور را دستی بررسی کنید.' })
  }

  try {
    await db.$queryRaw`SELECT 1`
    signals.push({ id: 'database', status: 'ok', title: 'PostgreSQL', titleFa: 'پایگاه‌داده PostgreSQL', detail: 'Database query succeeded.', detailFa: 'ارتباط با پایگاه‌داده برقرار است.' })
  } catch {
    signals.push({ id: 'database', status: 'critical', title: 'PostgreSQL', titleFa: 'پایگاه‌داده PostgreSQL', detail: 'Database query failed. External uptime monitoring is required for outage alerts.', detailFa: 'ارتباط با پایگاه‌داده قطع است؛ برای هشدار قطعی کامل، پایش بیرونی لازم است.' })
    return { checkedAt, signals, disk }
  }

  try {
    const backup = await db.setting.findUnique({ where: { key: 'operations.backup.config' } })
    let backupEnabled = false
    try { backupEnabled = backup ? Boolean(JSON.parse(backup.value)?.enabled) : false } catch {}
    if (!backupEnabled) signals.push({ id: 'backup', status: 'disabled', title: 'Encrypted backup', titleFa: 'بکاپ رمزگذاری‌شده', detail: 'Scheduled backups are disabled.', detailFa: 'بکاپ زمان‌بندی‌شده غیرفعال است.' })
    else {
      const [latest, stateRow] = await Promise.all([latestBackup(), db.setting.findUnique({ where: { key: 'operations.backup.state' } })])
      let last: { status?: string; restore?: { ok?: boolean }; error?: string } = {}
      try { last = stateRow ? JSON.parse(stateRow.value) : {} } catch {}
      const ageHours = latest ? (Date.now() - Date.parse(latest.createdAt)) / 3_600_000 : Infinity
      const maxAge = limit(state['backup-max-age-hours'], 4, 1, 168)
      const failed = last.status === 'FAILED' || last.status === 'PARTIAL' || last.restore?.ok === false || latest?.restore?.ok === false
      signals.push({ id: 'backup', status: failed || ageHours > maxAge ? 'critical' : 'ok', title: 'Encrypted backup', titleFa: 'بکاپ رمزگذاری‌شده', detail: failed ? `Last backup attempt: ${last.status || 'restore test failed'}.` : latest ? `Newest archive ${ageHours.toFixed(1)} hours old; limit ${maxAge} hours.` : 'No encrypted backup found.', detailFa: failed ? `آخرین تلاش بکاپ: ${last.status || 'آزمون بازیابی ناموفق'}.` : latest ? `آخرین فایل مربوط به ${ageHours.toFixed(1)} ساعت قبل است؛ حد مجاز ${maxAge} ساعت.` : 'هیچ بکاپ رمزگذاری‌شده‌ای پیدا نشد.' })
    }
  } catch { signals.push({ id: 'backup', status: 'warning', title: 'Encrypted backup', titleFa: 'بکاپ رمزگذاری‌شده', detail: 'Backup status could not be read.', detailFa: 'وضعیت بکاپ قابل خواندن نیست.' }) }

  try {
    const fulfillment = await listFulfillmentOperations()
    const waitMinutes = limit(state['order-wait-minutes'], 15, 1, 1440)
    const overdue = fulfillment.items.filter(item => item.status === 'FAILED' || item.status === 'MISSING' || (item.paidAt && Date.now() - new Date(item.paidAt).getTime() > waitMinutes * 60_000))
    signals.push({ id: 'fulfillment', status: overdue.length ? 'critical' : 'ok', title: 'Paid order delivery', titleFa: 'تحویل سفارش‌های پرداخت‌شده', detail: overdue.length ? `${overdue.length} paid order(s) need attention (latest ${fulfillment.scanned} scanned).` : `No overdue paid orders among the latest ${fulfillment.scanned}.`, detailFa: overdue.length ? `${overdue.length} سفارش نیازمند رسیدگی است؛ ${fulfillment.scanned} پرداخت اخیر بررسی شد.` : `در ${fulfillment.scanned} پرداخت اخیر، سفارش معطلی پیدا نشد.` })
  } catch { signals.push({ id: 'fulfillment', status: 'warning', title: 'Paid order delivery', titleFa: 'تحویل سفارش‌های پرداخت‌شده', detail: 'Order queue could not be read.', detailFa: 'صف سفارش‌ها قابل خواندن نیست.' }) }
  try {
    const payments = await listPaymentIssues()
    signals.push({ id: 'payments', status: payments.length ? 'warning' : 'ok', title: 'Payment processing', titleFa: 'پرداخت‌ها', detail: payments.length ? `${payments.length} failed webhook or untracked payment(s) need review.` : 'No recorded gateway issues.', detailFa: payments.length ? `${payments.length} وب‌هوک ناموفق یا پرداخت بدون شناسهٔ پیگیری نیازمند بررسی است.` : 'خطای پرداخت ثبت‌شده‌ای وجود ندارد.' })
  } catch { signals.push({ id: 'payments', status: 'warning', title: 'Payment processing', titleFa: 'پرداخت‌ها', detail: 'Payment issues could not be read.', detailFa: 'خطاهای پرداخت قابل خواندن نیست.' }) }
  try {
    if ((await getExtensionState('remnawave-control')).enabled) {
      const panels = await db.panel.findMany({ where: { type: 'REMNAWAVE', active: true } })
      for (const panel of panels) {
        const adapter = getPanelAdapter(panel)
        const health = adapter instanceof RemnaWaveAdapter ? await adapter.getHealth() : { ok: false, latencyMs: 0, source: 'adapter' }
        signals.push({ id: `remnawave-${panel.id}`, status: health.ok ? 'ok' : 'critical', title: `RemnaWave · ${panel.name}`, titleFa: `RemnaWave · ${panel.name}`, detail: health.ok ? `Panel responded in ${health.latencyMs} ms via ${health.source}.` : 'Panel health check failed.', detailFa: health.ok ? `پنل در ${health.latencyMs} میلی‌ثانیه پاسخ داد.` : 'بررسی سلامت پنل ناموفق بود.' })
      }
    }
  } catch { signals.push({ id: 'remnawave', status: 'warning', title: 'RemnaWave', titleFa: 'RemnaWave', detail: 'Panel health checks could not be completed.', detailFa: 'بررسی سلامت پنل‌ها کامل نشد.' }) }
  return { checkedAt, signals, disk }
}

type AlertState = { status: Status; notified: boolean; at: number }
async function claimSignal(signal: Signal) {
  const key = PREFIX + signal.id
  const now = Date.now()
  const claim = JSON.stringify({ status: signal.status, notified: false, at: now })
  try {
    await db.setting.create({ data: { key, value: claim } })
    return signal.status === 'ok' || signal.status === 'disabled' ? null : { key, claim }
  } catch (error: unknown) {
    if ((error as { code?: string })?.code !== 'P2002') throw error
  }
  const current = await db.setting.findUnique({ where: { key } })
  if (!current) return null
  let previous: AlertState = { status: 'ok', notified: true, at: 0 }
  try { previous = JSON.parse(current.value) } catch {}
  if (previous.status === signal.status && (previous.notified || now - previous.at < RETRY_MS)) return null
  if (signal.status === 'disabled' || (signal.status === 'ok' && !previous.notified)) {
    await db.setting.updateMany({ where: { key, value: current.value }, data: { value: JSON.stringify({ status: signal.status, notified: true, at: now }) } })
    return null
  }
  const changed = await db.setting.updateMany({ where: { key, value: current.value }, data: { value: claim } })
  return changed.count ? { key, claim } : null
}

export async function runOperationsMonitor() {
  const extension = await getExtensionState('operations-monitor')
  if (!extension.enabled) return { skipped: 'disabled' as const }
  const report = await sampleMonitoring(extension.settings)
  const chatId = String(extension.settings['chat-id'] || '').trim()
  const telegram = extension.settings.alerts === true && /^[1-9]\d{0,19}$/.test(chatId) ? await telegramConfig() : null
  const locale = telegram?.ready ? await getBotLocale(chatId) || 'en' : 'en'
  let sent = 0
  let failed = 0
  if (telegram?.ready) for (const signal of report.signals) {
    const claimed = await claimSignal(signal)
    if (!claimed) continue
    const label = signal.status === 'ok' || signal.status === 'disabled' ? botText(locale, '✅ Recovered', '✅ بازیابی شد') : signal.status === 'critical' ? botText(locale, '🚨 Critical', '🚨 بحرانی') : botText(locale, '⚠️ Warning', '⚠️ هشدار')
    const result = await bot('sendMessage', { chat_id: chatId, text: `${label} · MoboComCMS ${botText(locale, signal.title, signal.titleFa)}\n${botText(locale, signal.detail, signal.detailFa)}\n${botText(locale, 'Admin → Extensions → Monitoring', 'مدیریت ← افزونه‌ها ← پایش')}`, disable_web_page_preview: true }, telegram)
    await db.setting.updateMany({ where: { key: claimed.key, value: claimed.claim }, data: { value: JSON.stringify({ status: signal.status, notified: result.ok, at: Date.now() }) } })
    if (result.ok) sent++
    else { failed++; logEvent('warn', 'monitor.alert_failed', { signal: signal.id, status: result.status }) }
  }
  await db.setting.upsert({ where: { key: 'operations.monitor.last-run' }, create: { key: 'operations.monitor.last-run', value: JSON.stringify({ at: report.checkedAt, sent, failed, statuses: Object.fromEntries(report.signals.map(signal => [signal.id, signal.status])) }) }, update: { value: JSON.stringify({ at: report.checkedAt, sent, failed, statuses: Object.fromEntries(report.signals.map(signal => [signal.id, signal.status])) }) } })
  return { report, sent, failed }
}

export async function getMonitoringLastRun() {
  const row = await db.setting.findUnique({ where: { key: 'operations.monitor.last-run' } })
  if (!row) return null
  try { return JSON.parse(row.value) as { at: string; sent: number; failed: number; statuses: Record<string, Status> } }
  catch { return null }
}
