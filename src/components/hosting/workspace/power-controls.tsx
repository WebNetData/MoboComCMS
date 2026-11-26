'use client'
import { useState } from 'react'
import Icon from '@/components/site/Icon'
export type CloudOperationView = { id: string; command: string; status: string; updatedAt: string }
const STATUS: Record<string, string> = {
  QUEUED: 'در صف اجرا',
  RUNNING: 'در حال اجرا',
  PENDING: 'در انتظار تأیید میزبان',
  UNKNOWN: 'نتیجه در حال بررسی پشتیبانی',
  BLOCKED: 'نیازمند بررسی پشتیبانی',
  FAILED: 'انجام نشد',
  DONE: 'تکمیل شد',
}
export default function PowerControls({
  serviceId,
  enabled,
  active,
  powerState,
  operations,
  onChanged,
}: {
  serviceId: number
  enabled: boolean
  active: boolean
  powerState: string
  operations: CloudOperationView[]
  onChanged: () => void
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState('')
  const pending = operations.find((o) => !['DONE', 'FAILED'].includes(o.status))
  async function command(value: string) {
    if (value === 'REBOOT' && !window.confirm('سرور دوباره راه‌اندازی شود؟ اتصال‌های جاری قطع می‌شوند.')) return
    setBusy(true)
    setMessage('')
    setError('')
    try {
      const response = await fetch('/api/hosting/services/' + serviceId, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'power', command: value, requestKey: crypto.randomUUID() }),
        }),
        data = await response.json()
      if (!response.ok) throw Error(data.error || 'درخواست ثبت نشد')
      setMessage('درخواست ثبت شد؛ پس از پاسخ قطعی میزبان، وضعیت تغییر می‌کند.')
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ارتباط برقرار نشد')
    } finally {
      setBusy(false)
    }
  }
  if (!enabled && !operations.length) return null
  return (
    <section className="hs-panel hs-power" aria-labelledby="hs-power-title">
      <h2 id="hs-power-title">
        <Icon name="server" size={18} />
        کنترل سرور
      </h2>
      <div className="hs-field">
        <span className="hs-field-label">آخرین وضعیت تأییدشده</span>
        <b>{powerState === 'STOPPED' ? 'خاموش' : active ? 'روشن' : 'آماده نیست'}</b>
      </div>
      {pending && (
        <p className="hs-note" role="status">
          {STATUS[pending.status] || 'در حال بررسی'}؛ برای مشاهدهٔ نتیجه، وضعیت را به‌روز کنید.
        </p>
      )}
      {enabled && active && (
        <div className="hs-power-actions">
          {[
            ['START', 'روشن کردن'],
            ['SHUTDOWN', 'خاموش کردن امن'],
            ['REBOOT', 'راه‌اندازی مجدد'],
          ].map(([value, label]) => (
            <button
              type="button"
              className="btn btn-ghost"
              key={value}
              disabled={busy || !!pending}
              onClick={() => void command(value)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <button type="button" className="hs-copy" disabled={busy} onClick={onChanged}>
        <Icon name="refresh" size={16} />
        به‌روزرسانی وضعیت
      </button>
      {message && (
        <p role="status" className="sa-hint">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="hs-error">
          {error}
        </p>
      )}
      <p className="hs-rates">
        خاموش کردن، سرویس را حذف نمی‌کند؛ هزینهٔ منابع رزروشده طبق پلن محاسبه می‌شود. درخواست روشن‌کردن سرویس ساعتی،
        ساعت جاری را با نرخ روشن محاسبه می‌کند.
      </p>
    </section>
  )
}
