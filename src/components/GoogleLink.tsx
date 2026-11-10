'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useI18n } from '@/i18n/LocaleProvider'
import { GoogleMark } from '@/components/GoogleMark'
import { GOOGLE_LOGIN_ERRORS, isGoogleLoginError } from '@/modules/identity/domain/google-login'

type Connection = { available: boolean; linked: boolean; email: string; linkedAt: string | null; canDisconnect: boolean }

/** The member's Google connection in account settings: connect (through Google), or disconnect while another way in remains. */
export default function GoogleLink() {
  const { locale } = useI18n()
  const fa = locale === 'fa'
  const params = useSearchParams()
  const [data, setData] = useState<Connection | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  // What Google's return says (?google=…); kept apart so loading the status cannot erase it.
  const [returned, setReturned] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/me/google', { cache: 'no-store' })
      if (!response.ok) throw Error()
      setData(await response.json()); setError('')
    } catch { setError(fa ? 'دریافت وضعیت اتصال گوگل ممکن نشد.' : 'Could not load the Google connection.') }
  }, [fa])
  useEffect(() => { void load() }, [load])

  // Back from Google with the result in the address (?google=linked or a reason).
  useEffect(() => {
    const result = params.get('google')
    if (!result) return
    if (result === 'linked') setReturned({ ok: true, text: fa ? 'حساب گوگل به این حساب وصل شد.' : 'Your Google account is connected.' })
    else if (isGoogleLoginError(result)) setReturned({ ok: false, text: GOOGLE_LOGIN_ERRORS[result] })
  }, [params, fa])

  async function disconnect() {
    if (!confirm(fa ? 'اتصال حساب گوگل قطع شود؟' : 'Disconnect your Google account?')) return
    setBusy(true); setError(''); setNotice(''); setReturned(null)
    const response = await fetch('/api/me/google', { method: 'DELETE' }).catch(() => null)
    setBusy(false)
    if (response?.ok) { setNotice(fa ? 'اتصال گوگل قطع شد.' : 'Google was disconnected.'); await load(); return }
    const body = await response?.json().catch(() => null)
    setError(body?.error || (fa ? 'قطع اتصال انجام نشد.' : 'Could not disconnect Google.'))
  }

  if (data && !data.available && !data.linked) return null
  return <section className="card mb-4 google-link" aria-labelledby="google-link-title">
    <h2 id="google-link-title" className="font-bold mb-2">{fa ? 'حساب گوگل' : 'Google account'}</h2>
    <p className="muted mb-3">{fa ? 'با اتصال گوگل، با یک کلیک و بدون رمز وارد همین حساب می‌شوید.' : 'Connect Google to sign in to this account in one click, without a password.'}</p>
    {!data ? <p className="muted" role="status">{fa ? 'در حال بررسی…' : 'Checking…'}</p>
      : data.linked ? <div className="google-link-row">
        <span className="google-link-who"><GoogleMark /><bdi dir="ltr">{data.email || (fa ? 'متصل' : 'Connected')}</bdi></span>
        {data.canDisconnect
          ? <button type="button" className="btn btn-ghost btn-sm" onClick={disconnect} disabled={busy}>{fa ? 'قطع اتصال' : 'Disconnect'}</button>
          : <small className="muted">{fa ? 'برای قطع اتصال، اول شمارهٔ موبایل را تأیید کنید یا رمز عبور بگذارید.' : 'To disconnect, first verify your mobile or set a password.'}</small>}
      </div>
      : <a className="auth-google google-link-connect" href="/api/login/google?intent=link&next=%2Fdashboard%2Fprofile"><GoogleMark /><span>{fa ? 'اتصال به گوگل' : 'Connect Google'}</span></a>}
    {returned && <p className={returned.ok ? 'success-text mt-2' : 'error-text mt-2'} role={returned.ok ? 'status' : 'alert'}>{returned.text}</p>}
    {notice && <p className="success-text mt-2" role="status">{notice}</p>}
    {error && <p className="error-text mt-2" role="alert">{error}</p>}
  </section>
}
