'use client'
import { useEffect, useState } from 'react'
import { useModuleEnabled } from '@/extensions/client/ExtensionProvider'

/** Lets a customer turn off the email copies of their notifications. */
export default function EmailAlertPreference() {
  const [state, setState] = useState<{ email: string; enabled: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const vpnOn = useModuleEnabled('vpn')
  useEffect(() => {
    fetch('/api/profile').then((response) => (response.ok ? response.json() : null)).then((data) => { if (data) setState({ email: data.email || '', enabled: data.emailAlerts !== false }) }).catch(() => null)
  }, [])
  // Accounts created with a mobile number have no real inbox.
  if (!state || /@(phone|bot)\.mobocom\.local$|@telegram\.local$/.test(state.email)) return null
  async function change(value: boolean) {
    setBusy(true); setMessage('')
    const response = await fetch('/api/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ emailAlerts: value }) }).catch(() => null)
    setBusy(false)
    if (response?.ok) { setState((current) => current && { ...current, enabled: value }); setMessage('ذخیره شد.') } else setMessage('ذخیره انجام نشد؛ دوباره تلاش کنید.')
  }
  return <section className="card mb-4 mt-4" dir="rtl">
    <h2 className="font-bold mb-3">اطلاع‌رسانی ایمیلی</h2>
    <label className="dash-switch"><span>{vpnOn ? 'ایمیل وضعیت پرداخت، سفارش، تیکت و اشتراک' : 'ایمیل وضعیت پرداخت، سفارش و تیکت'}<small>به <bdi dir="ltr">{state.email}</bdi></small></span><input type="checkbox" role="switch" disabled={busy} checked={state.enabled} onChange={(event) => void change(event.target.checked)} /></label>
    {message && <p role="status" className="text-sm mt-3">{message}</p>}
  </section>
}
