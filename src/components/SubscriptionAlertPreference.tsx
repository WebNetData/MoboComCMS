'use client'
import { useEffect, useState } from 'react'
import { useI18n } from '@/i18n/LocaleProvider'
export default function SubscriptionAlertPreference() {
  const { locale } = useI18n()
  const fa = locale === 'fa'
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => {
    fetch('/api/profile').then(response => { if (!response.ok) throw Error(); return response.json() }).then(data => setEnabled(data.subscriptionAlerts === true)).catch(() => setMessage(fa ? 'دریافت تنظیمات اعلان ممکن نشد.' : 'Could not load notification preferences.'))
  }, [fa])
  async function change(value: boolean) {
    setBusy(true); setMessage('')
    try {
      const result = await fetch('/api/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscriptionAlerts: value }) })
      if (!result.ok) throw Error()
      setEnabled(value); setMessage(fa ? 'تنظیمات اعلان ذخیره شد.' : 'Notification preference saved.')
    } catch { setMessage(fa ? 'ذخیره انجام نشد؛ دوباره تلاش کنید.' : 'Could not save. Please try again.') }
    finally { setBusy(false) }
  }
  return <section className="card mb-4 mt-4"><h2 className="font-bold mb-3">{fa ? 'هشدار تمدید در تلگرام' : 'Telegram renewal alerts'}</h2><label className="flex items-center gap-2"><input type="checkbox" disabled={busy || enabled === null} checked={enabled === true} onChange={event => change(event.target.checked)} />{fa ? 'هشدار نزدیک‌شدن پایان حجم یا زمان اشتراک' : 'Notify me when data or time is running low'}</label><p className="muted text-xs mt-3">{fa ? 'برای دریافت پیام، حساب تلگرام باید متصل و ربات فعال باشد. این گزینه فقط هشدارهای تمدید را کنترل می‌کند.' : 'Requires a linked Telegram account and an active bot. This controls renewal reminders only.'}</p>{message && <p role="status" className="text-sm mt-3">{message}</p>}</section>
}
