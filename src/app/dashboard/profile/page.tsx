'use client'

import { useEffect, useState } from 'react'
import SubscriptionAlertPreference from '@/components/SubscriptionAlertPreference'
import TelegramLink from '@/components/TelegramLink'
import PhoneVerification from '@/components/PhoneVerification'
import { useI18n } from '@/i18n/LocaleProvider'

export default function ProfilePage() {
  const { t, locale } = useI18n()
  const [form, setForm] = useState({ name: '', phone: '', avatarColor: '#4b45ee' })
  const [pass, setPass] = useState({ currentPassword: '', newPassword: '' })
  const [msg, setMsg] = useState('')
  const [msgOk, setMsgOk] = useState(false)

  useEffect(() => {
    fetch('/api/profile').then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (d) setForm({ name: d.name || '', phone: d.phone || '', avatarColor: d.avatarColor || '#4b45ee' })
    })
  }, [])

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault()
    setMsg('')
    const res = await fetch('/api/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    setMsgOk(res.ok)
    setMsg(res.ok ? `✅ ${t.saved}` : t.errGeneric)
  }

  async function savePass(e: React.FormEvent) {
    e.preventDefault()
    setMsg('')
    const res = await fetch('/api/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pass) })
    const data = await res.json().catch(() => null)
    setMsgOk(res.ok)
    setMsg(res.ok ? `✅ ${t.passChanged}` : data?.error || t.passWrong)
    if (res.ok) setPass({ currentPassword: '', newPassword: '' })
  }

  return (
    <div>
      <h1 className="h2 mb-6">{t.profile}</h1>
      <PhoneVerification />
      <TelegramLink />
      <SubscriptionAlertPreference />
      <div className="grid-2 max-w-3xl">
        <form onSubmit={saveProfile} className="card">
          <h3 className="font-bold mb-4">{t.profile}</h3>
          <div className="mb-4">
            <label className="label">{t.nameLabel}</label>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="mb-4">
            <label className="label">{locale === 'fa' ? 'شماره تماس' : 'Phone'}</label>
            <input className="input" dir="ltr" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div className="mb-4">
            <label className="label">{locale === 'fa' ? 'رنگ نمایه' : 'Avatar color'}</label>
            <input className="input" dir="ltr" type="color" value={form.avatarColor} onChange={(e) => setForm({ ...form, avatarColor: e.target.value })} />
          </div>
          <button className="btn btn-primary">{t.save}</button>
        </form>

        <form onSubmit={savePass} className="card self-start">
          <h3 className="font-bold mb-4">{t.changePassword}</h3>
          <div className="mb-4">
            <label className="label">{t.currentPassword}</label>
            <input className="input" dir="ltr" type="password" value={pass.currentPassword} onChange={(e) => setPass({ ...pass, currentPassword: e.target.value })} required />
          </div>
          <div className="mb-4">
            <label className="label">{t.newPassword}</label>
            <input className="input" dir="ltr" type="password" minLength={8} value={pass.newPassword} onChange={(e) => setPass({ ...pass, newPassword: e.target.value })} required />
          </div>
          <button className="btn btn-primary">{t.changePassword}</button>
        </form>
      </div>
      {msg && <p className={msgOk ? 'success-text mt-4' : 'error-text mt-4'}>{msg}</p>}
    </div>
  )
}
