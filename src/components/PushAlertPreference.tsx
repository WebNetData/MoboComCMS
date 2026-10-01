'use client'

import { useEffect, useState } from 'react'
import { useI18n } from '@/i18n/LocaleProvider'

/** Controls account-event copies to browsers; the private inbox stays available. */
export default function PushAlertPreference() {
  const { locale } = useI18n()
  const fa = locale === 'fa'
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    fetch('/api/profile', { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => { if (data) setEnabled(data.pushAlerts !== false) })
      .catch(() => undefined)
  }, [])

  async function change(value: boolean) {
    setBusy(true)
    setMessage('')
    const response = await fetch('/api/profile', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pushAlerts: value }),
    }).catch(() => null)
    setBusy(false)
    if (response?.ok) {
      setEnabled(value)
      setMessage(fa ? 'ذخیره شد.' : 'Saved.')
    } else {
      setMessage(fa ? 'ذخیره انجام نشد؛ دوباره تلاش کنید.' : 'Could not save. Please try again.')
    }
  }

  if (enabled === null) return null
  return <section className="card mb-4 mt-4" dir={fa ? 'rtl' : 'ltr'}>
    <h2 className="font-bold mb-3">{fa ? 'اعلان مرورگر' : 'Browser notifications'}</h2>
    <label className="dash-switch">
      <span>{fa ? 'دریافت اعلان حساب در مرورگر' : 'Receive account notifications in your browsers'}
        <small>{fa ? 'اعلان‌های داخل حساب همیشه در دسترس‌اند.' : 'Your account inbox remains available.'}</small>
      </span>
      <input type="checkbox" role="switch" disabled={busy} checked={enabled} onChange={(event) => void change(event.target.checked)} />
    </label>
    {message && <p role="status" className="text-sm mt-3">{message}</p>}
  </section>
}
