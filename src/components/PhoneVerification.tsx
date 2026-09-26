'use client'

import { useEffect, useState } from 'react'

type Profile = { phone: string; phoneVerified: boolean; smsAlerts: boolean }

/** Verify the mobile number with an SMS code; verified numbers receive order, payment and support alerts. */
export default function PhoneVerification() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [sentTo, setSentTo] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)

  useEffect(() => {
    fetch('/api/profile').then((r) => (r.ok ? r.json() : null)).then((data) => {
      if (!data) return
      setProfile({ phone: data.phone || '', phoneVerified: !!data.phoneVerified, smsAlerts: data.smsAlerts !== false })
      setPhone(data.phone || '')
    })
  }, [])

  async function call(method: 'POST' | 'PUT', body: Record<string, string>) {
    setBusy(true); setMessage(null)
    const res = await fetch('/api/me/phone', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null)
    const data = await res?.json().catch(() => null)
    setBusy(false)
    if (!res?.ok) { setMessage({ text: data?.error || 'انجام نشد', ok: false }); return null }
    return data
  }

  async function toggleAlerts(value: boolean) {
    const res = await fetch('/api/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ smsAlerts: value }) })
    if (res.ok) setProfile((current) => current && { ...current, smsAlerts: value })
  }

  if (!profile) return null
  return (
    <section className="card phone-verify max-w-3xl mb-6">
      <div className="phone-verify-head">
        <div>
          <h3 className="font-bold">شمارهٔ موبایل و اطلاع‌رسانی پیامکی</h3>
          <p className="muted">با شمارهٔ تأییدشده می‌توانید با کد پیامکی وارد شوید و وضعیت سفارش، پرداخت و پشتیبانی را پیامک بگیرید.</p>
        </div>
        {profile.phoneVerified ? <span className="badge badge-green">تأییدشده: <span dir="ltr">{profile.phone.replace(/^\+98/, '0')}</span></span> : <span className="badge badge-amber">تأیید نشده</span>}
      </div>
      {!sentTo ? (
        <form className="phone-verify-row" onSubmit={async (e) => { e.preventDefault(); const data = await call('POST', { phone }); if (data) setSentTo(data.display) }}>
          <input className="input" type="tel" inputMode="numeric" dir="ltr" placeholder="09121234567" value={phone} onChange={(e) => setPhone(e.target.value)} aria-label="شمارهٔ موبایل" required />
          <button className="btn btn-primary" disabled={busy}>{profile.phoneVerified ? 'تغییر و تأیید شماره' : 'ارسال کد تأیید'}</button>
        </form>
      ) : (
        <form className="phone-verify-row" onSubmit={async (e) => {
          e.preventDefault()
          const data = await call('PUT', { phone, code })
          if (data) { setProfile({ ...profile, phone: data.phone, phoneVerified: true }); setSentTo(''); setCode(''); setMessage({ text: 'شمارهٔ موبایل تأیید شد.', ok: true }) }
        }}>
          <input className="input auth-otp" inputMode="numeric" autoComplete="one-time-code" dir="ltr" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/[^0-9۰-۹]/g, ''))} aria-label={`کد ارسال‌شده به ${sentTo}`} placeholder="------" required autoFocus />
          <button className="btn btn-primary" disabled={busy || code.length < 6}>تأیید</button>
          <button type="button" className="btn btn-ghost" onClick={() => { setSentTo(''); setCode('') }}>انصراف</button>
        </form>
      )}
      {sentTo && <p className="muted mt-2">کد ۶ رقمی به {sentTo} ارسال شد.</p>}
      <label className="phone-verify-toggle"><input type="checkbox" checked={profile.smsAlerts} onChange={(e) => void toggleAlerts(e.target.checked)} /> دریافت پیامک وضعیت سفارش‌ها، پرداخت‌ها و تیکت‌ها</label>
      {message && <p className={message.ok ? 'success-text mt-2' : 'error-text mt-2'} role="status">{message.text}</p>}
    </section>
  )
}
