'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from '@/components/AppLink'
import { useI18n } from '@/i18n/LocaleProvider'
import { formatCurrency } from '@/shared/money/client'

type QueueItem = {
  orderId: number
  invoiceId: number
  user: string
  item: string
  kind: string
  amount: number
  currency: string
  paidAt: string | null
  jobId: number | null
  status: string
  attempts: number
  lastAttemptAt: string | null
  nextAttemptAt: string | null
  lastError: string
  lockedAt: string | null
  retryable: boolean
}

type PaymentIssue = { id: string; provider: string; kind: string; orderId: number | null; invoiceId: number | null; attempts: number; reason: string; at: string }
type Operations = { items: QueueItem[]; paymentIssues: PaymentIssue[]; scanned: number; limit: number; alerts: { enabled: boolean; chatId: string } }

/** Delivery job states and the provisioning errors stored in English, read in Persian. */
const STATUS_FA: Record<string, string> = { FAILED: 'ناموفق', MISSING: 'ثبت نشده', PENDING: 'در انتظار', PROCESSING: 'در حال اجرا', DONE: 'انجام شد', SUCCEEDED: 'انجام شد' }
const ERROR_FA: Record<string, string> = { 'panel not configured for this plan': 'برای این پلن پنلی تنظیم نشده است.', 'panel not configured for this subscription': 'برای این اشتراک پنلی تنظیم نشده است.' }

export default function AdminOperationsPage() {
  const { locale } = useI18n()
  const fa = locale === 'fa'
  const L = (faText: string, enText: string) => fa ? faText : enText
  const [data, setData] = useState<Operations | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState<number | 'alerts' | null>(null)
  const [enabled, setEnabled] = useState(false)
  const [chatId, setChatId] = useState('')

  const load = useCallback(async () => {
    const response = await fetch('/api/admin/operations', { cache: 'no-store' })
    if (!response.ok) throw new Error('Unable to load the operations queue.')
    const next = await response.json() as Operations
    setData(next)
    setEnabled(next.alerts.enabled)
    setChatId(next.alerts.chatId)
  }, [])
  useEffect(() => { load().catch(() => { setError(true); setMessage(L('بارگذاری صف ناموفق بود.', 'Unable to load the queue.')) }) }, [load])

  async function send(body: Record<string, unknown>) {
    const response = await fetch('/api/admin/operations', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const result = await response.json().catch(() => null)
    if (!response.ok) throw new Error(result?.error || 'Request failed.')
    return result
  }

  async function retry(item: QueueItem) {
    setBusy(item.orderId); setMessage(''); setError(false)
    try {
      const result = await send({ action: 'retry', orderId: item.orderId })
      setMessage(result.skipped ? L('کار قبلاً توسط پردازشگر برداشته شده است.', 'A worker already picked up this job.') : L('تلاش مجدد انجام شد.', 'Retry completed.'))
      await load()
    } catch (cause) {
      setError(true); setMessage(cause instanceof Error ? cause.message : L('تلاش مجدد ناموفق بود.', 'Retry failed.'))
      await load().catch(() => {})
    } finally { setBusy(null) }
  }

  async function saveAlerts() {
    setBusy('alerts'); setMessage(''); setError(false)
    try {
      await send({ action: 'alerts', enabled, chatId })
      setMessage(L('تنظیمات هشدار ذخیره شد.', 'Alert settings saved.'))
      await load()
    } catch (cause) { setError(true); setMessage(cause instanceof Error ? cause.message : L('ذخیره ناموفق بود.', 'Save failed.')) }
    finally { setBusy(null) }
  }

  async function testAlert() {
    setBusy('alerts'); setMessage(''); setError(false)
    try { await send({ action: 'testAlert' }); setMessage(L('پیام آزمایشی ارسال شد.', 'Test message sent.')) }
    catch (cause) { setError(true); setMessage(cause instanceof Error ? cause.message : L('ارسال آزمایشی ناموفق بود.', 'Test failed.')) }
    finally { setBusy(null) }
  }

  const when = (date: string | null) => date ? new Date(date).toLocaleString(fa ? 'fa-IR' : 'en-US') : '—'
  const failed = data?.items.filter((item) => item.status === 'FAILED' || item.status === 'MISSING').length || 0
  const running = data?.items.filter((item) => item.status === 'PROCESSING').length || 0

  return <div>
    <div className="appbar">
      <div><h1 className="h2">{L('مرکز عملیات سفارش', 'Order operations')}</h1><p className="muted">{L('سفارش‌های پرداخت‌شده‌ای که تحویلشان هنوز کامل نشده است.', 'Paid orders whose delivery has not completed yet.')}</p></div>
      <button className="btn btn-ghost" onClick={() => load().catch(() => { setError(true); setMessage(L('به‌روزرسانی ناموفق بود.', 'Refresh failed.')) })}>{L('به‌روزرسانی', 'Refresh')}</button>
    </div>
    {message && <p className={error ? 'error-text mb-4' : 'success-text mb-4'} role="status">{message}</p>}
    <div className="grid-3 mb-6">
      <div className="card kpi"><div className="muted text-xs">{L('نیازمند رسیدگی', 'Needs attention')}</div><div className="num text-2xl font-extrabold">{failed}</div></div>
      <div className="card kpi"><div className="muted text-xs">{L('در حال پردازش', 'Processing')}</div><div className="num text-2xl font-extrabold">{running}</div></div>
      <div className="card kpi"><div className="muted text-xs">{L('در صف', 'Queued')}</div><div className="num text-2xl font-extrabold">{(data?.items.length || 0) - failed - running}</div></div>
    </div>
    <div className="card overflow-x-auto mb-6">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4"><h2 className="font-bold">{L('صف فعال‌سازی و تحویل', 'Fulfillment queue')}</h2><span className="muted text-xs">{data ? L(`آخرین ${data.scanned} پرداخت بررسی شد`, `Latest ${data.scanned} paid invoices checked`) : L('در حال بارگذاری', 'Loading')}</span></div>
      <table className="data"><thead><tr><th>{L('سفارش', 'Order')}</th><th>{L('کاربر / مورد', 'Customer / item')}</th><th>{L('وضعیت', 'Status')}</th><th>{L('آخرین تلاش', 'Last attempt')}</th><th>{L('علت / تلاش بعدی', 'Reason / next try')}</th><th>{L('اقدام', 'Action')}</th></tr></thead><tbody>
        {data?.items.map((item) => <tr key={item.orderId}>
          <td><Link href={`/admin/orders`} className="font-semibold num">#{item.orderId}</Link><div className="muted text-xs num">{formatCurrency(item.amount, item.currency, fa ? 'fa-IR' : 'en-US')}</div></td>
          <td><span className="text-sm" dir="ltr">{item.user}</span><div className="muted text-xs">{item.item}</div></td>
          <td><span className={`badge ${item.status === 'FAILED' || item.status === 'MISSING' ? 'badge-red' : 'badge-amber'}`}>{L(STATUS_FA[item.status] || item.status, item.status)}</span><div className="muted text-xs">{L('تلاش', 'Attempts')}: <span className="num">{item.attempts}</span></div></td>
          <td className="num text-xs">{when(item.lastAttemptAt)}</td>
          <td className="text-xs" style={{ maxWidth: 300, overflowWrap: 'anywhere' }}>{(item.lastError && L(ERROR_FA[item.lastError] || item.lastError, item.lastError)) || (item.status === 'MISSING' ? L('کار تحویل ثبت نشده است.', 'No fulfillment job was recorded.') : '—')}<div className="muted mt-1 num">{item.nextAttemptAt ? `${L('بعدی', 'Next')}: ${when(item.nextAttemptAt)}` : ''}</div></td>
          <td>{item.status !== 'PROCESSING' && item.retryable && <button className="badge badge-green" disabled={busy !== null} onClick={() => retry(item)}>{busy === item.orderId ? L('در حال تلاش', 'Retrying') : L('تلاش مجدد', 'Retry')}</button>}{!item.retryable && <span className="muted text-xs">{L('بررسی دستی', 'Investigate')}</span>}</td>
        </tr>)}
        {data && data.items.length === 0 && <tr><td colSpan={6} className="muted text-center py-8">{L('سفارش پرداخت‌شدهٔ معطل ندارید.', 'No paid orders are waiting for fulfillment.')}</td></tr>}
      </tbody></table>
    </div>
    <div className="card overflow-x-auto mb-6">
      <h2 className="font-bold mb-2">{L('خطاهای درگاه پرداخت', 'Payment gateway issues')}</h2>
      <p className="muted text-sm mb-4">{L('این موارد باید در پنل درگاه بررسی شوند؛ درخواست پرداخت از این صفحه دوباره ساخته نمی‌شود.', 'Review these in the merchant dashboard. This page never creates another payment request.')}</p>
      <table className="data"><thead><tr><th>{L('درگاه', 'Gateway')}</th><th>{L('مورد', 'Issue')}</th><th>{L('سفارش / فاکتور', 'Order / invoice')}</th><th>{L('زمان', 'Time')}</th><th>{L('علت', 'Reason')}</th></tr></thead><tbody>
        {data?.paymentIssues.map((issue) => <tr key={issue.id}><td>{issue.provider}</td><td>{issue.kind === 'WEBHOOK_FAILED' ? L('وب‌هوک ناموفق', 'Failed webhook') : L('پرداخت بدون شناسهٔ پیگیری', 'Untracked payment')}</td><td className="num">{issue.orderId ? `#${issue.orderId}` : '—'} / {issue.invoiceId ? `#${issue.invoiceId}` : '—'}</td><td className="num text-xs">{when(issue.at)}</td><td className="text-xs" style={{ maxWidth: 360, overflowWrap: 'anywhere' }}>{issue.reason || '—'}</td></tr>)}
        {data && data.paymentIssues.length === 0 && <tr><td colSpan={5} className="muted text-center py-8">{L('خطای پرداخت ثبت‌شده‌ای نیست.', 'No payment gateway issues found.')}</td></tr>}
      </tbody></table>
    </div>
    <div className="card" style={{ maxWidth: 620 }}>
      <h2 className="font-bold mb-2">{L('هشدار تلگرام', 'Telegram alerts')}</h2>
      <p className="muted text-sm mb-4">{L('بعد از دو تلاش ناموفق برای تحویل یک سفارش پرداخت‌شده، به این چت هشدار می‌فرستد.', 'Sends an alert to this chat after two failed attempts to fulfill a paid order.')}</p>
      <label className="flex items-center gap-2 mb-3"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />{L('فعال', 'Enabled')}</label>
      <label className="label" htmlFor="ops-chat-id">{L('شناسهٔ عددی چت تلگرام', 'Telegram numeric chat ID')}</label>
      <input id="ops-chat-id" className="input mb-3" dir="ltr" value={chatId} onChange={(event) => setChatId(event.target.value)} placeholder="123456789" />
      <div className="flex gap-2 flex-wrap"><button className="btn btn-primary" disabled={busy !== null} onClick={saveAlerts}>{busy === 'alerts' ? L('در حال انجام', 'Working') : L('ذخیره هشدار', 'Save alerts')}</button><button className="btn btn-ghost" disabled={busy !== null || !data?.alerts.enabled} onClick={testAlert}>{L('ارسال آزمایشی', 'Send test')}</button></div>
    </div>
  </div>
}
