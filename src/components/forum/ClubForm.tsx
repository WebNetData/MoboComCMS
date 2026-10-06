'use client'

import { useState } from 'react'
import { useRouter } from '@/platform/routing/navigation'

const COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#14b8a6']

/** Start a club: its name, its address, what it is about and whether anyone may walk in. */
export default function ClubForm() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: '', slug: '', description: '', kind: 'open', icon: '🎪', color: COLORS[0] })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true); setError('')
    const response = await fetch('/api/forum/clubs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) }).catch(() => null)
    const data = await response?.json().catch(() => null)
    setBusy(false)
    if (!response?.ok) { setError(data?.error || 'ساخته نشد؛ دوباره تلاش کنید'); return }
    router.push(`/forum/g/${data.slug}`)
  }

  if (!open) return <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>+ ساخت کلوب</button>
  return (
    <form className="fk-form" onSubmit={submit} aria-label="ساخت کلوب">
      <div className="fk-form-head"><strong>کلوب تازه</strong><button type="button" className="fx-icon-btn" onClick={() => setOpen(false)} aria-label="بستن">✕</button></div>
      <label className="fx-field"><span>نام کلوب</span><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} minLength={3} maxLength={60} required placeholder="مثلاً دوستداران سینمای کلاسیک" /></label>
      <label className="fx-field"><span>نشانی (حروف انگلیسی)</span><span className="fk-slug" dir="ltr"><i>/forum/c/club-</i><input className="input" dir="ltr" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} minLength={3} maxLength={30} required placeholder="classic-cinema" /></span></label>
      <label className="fx-field"><span>دربارهٔ کلوب</span><textarea className="textarea" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={300} placeholder="این کلوب دربارهٔ چیست و برای چه کسانی است؟" /></label>
      <fieldset className="fk-kind"><legend>چه کسی وارد شود؟</legend>
        <label className={form.kind === 'open' ? 'is-on' : ''}><input type="radio" name="kind" checked={form.kind === 'open'} onChange={() => setForm({ ...form, kind: 'open' })} /><b>باز</b><small>همه می‌خوانند و هر عضوی می‌تواند بپیوندد و بنویسد.</small></label>
        <label className={form.kind === 'private' ? 'is-on' : ''}><input type="radio" name="kind" checked={form.kind === 'private'} onChange={() => setForm({ ...form, kind: 'private' })} /><b>خصوصی</b><small>فقط اعضا می‌بینند؛ پیوستن با درخواست و تأیید شماست.</small></label>
      </fieldset>
      <div className="fk-look">
        <label className="fx-field"><span>نشان</span><input className="input" value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} maxLength={8} aria-label="نشان کلوب (یک ایموجی)" /></label>
        <div className="fk-colors" role="radiogroup" aria-label="رنگ کلوب">{COLORS.map((color) => <button key={color} type="button" role="radio" aria-checked={form.color === color} aria-label={`رنگ ${color}`} className={form.color === color ? 'is-on' : ''} style={{ background: color }} onClick={() => setForm({ ...form, color })} />)}</div>
      </div>
      {error && <p className="fx-warn" role="alert">{error}</p>}
      <div className="fk-form-foot"><button className="btn btn-primary" disabled={busy || form.name.trim().length < 3 || form.slug.length < 3}>{busy ? 'در حال ساخت…' : 'ساخت کلوب'}</button><button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>انصراف</button></div>
    </form>
  )
}
