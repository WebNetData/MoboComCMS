'use client'

import { useRouter } from '@/platform/routing/navigation'
import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { profileAddress } from '@/modules/identity/domain/profile-address'

type Initial = { username: string; bio: string; location: string; website: string; avatar: string; cover: string; title: string; primaryGroupId: number }

async function upload(file: File): Promise<{ url?: string; error?: string }> {
  const form = new FormData()
  form.set('file', file)
  const response = await fetch('/api/forum/upload', { method: 'POST', body: form }).catch(() => null)
  const data = await response?.json().catch(() => null)
  return response?.ok ? { url: data.url } : { error: data?.error || 'بارگذاری انجام نشد' }
}

export default function ProfileEditor({ initial, name, avatarColor, groups, titles }: { initial: Initial; name: string; avatarColor: string; groups: { id: number; name: string }[]; titles: string[] }) {
  const router = useRouter()
  const { update } = useSession()
  const [form, setForm] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)
  const set = <K extends keyof Initial>(key: K, value: Initial[K]) => setForm((current) => ({ ...current, [key]: value }))

  async function pick(key: 'avatar' | 'cover', file: File | undefined) {
    if (!file) return
    setBusy(true); setMessage(null)
    const result = await upload(file)
    setBusy(false)
    if (result.url) set(key, result.url); else setMessage({ text: result.error || 'خطا', ok: false })
  }

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true); setMessage(null)
    const response = await fetch('/api/forum/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) }).catch(() => null)
    const data = await response?.json().catch(() => null)
    setBusy(false)
    if (!response?.ok) { setMessage({ text: data?.error || 'ذخیره نشد', ok: false }); return }
    setMessage({ text: 'پروفایل ذخیره شد', ok: true })
    void update().catch(() => undefined)
    router.push(profileAddress(data.username, 'summary'))
    router.refresh()
  }

  return (
    <form className="fx-form" onSubmit={save}>
      <div className="fx-form-media">
        <div className="fx-cover-preview" style={form.cover ? { backgroundImage: `url(${form.cover})` } : { background: avatarColor }}>
          <label className="btn btn-ghost btn-sm">تصویر کاور<input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { void pick('cover', e.target.files?.[0]); e.target.value = '' }} /></label>
          {form.cover && <button type="button" className="btn btn-ghost btn-sm" onClick={() => set('cover', '')}>حذف</button>}
        </div>
        <div className="fx-avatar-edit">
          {form.avatar ? <img src={form.avatar} alt="" className="fx-avatar" width={96} height={96} /> : <span className="fx-avatar" style={{ width: 96, height: 96, fontSize: 40, background: avatarColor }}>{name.slice(0, 1)}</span>}
          <label className="btn btn-ghost btn-sm">تصویر پروفایل<input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { void pick('avatar', e.target.files?.[0]); e.target.value = '' }} /></label>
          {form.avatar && <button type="button" className="btn btn-ghost btn-sm" onClick={() => set('avatar', '')}>حذف</button>}
        </div>
      </div>
      <label className="fx-field"><span>نام کاربری (برای @نام‌بردن و نشانی پروفایل)</span><input className="input" dir="ltr" value={form.username} onChange={(e) => set('username', e.target.value)} pattern="[A-Za-z0-9_]{3,20}" required /></label>
      <label className="fx-field"><span>دربارهٔ من (Markdown)</span><textarea className="textarea" rows={5} value={form.bio} onChange={(e) => set('bio', e.target.value)} maxLength={3000} /></label>
      <div className="fx-field-row">
        <label className="fx-field"><span>موقعیت</span><input className="input" value={form.location} onChange={(e) => set('location', e.target.value)} maxLength={100} placeholder="تهران" /></label>
        <label className="fx-field"><span>وب‌سایت</span><input className="input" dir="ltr" value={form.website} onChange={(e) => set('website', e.target.value)} maxLength={200} placeholder="https://" /></label>
      </div>
      <div className="fx-field-row">
        <label className="fx-field"><span>عنوان کنار نام</span><select className="select" value={form.title} onChange={(e) => set('title', e.target.value)}><option value="">بدون عنوان</option>{titles.map((title) => <option key={title} value={title}>{title}</option>)}</select></label>
        <label className="fx-field"><span>نشان گروه کنار نام</span><select className="select" value={form.primaryGroupId} onChange={(e) => set('primaryGroupId', Number(e.target.value))}><option value={0}>هیچ‌کدام</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
      </div>
      {message && <p className={message.ok ? 'success-text' : 'error-text'} role="status">{message.text}</p>}
      <div className="fx-form-actions"><button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'لطفاً صبر کنید…' : 'ذخیرهٔ پروفایل'}</button></div>
    </form>
  )
}
