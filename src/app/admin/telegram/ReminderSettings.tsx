'use client'
import { useEffect, useState } from 'react'
import { reminderDefaults, renderReminder } from '@/modules/notifications/domain/reminders'
import { useI18n } from '@/i18n/LocaleProvider'
export default function ReminderSettings() {
  const { locale } = useI18n()
  const fa = locale === 'fa'
  const [form, setForm] = useState({ ...reminderDefaults })
  const [status, setStatus] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  async function load() {
    try {
      const response = await fetch('/api/admin/telegram/reminders')
      if (!response.ok) throw Error()
      const data = await response.json(); setForm(data.settings); setStatus(data)
    } catch { setMessage(fa ? 'دریافت تنظیمات هشدار ممکن نشد.' : 'Could not load alert settings.') }
  }
  useEffect(() => { void load() }, [])
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage('')
    try {
      const response = await fetch('/api/admin/telegram/reminders', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      const data = await response.json()
      if (!response.ok) throw Error(data.error)
      setMessage(fa ? 'تنظیمات هشدار ذخیره شد.' : 'Alert settings saved.'); await load()
    } catch (error) { setMessage(error instanceof Error ? error.message : fa ? 'ذخیره انجام نشد.' : 'Could not save.') }
    finally { setBusy(false) }
  }
  const values = { plan: fa ? 'پلن ماهانه' : 'Monthly plan', username: 'my-subscription', days: fa ? '۳' : '3', expiry: fa ? '۱۴۰۵/۱۰/۲۵' : '2027-01-15', remainingGB: fa ? '۱۰ GB' : '10 GB', remainingPercent: fa ? '۲۰' : '20' }
  const fields = [
    { fa: 'expiryTemplate', en: 'expiryTemplateEn', titleFa: 'هشدار نزدیک‌شدن انقضا', titleEn: 'Upcoming expiry' },
    { fa: 'trafficTemplate', en: 'trafficTemplateEn', titleFa: 'هشدار حجم', titleEn: 'Low traffic' },
    { fa: 'expiredTemplate', en: 'expiredTemplateEn', titleFa: 'پایان اعتبار', titleEn: 'Expired subscription' },
  ] as const
  return <form className="card mt-6" onSubmit={save}>
    <h2 className="font-bold text-lg mb-3">{fa ? 'هشدار حجم، نزدیک‌شدن انقضا و پایان اعتبار' : 'Traffic, expiry and renewal alerts'}</h2>
    <p className="muted text-sm mb-4">{fa ? 'اطلاعات تازهٔ پنل بررسی می‌شود. هر نوع هشدار برای هر دورهٔ اشتراک یک‌بار ارسال می‌شود؛ تمدید، دورهٔ تازه‌ای می‌سازد. حساب‌های بدون اتصال تلگرام و کاربرانی که اعلان را خاموش کرده‌اند کنار گذاشته می‌شوند.' : 'The panel is checked for current usage. Each alert type is sent once per subscription cycle; renewal starts a new cycle. Unlinked accounts and users who disabled alerts are skipped.'}</p>
    <label className="flex gap-2 mb-4"><input type="checkbox" checked={form.enabled} onChange={event => setForm({ ...form, enabled: event.target.checked })} />{fa ? 'ارسال خودکار هشدارها فعال باشد' : 'Enable automatic alerts'}</label>
    <div className="grid-2 mb-4"><label className="label">{fa ? 'چند روز پیش از انقضا؟' : 'Days before expiry'}<input type="number" min={1} max={30} required className="input mt-2" value={form.expiryDays} onChange={event => setForm({ ...form, expiryDays: Number(event.target.value) })} /></label><label className="label">{fa ? 'هشدار وقتی حجم باقی‌مانده کمتر یا مساوی این درصد است' : 'Alert when remaining traffic is at or below this percent'}<input type="number" min={1} max={90} required className="input mt-2" value={form.trafficPercent} onChange={event => setForm({ ...form, trafficPercent: Number(event.target.value) })} /></label></div>
    <p className="muted text-xs mb-3">{fa ? 'متغیرهای متن:' : 'Available placeholders:'} <bdi>{'{plan} · {username} · {days} · {expiry} · {remainingGB} · {remainingPercent}'}</bdi></p>
    <div className="space-y-4">{fields.map(group => <section key={group.fa} className="grid-2"><h3 className="font-bold" style={{ gridColumn: '1 / -1' }}>{fa ? group.titleFa : group.titleEn}</h3>{([['fa', group.fa], ['en', group.en]] as const).map(([language, key]) => <div key={key} dir={language === 'fa' ? 'rtl' : 'ltr'}><label className="label">{language === 'fa' ? 'فارسی' : 'English'}<textarea rows={6} maxLength={1500} required className="input mt-2" value={form[key]} onChange={event => setForm({ ...form, [key]: event.target.value })} /></label><details className="mt-3"><summary>{fa ? 'پیش‌نمایش نمونه (بدون ارسال)' : 'Preview (not sent)'}</summary><p className="muted text-sm mt-3" style={{ whiteSpace: 'pre-wrap' }}>{renderReminder(form[key], values)}</p></details></div>)}</section>)}</div>
    <div className="flex gap-2 mt-4"><button className="btn btn-primary" disabled={busy || !status}>{fa ? 'ذخیره تنظیمات هشدار' : 'Save alert settings'}</button><button type="button" className="btn btn-ghost" disabled={busy} onClick={load}>{fa ? 'تازه‌سازی وضعیت' : 'Refresh status'}</button></div>
    {status && <p className="muted text-sm mt-4">{fa ? 'ارسال موفق' : 'Sent'}: {status.sent} · {fa ? 'ناموفق / در انتظار تلاش' : 'Failed / retrying'}: {status.failed} · {fa ? 'نامشخص / در حال ارسال' : 'Unknown / sending'}: {status.uncertain}<br />{fa ? 'آخرین بررسی' : 'Last check'}: {status.lastRun ? new Date(status.lastRun.startedAt).toLocaleString(fa ? 'fa-IR' : 'en-US') : fa ? 'هنوز اجرا نشده' : 'Not run yet'}<br />{status.schedulerEnabled ? fa ? 'بررسی خودکار هر ۵ دقیقه، در دسته‌های حداکثر ۵۰ اشتراک. برای تعداد زیاد، تکمیل یک دور بیشتر طول می‌کشد.' : 'Automatic checks every 5 minutes in batches of up to 50 subscriptions. Large accounts may take longer to complete a full pass.' : fa ? 'زمان‌بند داخلی غیرفعال است؛ اجرای زمان‌بندی‌شدهٔ سرور لازم است.' : 'The internal scheduler is disabled; a server-side scheduled run is required.'}</p>}
    {message && <p role="status" className="mt-3">{message}</p>}
  </form>
}
