'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { signOut } from 'next-auth/react'
import Link from '@/components/AppLink'
import BrandLockup from '@/components/site/SiteLogo'
import { useSite } from '@/components/site/SiteProvider'
import LocationPicker, { type Pin } from '@/components/site/LocationPicker'
import { PROVINCES } from '@/modules/shipping/domain/shipping'
import { authEntryHref, safeNext } from '@/modules/identity/domain/continuation'
import { PasswordInput } from '@/app/login/AuthFields'
import PhoneStep from './PhoneStep'

type Field = { key: string; label: string; type: string; builtin?: string; required: boolean; placeholder: string; help: string; options: string[] }
type Address = { province: string; city: string; address: string; plaque: string; unit: string; postalCode: string; mobile: string; lat: number | null; lng: number | null }
type Status = {
  needsCompletion: boolean; needsPasswordSetup: boolean; missing: string[]; intro: string; fields: Field[]
  values: { firstName: string; lastName: string; username: string; email: string; emailLocked: boolean; phone: string; phoneVerified: boolean; address: (Address & { id: number }) | null; custom: Record<string, string | boolean> }
}

const EMPTY_ADDRESS: Address = { province: '', city: '', address: '', plaque: '', unit: '', postalCode: '', mobile: '', lat: null, lng: null }

/** «تکمیل مشخصات»: the first stop after sign-up until the required fields are filled. */
export default function WelcomePage() {
  const site = useSite()
  const [status, setStatus] = useState<Status | null>(null)
  const [values, setValues] = useState<Record<string, unknown>>({})
  const [address, setAddress] = useState<Address>(EMPTY_ADDRESS)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [next, setNext] = useState('/dashboard')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    const destination = safeNext(new URLSearchParams(window.location.search).get('next')) || '/dashboard'
    setNext(destination)
    fetch('/api/profile/completion', { cache: 'no-store', signal: controller.signal }).then(async (response) => {
      if (response.status === 401) { window.location.replace(authEntryHref('/login', destination)); return }
      const data = await response.json().catch(() => null) as Status | null
      if (controller.signal.aborted) return
      if (!response.ok || !data?.values) { setMessage('بارگذاری انجام نشد؛ دوباره تلاش کنید.'); return }
      setStatus(data)
      setValues({ firstName: data.values.firstName, lastName: data.values.lastName, username: '', email: data.values.email, ...data.values.custom })
      setAddress(data.values.address ? { ...EMPTY_ADDRESS, ...data.values.address } : { ...EMPTY_ADDRESS, mobile: data.values.phone })
    }).catch(() => { if (!controller.signal.aborted) setMessage('ارتباط برقرار نشد.') })
    return () => controller.abort()
  }, [retry])

  if (!status) return <main className="wl" dir="rtl"><div className="wl-card">{message ? <><p className="dash-note is-error" role="alert">{message}</p><button type="button" className="btn btn-primary" onClick={() => { setMessage(''); setRetry(value => value + 1) }}>تلاش دوباره</button></> : <div className="pp-skeleton" aria-busy="true" role="status" aria-label="در حال دریافت مشخصات" />}</div></main>

  const set = (key: string, value: unknown) => { setMessage(''); setValues((current) => ({ ...current, [key]: value })); setErrors((current) => { const copy = { ...current }; delete copy[key]; return copy }) }
  const setAddr = (patch: Partial<Address>) => { setMessage(''); setAddress((current) => ({ ...current, ...patch })); setErrors((current) => { const copy = { ...current }; delete copy.address; return copy }) }
  const has = (builtin: string) => status.fields.find((field) => field.builtin === builtin)
  const phoneField = has('phone')
  // A verified mobile changes what is missing; typed values elsewhere on the page stay as they are.
  const refreshStatus = () => fetch('/api/profile/completion', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((data: Status | null) => {
    if (data?.values) { setStatus(data); setErrors((current) => { const copy = { ...current }; delete copy.phone; return copy }) }
  }).catch(() => undefined)
  const personal = status.fields.filter((field) => ['firstName', 'lastName', 'username', 'email'].includes(field.builtin || ''))
  const addressField = has('address')
  const custom = status.fields.filter((field) => !field.builtin)
  const req = (field: Field) => field.required ? <b className="wl-req" aria-hidden="true">*</b> : <small className="wl-opt">(اختیاری)</small>
  const err = (key: string) => errors[key] ? <small id={`wl-${key}-error`} className="wl-error" role="alert">{errors[key]}</small> : null

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true); setMessage(''); setErrors({})
    const addressFilled = Object.entries(address).some(([key, item]) => !['lat', 'lng', 'mobile'].includes(key) && String(item ?? '').trim())
    const response = await fetch('/api/profile/completion', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...values, ...(status?.needsPasswordSetup ? { password, confirmPassword } : {}), ...(addressField && addressFilled ? { address } : {}) }) }).catch(() => null)
    const data = await response?.json().catch(() => null)
    setBusy(false)
    if (!response?.ok) {
      setErrors(data?.errors || {}); setMessage(data?.error || 'ذخیره انجام نشد')
      requestAnimationFrame(() => document.querySelector('.wl-error')?.closest('.wl-field, fieldset')?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
      return
    }
    if (data?.signInRequired) { await signOut({ callbackUrl: authEntryHref('/login', next, { setup: '1' }) }); return }
    if ((data as Status).needsCompletion) { setStatus(data); setMessage('هنوز چند مورد ضروری باقی مانده است.'); return }
    window.location.replace(next)
  }

  function input(field: Field) {
    const value = values[field.key]
    const common = { id: `wl-${field.key}`, className: 'input', value: typeof value === 'string' ? value : '', placeholder: field.placeholder, 'aria-invalid': !!errors[field.key], onChange: (e: { target: { value: string } }) => set(field.key, e.target.value) }
    switch (field.type) {
      case 'textarea': return <textarea {...common} rows={3} />
      case 'select': return <select {...common} className="select"><option value="">انتخاب کنید</option>{field.options.map((option) => <option key={option}>{option}</option>)}</select>
      case 'radio': return <div className="wl-radios" role="radiogroup" aria-labelledby={`wl-${field.key}-label`}>{field.options.map((option) => <label key={option} className="wl-radio"><input type="radio" name={field.key} checked={value === option} onChange={() => set(field.key, option)} />{option}</label>)}</div>
      case 'checkbox': return <label className="wl-check"><input type="checkbox" checked={value === true} onChange={(e) => set(field.key, e.target.checked)} />{field.placeholder || 'بله'}</label>
      case 'number': case 'tel': case 'postalCode': case 'nationalId': return <input {...common} inputMode="numeric" dir="ltr" />
      case 'email': case 'url': return <input {...common} dir="ltr" type={field.type === 'email' ? 'email' : 'url'} />
      case 'date': return <input {...common} dir="ltr" placeholder={field.placeholder || '۱۳۷۰/۰۵/۲۰'} />
      default: return <input {...common} />
    }
  }

  const missingCount = status.missing.length
  const requiredCount = status.fields.filter((field) => field.required).length + (status.needsPasswordSetup ? 1 : 0)
  const progress = requiredCount ? Math.round(((requiredCount - Math.min(missingCount, requiredCount)) / requiredCount) * 100) : 100
  return <main className="wl" dir="rtl">
    <form className="wl-card" onSubmit={submit} noValidate>
      <header className="wl-head">
        <Link href="/" className="wl-brand"><BrandLockup /></Link>
        <h1>{status.needsCompletion ? 'خوش آمدید! مشخصات خود را تکمیل کنید' : 'مشخصات حساب'}</h1>
        {status.intro && <p>{status.intro}</p>}
        {status.needsCompletion && <div className="wl-progress">
          <span className="wl-badge">{missingCount.toLocaleString('fa-IR')} مورد ضروری باقی مانده</span>
          <span className="wl-meter" role="progressbar" aria-label="پیشرفت تکمیل مشخصات" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ inlineSize: `${progress}%` }} /></span>
        </div>}
      </header>

      {phoneField && <PhoneStep phone={status.values.phone} verified={status.values.phoneVerified} required={phoneField.required} label={phoneField.label} help={phoneField.help} error={errors.phone} onVerified={() => void refreshStatus()} />}

      {personal.length > 0 && <section className="wl-section">
        <h2>مشخصات فردی</h2>
        <div className="dash-grid">
          {personal.map((field) => <div key={field.key} className="wl-field">
            <label htmlFor={`wl-${field.key}`}>{field.label} {req(field)}</label>
            {field.builtin === 'username'
              ? <span className="pe-prefix" dir="ltr"><span>@</span><input id="wl-username" className="input" value={String(values.username || '')} maxLength={20} placeholder={status.values.username} onChange={(e) => set('username', e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} /></span>
              : field.builtin === 'email' && status.values.emailLocked
                ? <input id="wl-email" className="input" dir="ltr" value={status.values.email} readOnly />
                : <input id={`wl-${field.key}`} className="input" dir={field.builtin === 'email' ? 'ltr' : undefined} type={field.builtin === 'email' ? 'email' : 'text'} autoComplete={field.builtin === 'firstName' ? 'given-name' : field.builtin === 'lastName' ? 'family-name' : field.builtin === 'email' ? 'email' : undefined} value={String(values[field.key] || '')} maxLength={field.builtin === 'email' ? 190 : 40} placeholder={field.placeholder} required={field.required} aria-describedby={errors[field.key] ? `wl-${field.key}-error` : undefined} aria-invalid={!!errors[field.key]} onChange={(e) => set(field.key, e.target.value)} />}
            {field.builtin === 'username' && <small>خالی بگذارید تا همین نام بماند: <bdi dir="ltr">@{status.values.username}</bdi></small>}
            {field.help && field.builtin !== 'username' && <small>{field.help}</small>}
            {err(field.key)}
          </div>)}
        </div>
      </section>}

      {status.needsPasswordSetup && <section className="wl-section" aria-labelledby="wl-password-title">
        <h2 id="wl-password-title">رمز حساب خود را بسازید</h2>
        <p className="wl-help" id="wl-password-help">با این رمز می‌توانید علاوه بر کد پیامکی، با موبایل یا ایمیل وارد شوید. دست‌کم ۸ کاراکتر و یک رمز غیرقابل‌حدس انتخاب کنید.</p>
        <div className="dash-grid">
          <div className="wl-field"><label htmlFor="wl-password">رمز عبور <b className="wl-req" aria-hidden="true">*</b></label><PasswordInput fa id="wl-password" autoComplete="new-password" minLength={8} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} required aria-invalid={!!errors.password} aria-describedby={`wl-password-help${errors.password ? ' wl-password-error' : ''}`} />{err('password')}</div>
          <div className="wl-field"><label htmlFor="wl-confirm">تکرار رمز عبور <b className="wl-req" aria-hidden="true">*</b></label><PasswordInput fa id="wl-confirm" autoComplete="new-password" minLength={8} maxLength={128} value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} required aria-invalid={!!errors.confirmPassword} aria-describedby={errors.confirmPassword ? 'wl-confirmPassword-error' : undefined} />{err('confirmPassword')}</div>
        </div>
      </section>}

      {addressField && <fieldset className="wl-section">
        <legend><h2>{addressField.label} {req(addressField)}</h2></legend>
        {addressField.help && <p className="wl-help">{addressField.help}</p>}
        <div className="dash-grid">
          <div className="wl-field"><label htmlFor="wl-province">استان</label><select id="wl-province" className="select" value={address.province} autoComplete="address-level1" onChange={(e) => setAddr({ province: e.target.value })}><option value="">انتخاب استان</option>{PROVINCES.map((province) => <option key={province}>{province}</option>)}</select></div>
          <div className="wl-field"><label htmlFor="wl-city">شهر</label><input id="wl-city" className="input" value={address.city} maxLength={60} autoComplete="address-level2" onChange={(e) => setAddr({ city: e.target.value })} /></div>
        </div>
        <div className="wl-field"><label htmlFor="wl-address">نشانی پستی</label><input id="wl-address" className="input" value={address.address} maxLength={400} autoComplete="street-address" placeholder="خیابان، کوچه، نام ساختمان" onChange={(e) => setAddr({ address: e.target.value })} /></div>
        <div className="dash-grid is-3">
          <div className="wl-field"><label htmlFor="wl-plaque">پلاک</label><input id="wl-plaque" className="input" dir="ltr" inputMode="numeric" maxLength={10} value={address.plaque} onChange={(e) => setAddr({ plaque: e.target.value })} /></div>
          <div className="wl-field"><label htmlFor="wl-unit">واحد</label><input id="wl-unit" className="input" dir="ltr" inputMode="numeric" maxLength={10} value={address.unit} onChange={(e) => setAddr({ unit: e.target.value })} /></div>
          <div className="wl-field"><label htmlFor="wl-postal">کد پستی ده‌رقمی</label><input id="wl-postal" className="input" dir="ltr" inputMode="numeric" maxLength={12} autoComplete="postal-code" value={address.postalCode} placeholder="۱۲۳۴۵۶۷۸۹۰" onChange={(e) => setAddr({ postalCode: e.target.value })} /></div>
        </div>
        <div className="wl-field"><label htmlFor="wl-mobile">موبایل تحویل‌گیرنده</label><input id="wl-mobile" className="input" dir="ltr" inputMode="tel" maxLength={16} autoComplete="tel" value={address.mobile} placeholder="۰۹۱۲۱۲۳۴۵۶۷" onChange={(e) => setAddr({ mobile: e.target.value })} /></div>
        <div className="wl-field"><span className="wl-label">موقعیت روی نقشه <small className="wl-opt">(اختیاری)</small></span>
          <LocationPicker value={address.lat != null && address.lng != null ? { lat: address.lat, lng: address.lng } : null} onChange={(pin: Pin) => setAddr({ lat: pin?.lat ?? null, lng: pin?.lng ?? null })} province={address.province} city={address.city} street={address.address} />
        </div>
        {err('address')}
      </fieldset>}

      {custom.length > 0 && <section className="wl-section">
        <h2>اطلاعات تکمیلی</h2>
        <div className="dash-grid">{custom.map((field) => <div key={field.key} className={`wl-field${field.type === 'textarea' ? ' wl-wide' : ''}`}>
          <label id={`wl-${field.key}-label`} htmlFor={`wl-${field.key}`}>{field.label} {req(field)}</label>
          {input(field)}
          {field.help && <small>{field.help}</small>}
          {err(field.key)}
        </div>)}</div>
      </section>}

      {message && <p className="dash-note is-error" role="alert">{message}</p>}
      <footer className="wl-foot">
        {/* A member who cannot finish now, or signed in with the wrong account, must be able to leave. */}
        {status.needsCompletion && <button type="button" className="btn btn-ghost" onClick={() => void signOut({ callbackUrl: '/' })}>خروج از حساب</button>}
        {!status.needsCompletion && <Link href={next} className="btn btn-ghost">بازگشت</Link>}
        <button type="submit" className="btn btn-primary wl-submit" disabled={busy}>{busy ? 'در حال ذخیره…' : status.needsPasswordSetup ? 'ذخیره و ورود با رمز جدید' : status.needsCompletion ? 'ذخیره و ادامه' : 'ذخیره'}</button>
      </footer>
    </form>
  </main>
}
