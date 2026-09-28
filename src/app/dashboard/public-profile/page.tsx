'use client'

import Link from '@/components/AppLink'
import { useEffect, useRef, useState } from 'react'
import { LINK_KINDS, MESSAGE_POLICY, PROFILE_VISIBILITY, type Privacy } from '@/modules/identity/domain/profile'

type Profile = { username: string; name: string; headline: string; bio: string; location: string; website: string; avatar: string; cover: string; links: { kind: string; url: string }[]; privacy: Privacy }

function Upload({ label, value, onChange, shape }: { label: string; value: string; onChange: (url: string) => void; shape: 'avatar' | 'cover' }) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function pick(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    setBusy(true); setError('')
    const form = new FormData(); form.append('file', file)
    const response = await fetch('/api/profile/media', { method: 'POST', body: form }).catch(() => null)
    const data = await response?.json().catch(() => null)
    setBusy(false)
    if (!response?.ok) { setError(data?.error || 'بارگذاری انجام نشد'); return }
    onChange(data.url)
  }
  return <div className={`pp-upload is-${shape}`}>
    <button type="button" className="pp-upload-box" onClick={() => input.current?.click()} disabled={busy} aria-label={`انتخاب ${label}`} style={value ? { backgroundImage: `url("${value}")` } : undefined}>
      {!value && <span>{busy ? 'در حال بارگذاری…' : `+ ${label}`}</span>}
    </button>
    <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => void pick(e.target.files)} />
    <div className="pp-upload-actions"><button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => input.current?.click()}>{value ? 'تغییر' : 'بارگذاری'}</button>{value && <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange('')}>حذف</button>}</div>
    {error && <small className="pp-error" role="alert">{error}</small>}
  </div>
}

/** Public profile editor: identity, images, social links and privacy. */
export default function PublicProfilePage() {
  const [form, setForm] = useState<Profile | null>(null)
  const [saved, setSaved] = useState<Profile | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    fetch('/api/profile/public', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((data) => { if (data) { setForm(data); setSaved(data) } }).catch(() => setMessage({ ok: false, text: 'بارگذاری پروفایل انجام نشد' }))
  }, [])
  if (!form) return <div className="pp" dir="rtl">{message ? <p className="pp-note is-error">{message.text}</p> : <div className="pp-skeleton" aria-busy="true" />}</div>
  const set = (patch: Partial<Profile>) => { setMessage(null); setForm({ ...form, ...patch }) }
  const setPrivacy = (patch: Partial<Privacy>) => set({ privacy: { ...form.privacy, ...patch } })
  const link = (kind: string) => form.links.find((l) => l.kind === kind)?.url || ''
  const setLink = (kind: string, url: string) => set({ links: [...form.links.filter((l) => l.kind !== kind), ...(url ? [{ kind, url }] : [])] })
  const dirty = JSON.stringify(form) !== JSON.stringify(saved)

  async function save() {
    if (!form) return
    setBusy(true); setMessage(null)
    const response = await fetch('/api/profile/public', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) }).catch(() => null)
    const data = await response?.json().catch(() => null)
    setBusy(false)
    if (!response?.ok) { setMessage({ ok: false, text: data?.error || 'ذخیره نشد' }); return }
    setForm(data); setSaved(data); setMessage({ ok: true, text: 'پروفایل به‌روز شد' })
  }

  return <div className="pp" dir="rtl">
    <header className="pp-head">
      <div><h1>پروفایل عمومی</h1><p>این پروفایل در همهٔ بخش‌های سایت (تالار، نقدها، کتابخانهٔ بازی و پست‌ها) نمایش داده می‌شود.</p></div>
      <div className="pp-head-actions"><Link href={`/u/${saved?.username}`} className="btn btn-ghost">مشاهدهٔ پروفایل</Link><button type="button" className="btn btn-primary" disabled={busy || !dirty} onClick={() => void save()}>{busy ? 'در حال ذخیره…' : 'ذخیرهٔ تغییرات'}</button></div>
    </header>
    {message && <p className={`pp-note ${message.ok ? 'is-ok' : 'is-error'}`} role={message.ok ? 'status' : 'alert'}>{message.text}</p>}
    <section className="pp-card pp-images">
      <Upload label="تصویر کاور" shape="cover" value={form.cover} onChange={(cover) => set({ cover })} />
      <Upload label="تصویر پروفایل" shape="avatar" value={form.avatar} onChange={(avatar) => set({ avatar })} />
    </section>
    <section className="pp-card">
      <h2>هویت</h2>
      <div className="pp-grid">
        <label className="pp-field"><span>نام نمایشی</span><input className="input" value={form.name} maxLength={60} onChange={(e) => set({ name: e.target.value })} /></label>
        <label className="pp-field"><span>نام کاربری</span><span className="pp-prefix" dir="ltr"><span>@</span><input className="input" value={form.username} maxLength={20} onChange={(e) => set({ username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })} /></span><small>نشانی پروفایل شما: <bdi dir="ltr">/u/{form.username}</bdi> (روزی حداکثر سه بار قابل تغییر)</small></label>
      </div>
      <label className="pp-field"><span>تیتر کوتاه</span><input className="input" value={form.headline} maxLength={120} onChange={(e) => set({ headline: e.target.value })} placeholder="مثلاً: گیمر، عاشق فیلم‌های علمی‌تخیلی و برنامه‌نویس" /><small className="num">{(120 - form.headline.length).toLocaleString('fa-IR')} نویسه باقی مانده</small></label>
      <label className="pp-field"><span>درباره من</span><textarea className="input" rows={5} value={form.bio} maxLength={1000} onChange={(e) => set({ bio: e.target.value })} placeholder="کمی از خودتان بنویسید…" /><small className="num">{(1000 - form.bio.length).toLocaleString('fa-IR')} نویسه باقی مانده</small></label>
      <div className="pp-grid">
        <label className="pp-field"><span>شهر</span><input className="input" value={form.location} maxLength={80} onChange={(e) => set({ location: e.target.value })} /></label>
        <label className="pp-field"><span>وب‌سایت</span><input className="input" dir="ltr" value={form.website} onChange={(e) => set({ website: e.target.value })} placeholder="https://" /></label>
      </div>
    </section>
    <section className="pp-card">
      <h2>شبکه‌های اجتماعی</h2>
      <div className="pp-grid">{Object.entries(LINK_KINDS).map(([kind, info]) => <label key={kind} className="pp-field"><span>{info.label}</span><input className="input" dir="ltr" value={link(kind)} onChange={(e) => setLink(kind, e.target.value)} placeholder={`https://${info.hosts[0]}/…`} /></label>)}</div>
    </section>
    <section className="pp-card">
      <h2>حریم خصوصی</h2>
      <div className="pp-grid">
        <label className="pp-field"><span>چه کسانی پروفایل و فعالیت‌هایم را ببینند</span><select className="select" value={form.privacy.profile} onChange={(e) => setPrivacy({ profile: e.target.value as Privacy['profile'] })}>{Object.entries(PROFILE_VISIBILITY).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label className="pp-field"><span>چه کسانی پیام خصوصی بدهند</span><select className="select" value={form.privacy.messages} onChange={(e) => setPrivacy({ messages: e.target.value as Privacy['messages'] })}>{Object.entries(MESSAGE_POLICY).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      </div>
      <div className="pp-switches">
        {([['showActivity', 'نمایش فعالیت‌های تالار و نقدها در پروفایل'], ['showLibrary', 'نمایش کتابخانهٔ بازی'], ['showFavorites', 'نمایش علاقه‌مندی‌ها'], ['showFollows', 'نمایش فهرست دنبال‌کننده‌ها و دنبال‌شونده‌ها'], ['showOnline', 'نمایش وضعیت آنلاین']] as [keyof Privacy, string][]).map(([key, label]) => <label key={key} className="pp-switch"><input type="checkbox" role="switch" checked={!!form.privacy[key]} onChange={(e) => setPrivacy({ [key]: e.target.checked } as Partial<Privacy>)} /><span>{label}</span></label>)}
      </div>
    </section>
    <div className="pp-footer"><button type="button" className="btn btn-primary" disabled={busy || !dirty} onClick={() => void save()}>{busy ? 'در حال ذخیره…' : 'ذخیرهٔ تغییرات'}</button></div>
  </div>
}
