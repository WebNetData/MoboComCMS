'use client'

import { useCallback, useEffect, useState } from 'react'
import { useI18n } from '@/i18n/LocaleProvider'
import styles from './AccountSecurity.module.css'

type Policy = { password: boolean; sms: boolean; email: boolean; telegram: boolean; google: boolean }
type Account = { id: number; name: string; phone: string; email: string; phoneVerified: boolean; loginPolicy: Policy; connected: { telegram: boolean; google: boolean } }
type View = { account: Account; revision: string; canManage: boolean; refusal: string | null; generatedPassword?: string }
type Profile = Pick<Account, 'name' | 'phone' | 'email' | 'phoneVerified'>
type Action = 'profile' | 'password' | 'login-policy' | 'revoke-sessions'

export default function AccountSecurity({ userId, onSaved }: { userId: number; onSaved: () => void }) {
  const { locale } = useI18n()
  const fa = locale === 'fa'
  const [view, setView] = useState<View | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [policy, setPolicy] = useState<Policy | null>(null)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [generated, setGenerated] = useState('')
  const [note, setNote] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [conflict, setConflict] = useState(false)
  const tr = (en: string, persian: string) => fa ? persian : en

  const load = useCallback(async (keepDrafts = false) => {
    setPending(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/users/${userId}/account`, { cache: 'no-store' })
      if (!res.ok) throw new Error()
      const data: View = await res.json()
      setView(data)
      if (!keepDrafts) {
        const { name, phone, email, phoneVerified, loginPolicy } = data.account
        setProfile({ name, phone, email, phoneVerified })
        setPolicy(loginPolicy)
      }
      setConflict(false)
      if (keepDrafts) setStatus(fa ? 'اطلاعات تازه شد؛ پیش‌نویس شما حفظ شد. پیش از ذخیره آن را بررسی کنید.' : 'Account reloaded. Your drafts were kept; review them before saving.')
    } catch {
      setError(fa ? 'دریافت اطلاعات حساب ناموفق بود.' : 'Could not load account details.')
    } finally { setPending(false) }
  }, [userId, fa])

  useEffect(() => { void load() }, [load])

  async function save(action: Action, extra: object = {}) {
    if (!view || pending) return
    if (note.trim().length < 3 || note.length > 300) {
      setError(tr('Enter a reason of 3 to 300 characters.', 'دلیل تغییر را در ۳ تا ۳۰۰ نویسه وارد کنید.'))
      return
    }
    setPending(true); setError(''); setStatus(''); setGenerated('')
    try {
      const res = await fetch(`/api/admin/users/${userId}/account`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, revision: view.revision, note: note.trim(), ...extra }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        if (res.status === 409) setConflict(true)
        setError(typeof data?.error === 'string' ? data.error : tr('The change could not be saved.', 'ذخیره تغییر ناموفق بود.'))
        return
      }
      const next = data as View
      setView(next)
      if (action === 'profile') {
        const { name, phone, email, phoneVerified } = next.account
        setProfile({ name, phone, email, phoneVerified })
      }
      if (action === 'login-policy') setPolicy(next.account.loginPolicy)
      if (action === 'password') { setPassword(''); setGenerated(next.generatedPassword || '') }
      setNote(''); setConflict(false); setStatus(tr('Change saved.', 'تغییر ذخیره شد.'))
      onSaved()
    } catch {
      setError(tr('The request failed. Please try again.', 'درخواست ناموفق بود. دوباره تلاش کنید.'))
    } finally { setPending(false) }
  }

  const disabled = pending || !view?.canManage || conflict
  const methods: [keyof Policy, string, string][] = [
    ['password', 'Password', 'رمز عبور'], ['sms', 'SMS one-time code', 'کد یک‌بارمصرف پیامکی'],
    ['email', 'Email one-time code', 'کد یک‌بارمصرف ایمیلی'], ['telegram', 'Telegram', 'تلگرام'], ['google', 'Google', 'گوگل'],
  ]

  return <section className={styles.card} aria-labelledby={`account-title-${userId}`} aria-busy={pending}>
    <header><h2 id={`account-title-${userId}`}>{tr('Account and sign-in', 'حساب و ورود')}</h2><p>{tr('Manage contact details, sign-in methods and sessions.', 'اطلاعات تماس، روش‌های ورود و نشست‌ها را مدیریت کنید.')}</p><p className={styles.help}>{tr('Saving any of these changes signs this account out on all devices. Editing your own account requires signing in again.', 'ذخیره هر یک از این تغییرات، نشست‌های فعال این حساب را می‌بندد. با تغییر حساب خودتان باید دوباره وارد شوید.')}</p></header>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {status && <p className={styles.status} role="status">{status}</p>}
    {conflict && <div className={styles.notice}><p>{tr('The account changed since it was loaded. Reload the latest version and review your drafts.', 'حساب پس از دریافت تغییر کرده است. نسخه تازه را دریافت و پیش‌نویس‌ها را بررسی کنید.')}</p><button type="button" className="btn btn-ghost" disabled={pending} onClick={() => void load(true)}>{tr('Reload account', 'دریافت دوباره حساب')}</button></div>}
    {!view && !pending && <button type="button" className="btn btn-ghost" onClick={() => void load()}>{tr('Retry', 'تلاش دوباره')}</button>}
    {!view && pending && <p role="status">{tr('Loading account…', 'در حال دریافت حساب…')}</p>}
    {view && profile && policy && <>
      {!view.canManage && <p className={styles.notice}>{view.refusal || tr('You cannot manage this account.', 'امکان مدیریت این حساب را ندارید.')}</p>}
      <div className={styles.sections}>
        <form onSubmit={e => { e.preventDefault(); void save('profile', profile) }} className={styles.group}>
          <h3>{tr('Contact details', 'اطلاعات تماس')}</h3>
          <fieldset disabled={disabled} className={styles.fields}>
            <label>{tr('Name', 'نام')}<input className="input" value={profile.name} onChange={e => setProfile({ ...profile, name: e.target.value })} /></label>
            <label>{tr('Mobile phone', 'تلفن همراه')}<input className="input" dir="ltr" type="tel" value={profile.phone} onChange={e => setProfile({ ...profile, phone: e.target.value })} /></label>
            <label>{tr('Email (optional)', 'ایمیل (اختیاری)')}<input className="input" dir="ltr" type="email" value={profile.email} onChange={e => setProfile({ ...profile, email: e.target.value })} aria-describedby={`account-email-help-${userId}`} /></label>
            <p id={`account-email-help-${userId}`} className={styles.help}>{tr('A mobile number is required when email is blank.', 'اگر ایمیل خالی است، شماره همراه لازم است.')}</p>
            <label className={styles.check}><input type="checkbox" checked={profile.phoneVerified} onChange={e => setProfile({ ...profile, phoneVerified: e.target.checked })} />{tr('Administratively confirm phone verification', 'تأیید مدیریتی شماره تلفن')}</label>
            <p className={styles.help}>{tr('This is an administrative confirmation; it does not send or verify a code.', 'این تأیید مدیریتی است و کدی ارسال یا بررسی نمی‌کند.')}</p>
            <button className="btn btn-primary" type="submit">{tr('Save contact details', 'ذخیره اطلاعات تماس')}</button>
          </fieldset>
        </form>
        <form onSubmit={e => { e.preventDefault(); void save('password', { password }) }} className={styles.group}>
          <h3>{tr('Set a new password', 'تعیین رمز عبور جدید')}</h3><p className={styles.help}>{tr('Existing passwords are never displayed. Use 12–128 characters.', 'رمز فعلی نمایش داده نمی‌شود. از ۱۲ تا ۱۲۸ نویسه استفاده کنید.')}</p>
          <fieldset disabled={disabled} className={styles.fields}>
            <label>{tr('New password', 'رمز عبور جدید')}<input className="input" dir="ltr" type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength={12} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} /></label>
            <label className={styles.check}><input type="checkbox" checked={showPassword} onChange={e => setShowPassword(e.target.checked)} />{tr('Show new password', 'نمایش رمز جدید')}</label>
            <div className={styles.actions}><button className="btn btn-primary" type="submit" disabled={password.length < 12}>{tr('Set password', 'ثبت رمز')}</button><button className="btn btn-ghost" type="button" onClick={() => void save('password', { generate: true })}>{tr('Generate password', 'ساخت رمز')}</button></div>
          </fieldset>
          {generated && <div className={styles.notice}><p>{tr('Copy this password now; it will not be shown again.', 'رمز را اکنون کپی کنید؛ دوباره نمایش داده نمی‌شود.')}</p><output className={styles.secret} dir="ltr">{generated}</output><button type="button" className="btn btn-ghost" onClick={() => { void navigator.clipboard.writeText(generated).then(() => setStatus(tr('Password copied.', 'رمز کپی شد.'))).catch(() => setError(tr('Copy failed; select the password to copy it.', 'کپی ناموفق بود؛ رمز را انتخاب و کپی کنید.'))) }}>{tr('Copy password', 'کپی رمز')}</button></div>}
        </form>
        <form onSubmit={e => { e.preventDefault(); void save('login-policy', { loginPolicy: policy }) }} className={styles.group}>
          <h3>{tr('Allowed sign-in methods', 'روش‌های مجاز ورود')}</h3>
          <fieldset disabled={disabled} className={styles.fields}><legend className={styles.help}>{tr('Choose which methods this account may use.', 'روش‌های قابل استفاده برای این حساب را انتخاب کنید.')}</legend>
            {methods.map(([key, en, persian]) => <label className={styles.check} key={key}><input type="checkbox" checked={policy[key]} onChange={e => setPolicy({ ...policy, [key]: e.target.checked })} />{tr(en, persian)}</label>)}
            <button className="btn btn-primary" type="submit">{tr('Save sign-in methods', 'ذخیره روش‌های ورود')}</button>
          </fieldset>
          <p className={styles.help}>{tr('Connected accounts', 'حساب‌های متصل')}: Google {view.account.connected.google ? tr('connected', 'متصل') : tr('not connected', 'متصل نیست')} · Telegram {view.account.connected.telegram ? tr('connected', 'متصل') : tr('not connected', 'متصل نیست')}</p>
        </form>
        <div className={styles.group}><h3>{tr('Sessions', 'نشست‌ها')}</h3><p className={styles.help}>{tr('Sign this account out on all devices.', 'این حساب را در همه دستگاه‌ها خارج کنید.')}</p><button type="button" className="btn btn-ghost" disabled={disabled} onClick={() => void save('revoke-sessions')}>{tr('Sign out on all devices', 'خروج از همه دستگاه‌ها')}</button></div>
      </div>
      <label className={styles.reason}>{tr('Reason for change (required for every action)', 'دلیل تغییر (برای هر اقدام الزامی است)')}<textarea className="input" rows={2} minLength={3} maxLength={300} disabled={disabled} value={note} onChange={e => setNote(e.target.value)} /></label>
    </>}
  </section>
}
