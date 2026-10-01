'use client'

import { useEffect, useState, type FormEvent } from 'react'
import Link from '@/components/AppLink'
import SubscriptionAlertPreference from '@/components/SubscriptionAlertPreference'
import TelegramLink from '@/components/TelegramLink'
import PhoneVerification from '@/components/PhoneVerification'
import EmailAlertPreference from '@/components/EmailAlertPreference'
import PushAlertPreference from '@/components/PushAlertPreference'
import TwoFactorCard from '@/components/TwoFactorCard'
import { useI18n } from '@/i18n/LocaleProvider'
import { useModuleEnabled } from '@/extensions/client/ExtensionProvider'

const COLORS = ['#4b45ee', '#7c3aed', '#db2777', '#e11d48', '#ea580c', '#d97706', '#16a34a', '#0d9488', '#0284c7', '#475569']

type Account = { name: string; email: string; avatarColor: string }

/** Account settings: identity, sign-in security, and every notification channel in one place. */
export default function ProfilePage() {
  const { t } = useI18n()
  const vpnOn = useModuleEnabled('vpn')
  const communityOn = useModuleEnabled('community')
  const [account, setAccount] = useState<Account | null>(null)
  const [saved, setSaved] = useState<Account | null>(null)
  const [pass, setPass] = useState({ currentPassword: '', newPassword: '', confirm: '' })
  const [msg, setMsg] = useState<{ ok: boolean; text: string; where: 'account' | 'password' } | null>(null)
  const [busy, setBusy] = useState('')

  useEffect(() => {
    fetch('/api/profile').then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (!d) return
      const value = { name: d.name || '', email: d.email || '', avatarColor: /^#[0-9a-f]{6}$/i.test(d.avatarColor || '') ? d.avatarColor : '#4b45ee' }
      setAccount(value); setSaved(value)
    })
  }, [])

  async function saveAccount(e: FormEvent) {
    e.preventDefault()
    if (!account) return
    setBusy('account'); setMsg(null)
    const res = await fetch('/api/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: account.name, avatarColor: account.avatarColor }) }).catch(() => null)
    const data = await res?.json().catch(() => null)
    setBusy('')
    if (res?.ok) setSaved(account)
    setMsg({ ok: !!res?.ok, text: res?.ok ? t.saved : data?.error || t.errGeneric, where: 'account' })
  }

  async function savePass(e: FormEvent) {
    e.preventDefault()
    if (pass.newPassword !== pass.confirm) { setMsg({ ok: false, text: 'تکرار رمز جدید با آن یکسان نیست', where: 'password' }); return }
    setBusy('password'); setMsg(null)
    const res = await fetch('/api/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword: pass.currentPassword, newPassword: pass.newPassword }) }).catch(() => null)
    const data = await res?.json().catch(() => null)
    setBusy('')
    setMsg({ ok: !!res?.ok, text: res?.ok ? t.passChanged : data?.error || t.passWrong, where: 'password' })
    if (res?.ok) setPass({ currentPassword: '', newPassword: '', confirm: '' })
  }

  const dirty = !!account && JSON.stringify(account) !== JSON.stringify(saved)
  const strength = pass.newPassword.length === 0 ? 0 : [pass.newPassword.length >= 8, /[a-z]/i.test(pass.newPassword) && /\d/.test(pass.newPassword), /[^a-z0-9]/i.test(pass.newPassword), pass.newPassword.length >= 12].filter(Boolean).length
  const note = (where: 'account' | 'password') => msg?.where === where && <p className={`dash-note ${msg.ok ? 'is-ok' : 'is-error'}`} role="status">{msg.text}</p>

  return <div className="dash-page" dir="rtl">
    <header className="dash-page-head">
      <div><h1>تنظیمات حساب</h1><p>اطلاعات حساب، امنیت ورود و همهٔ راه‌های اطلاع‌رسانی (پیامک، ایمیل و تلگرام) در یک جا.</p></div>
      {communityOn && <div className="dash-page-actions"><Link href="/dashboard/public-profile" className="btn btn-ghost">ویرایش پروفایل عمومی</Link></div>}
    </header>

    <div className="ac-layout">
      <div className="ac-col">
        <form className="dash-card" onSubmit={saveAccount}>
          <div className="dash-card-head"><div><h2>اطلاعات حساب</h2><p>نام شما در فاکتورها، سفارش‌ها و پشتیبانی استفاده می‌شود.</p></div></div>
          {account ? <>
            <div className="ac-identity">
              <span className="avatar" style={{ background: account.avatarColor }}>{(account.name || account.email || '?').charAt(0)}</span>
              <div><b>{account.name || 'بدون نام'}</b><span dir="ltr">{account.email}</span></div>
            </div>
            <label className="dash-field"><span>{t.nameLabel}</span><input className="input" value={account.name} maxLength={80} onChange={(e) => setAccount({ ...account, name: e.target.value })} /></label>
            <div className="dash-field"><span>رنگ نمایه</span>
              <div className="ac-swatches" role="group" aria-label="رنگ نمایه">
                {COLORS.map((color) => <button key={color} type="button" className="ac-swatch" style={{ background: color }} aria-pressed={account.avatarColor.toLowerCase() === color} aria-label={color} onClick={() => setAccount({ ...account, avatarColor: color })} />)}
                <label className="ac-swatch-custom" title="رنگ دلخواه" style={COLORS.includes(account.avatarColor.toLowerCase()) ? undefined : { background: account.avatarColor, borderStyle: 'solid', borderColor: 'var(--text)', color: '#fff' }}>+<input type="color" value={account.avatarColor} onChange={(e) => setAccount({ ...account, avatarColor: e.target.value })} aria-label="رنگ دلخواه" /></label>
              </div>
            </div>
            {note('account')}
            <div className="dash-actions"><button className="btn btn-primary" disabled={busy === 'account' || !dirty}>{busy === 'account' ? 'در حال ذخیره…' : t.save}</button></div>
          </> : <div className="pp-skeleton" style={{ height: 180 }} />}
        </form>

        <form className="dash-card" onSubmit={savePass}>
          <div className="dash-card-head"><div><h2>{t.changePassword}</h2><p>رمزی بلند با حرف، عدد و نماد انتخاب کنید و آن را جای دیگری استفاده نکنید.</p></div></div>
          <label className="dash-field"><span>{t.currentPassword}</span><input className="input" dir="ltr" type="password" autoComplete="current-password" value={pass.currentPassword} onChange={(e) => setPass({ ...pass, currentPassword: e.target.value })} required /></label>
          <div className="dash-grid">
            <label className="dash-field"><span>رمز جدید</span><input className="input" dir="ltr" type="password" autoComplete="new-password" minLength={8} value={pass.newPassword} onChange={(e) => setPass({ ...pass, newPassword: e.target.value })} required /></label>
            <label className="dash-field"><span>تکرار رمز جدید</span><input className="input" dir="ltr" type="password" autoComplete="new-password" minLength={8} value={pass.confirm} onChange={(e) => setPass({ ...pass, confirm: e.target.value })} required /></label>
          </div>
          {pass.newPassword && <div className={`ac-strength is-${strength}`} aria-live="polite"><i /><i /><i /><i /><span>{['', 'ضعیف', 'متوسط', 'خوب', 'قوی'][strength]}</span></div>}
          {note('password')}
          <div className="dash-actions"><button className="btn btn-primary" disabled={busy === 'password'}>{busy === 'password' ? 'در حال ذخیره…' : t.changePassword}</button></div>
        </form>

        <TwoFactorCard />
      </div>

      <div className="ac-col ac-channels">
        <h2 className="ac-col-title">اطلاع‌رسانی و اتصال‌ها</h2>
        <PhoneVerification />
        <EmailAlertPreference />
        <PushAlertPreference />
        <TelegramLink />
        {vpnOn && <SubscriptionAlertPreference />}
      </div>
    </div>
  </div>
}
