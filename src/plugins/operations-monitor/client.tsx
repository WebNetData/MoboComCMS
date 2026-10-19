'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from '@/platform/routing/Link'
import { useExtensionI18n } from '@/extensions/sdk/client'
import type { PluginClientModule } from '../types'

type Signal = { id: string; status: 'ok' | 'warning' | 'critical' | 'disabled'; title: string; detail: string; titleFa: string; detailFa: string }
type Report = { checkedAt: string; signals: Signal[]; disk?: { usedPercent: number; freeBytes: number; totalBytes: number } }
type LastRun = { at: string; sent: number; failed: number }

function MonitoringPage() {
  const { locale } = useExtensionI18n()
  const fa = locale === 'fa'
  const L = (persian: string, english: string) => fa ? persian : english
  const [report, setReport] = useState<Report | null>(null)
  const [lastRun, setLastRun] = useState<LastRun | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    const res = await fetch('/api/admin/monitoring', { cache: 'no-store' })
    const data = await res.json().catch(() => null)
    if (!res.ok) throw new Error(data?.error || 'Monitoring unavailable')
    setReport(data.report)
    setLastRun(data.lastRun || null)
  }, [])
  useEffect(() => { void load().catch(error => setMessage(error.message)) }, [load])
  async function run() {
    setBusy(true); setMessage('')
    try {
      const res = await fetch('/api/admin/monitoring', { method: 'POST' })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'Monitoring failed')
      setReport(data.report)
      setLastRun({ at: data.report.checkedAt, sent: data.sent, failed: data.failed })
      setMessage(L('بررسی انجام شد؛ هشدارهای جدید در صورت فعال‌بودن تلگرام ارسال شدند.', 'Checks completed; new alerts were sent when Telegram alerts are enabled.'))
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Monitoring failed') }
    finally { setBusy(false) }
  }
  const statusLabel = (status: Signal['status']) => ({ ok: L('سالم', 'Healthy'), warning: L('هشدار', 'Warning'), critical: L('بحرانی', 'Critical'), disabled: L('غیرفعال', 'Disabled') })[status]
  const statusClass = (status: Signal['status']) => ({ ok: 'badge-green', warning: 'badge-amber', critical: 'badge-red', disabled: 'badge-gray' })[status]
  return <div dir={fa ? 'rtl' : 'ltr'}><div className="appbar"><div><span className="section-kicker">{L('پایش', 'Monitoring')}</span><h1 className="h2">{L('پایش و هشدارهای عملیات', 'Operations monitoring')}</h1><p className="muted">{L('فضای دیسک، بکاپ، تحویل سفارش و خطاهای پرداخت', 'Disk space, backups, order fulfillment and payment issues')}</p></div><button className="btn btn-primary" onClick={run} disabled={busy}>{busy ? L('در حال بررسی…', 'Checking…') : L('بررسی و ارسال هشدار', 'Check and alert')}</button></div>
    {message && <div className="studio-notice mb-4" role="status">{message}</div>}
    {!report && !message && <div className="studio-notice">{L('در حال دریافت وضعیت…', 'Loading status…')}</div>}
    {report && <><div className="grid-2">{report.signals.map(signal => <article className="card" key={signal.id}><div className="flex items-center justify-between gap-2"><h2 className="font-bold">{fa ? signal.titleFa : signal.title}</h2><span className={`badge ${statusClass(signal.status)}`}>{statusLabel(signal.status)}</span></div><p className="muted text-sm mt-3">{fa ? signal.detailFa : signal.detail}</p></article>)}</div><p className="muted text-xs mt-4">{L('وضعیت اکنون', 'Current status')}: {new Date(report.checkedAt).toLocaleString(fa ? 'fa-IR' : 'en-US')}</p>{lastRun && <p className="muted text-xs mt-1">{L('آخرین اجرای پایش', 'Last monitor run')}: {new Date(lastRun.at).toLocaleString(fa ? 'fa-IR' : 'en-US')} · {L('هشدار ارسال‌شده', 'Alerts sent')}: {lastRun.sent} · {L('ارسال ناموفق', 'Failed sends')}: {lastRun.failed}</p>}</>}
    <div className="studio-notice mt-6">{L('آستانه‌ها و چت تلگرام را در مدیریت افزونه‌ها تنظیم کنید. هشدارها هنگام تغییر وضعیت ارسال می‌شوند و پس از رفع مشکل پیام بازیابی می‌آید.', 'Set thresholds and the Telegram chat in Extensions. Alerts are sent on status changes, with a recovery message when the issue clears.')}</div><div className="studio-quicklinks"><Link href="/admin/extensions">{L('تنظیمات افزونه', 'Plugin settings')} ↗</Link><Link href="/admin/telegram">{L('تنظیمات ربات و بکاپ', 'Bot and backup settings')} ↗</Link><Link href="/admin/operations">{L('مرکز عملیات سفارش', 'Order operations')} ↗</Link></div>
  </div>
}

export const plugin: PluginClientModule = { AdminPage: MonitoringPage }
