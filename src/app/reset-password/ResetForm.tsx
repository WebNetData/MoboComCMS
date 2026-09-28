'use client'

import { useEffect, useState } from 'react'
import Link from '@/components/AppLink'
import Icon from '@/components/site/Icon'
import PasswordField from '@/components/PasswordField'

/** The page an emailed reset link opens. The token is moved out of the address bar right away. */
export default function ResetForm() {
  const [token, setToken] = useState('')
  const [state, setState] = useState<'checking' | 'invalid' | 'ready' | 'done'>('checking')
  const [twoFactor, setTwoFactor] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [totp, setTotp] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get('token') || ''
    window.history.replaceState(window.history.state, '', '/reset-password')
    setToken(value)
    if (!value) { setState('invalid'); return }
    fetch(`/api/password/reset?token=${encodeURIComponent(value)}`, { cache: 'no-store' })
      .then((r) => r.json()).then((data) => { setTwoFactor(!!data?.twoFactor); setState(data?.valid ? 'ready' : 'invalid') })
      .catch(() => setState('invalid'))
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) { setError('تکرار رمز با رمز تازه یکی نیست.'); return }
    setBusy(true); setError('')
    const response = await fetch('/api/password/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, password, totp: twoFactor ? totp : undefined }) }).catch(() => null)
    const data = await response?.json().catch(() => null)
    setBusy(false)
    if (!response?.ok) {
      if (response?.status === 410) setState('invalid')
      setError(data?.error || 'انجام نشد؛ دوباره تلاش کنید.')
      return
    }
    setState('done')
  }

  const heading = <>
    <span className="auth-form-icon"><Icon name="shield" size={25} /></span>
    <p className="auth-form-eyebrow">بازیابی حساب</p>
    <h1>انتخاب رمز تازه</h1>
  </>

  if (state === 'checking') return <div className="auth-form" aria-busy="true">{heading}<p className="auth-form-intro">در حال بررسی پیوند…</p></div>
  if (state === 'invalid') return <div className="auth-form">
    {heading}
    <p className="error-text" role="alert">{error || 'این پیوند منقضی شده یا قبلاً استفاده شده است. پیوندهای بازیابی ۳۰ دقیقه اعتبار دارند.'}</p>
    <Link href="/forgot-password" className="btn btn-primary w-full mt-2">درخواست پیوند تازه</Link>
    <p className="auth-back"><Link href="/login">← بازگشت به ورود</Link></p>
  </div>
  if (state === 'done') return <div className="auth-form" role="status">
    {heading}
    <p className="success-text">رمز عبور شما تغییر کرد و همهٔ نشست‌های قبلی خارج شدند.</p>
    <Link href="/login" className="btn btn-primary w-full mt-2">ورود با رمز تازه</Link>
  </div>

  return <form className="auth-form" onSubmit={submit} aria-busy={busy}>
    {heading}
    <p className="auth-form-intro">رمزی انتخاب کنید که جای دیگری استفاده نکرده‌اید.</p>
    <PasswordField id="reset-password" label="رمز عبور تازه" value={password} onChange={setPassword} />
    <PasswordField id="reset-confirm" label="تکرار رمز عبور تازه" value={confirm} onChange={setConfirm} meter={false} />
    {twoFactor && <div className="mb-4">
      <label className="label" htmlFor="reset-totp">کد ورود دو مرحله‌ای</label>
      <input id="reset-totp" className="input auth-otp" type="text" autoComplete="one-time-code" dir="ltr" maxLength={11} value={totp} onChange={(e) => setTotp(e.target.value)} required />
      <small className="muted">حساب شما با ورود دو مرحله‌ای محافظت می‌شود؛ کد برنامه یا یک کد پشتیبان را وارد کنید.</small>
    </div>}
    {error && <p className="error-text" role="alert">{error}</p>}
    <button className="btn btn-primary w-full mt-2" disabled={busy || password.length < 8 || !confirm}>{busy ? <><span className="auth-spinner" aria-hidden="true" />در حال ذخیره…</> : 'ذخیرهٔ رمز تازه'}</button>
  </form>
}
