'use client'

import { useEffect, useState } from 'react'
import FileUpload from '@/components/admin/FileUpload'

type Profile = { id: number; slug: string; name: string; nameEn: string; image: string; bio: string; music: boolean; cinema: boolean; featured: boolean }
const EMPTY: Profile = { id: 0, slug: '', name: '', nameEn: '', image: '', bio: '', music: false, cinema: false, featured: false }

/**
 * One profile for a person in every section: the name, English name, picture and biography are written into their
 * music artist and their cinema person at once. Ticking a section they are not in yet adds them there (a singer who
 * starts acting, an actor who releases a song). A section once ticked stays: removing someone from a section is done
 * by unlinking their works there.
 */
export default function CelebrityEditor({ id, onSaved, onClose }: { id: number; onSaved: (message: string) => void; onClose: () => void }) {
  const [form, setForm] = useState<Profile | null>(id ? null : EMPTY)
  const [was, setWas] = useState<Profile>(EMPTY)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!id) { setForm(EMPTY); setWas(EMPTY); return }
    fetch(`/api/admin/celebrities?id=${id}`, { cache: 'no-store' }).then((r) => r.json().then((body) => ({ ok: r.ok, body }))).then(({ ok, body }) => {
      if (!ok) { setError(body?.error || 'بارگذاری نشد'); return }
      setForm(body.profile); setWas(body.profile)
    }).catch(() => setError('ارتباط برقرار نشد'))
  }, [id])
  if (!form) return <section className="sa-card cbx-editor"><p>{error || 'در حال بارگذاری…'}</p></section>
  const set = (patch: Partial<Profile>) => setForm({ ...form, ...patch })

  async function save() {
    if (!form) return
    setBusy(true); setError('')
    const response = await fetch('/api/admin/celebrities', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'save', ...form, ...(form.id ? {} : { id: undefined }) }) }).catch(() => null)
    const body = await response?.json().catch(() => null)
    setBusy(false)
    if (!response?.ok) { setError(body?.error || 'ذخیره نشد'); return }
    onSaved(form.id ? `پروفایل «${form.name}» در همهٔ بخش‌ها ذخیره شد` : `«${form.name}» ساخته شد`)
  }

  return <section className="sa-card sa-form cbx-editor" aria-labelledby="cbx-editor-title">
    <header className="sa-card-head"><h2 id="cbx-editor-title">{form.id ? `پروفایل ${was.name}` : 'هنرمند جدید'}</h2><button type="button" className="sa-link" onClick={onClose}>بستن</button></header>
    <div className="cbx-editor-grid">
      <div className="cbx-editor-photo">
        <span className="cbx-editor-portrait">{form.image ? <img src={form.image} alt="" /> : <i aria-hidden="true">{form.name.slice(0, 1) || '؟'}</i>}</span>
        <FileUpload section="music" accept="image/*" label="بارگذاری عکس" compact onUploaded={(file) => set({ image: file.url })} />
        <label className="sa-field"><span>نشانی عکس</span><input className="input" dir="ltr" value={form.image} onChange={(e) => set({ image: e.target.value })} /></label>
      </div>
      <div className="cbx-editor-fields">
        <label className="sa-field"><span>نام</span><input className="input" value={form.name} maxLength={120} onChange={(e) => set({ name: e.target.value })} /></label>
        <label className="sa-field"><span>نام انگلیسی</span><input className="input" dir="ltr" value={form.nameEn} maxLength={160} onChange={(e) => set({ nameEn: e.target.value })} placeholder="Shadmehr Aghili" /></label>
        <fieldset className="cbx-sections">
          <legend>در کدام بخش‌ها حضور دارد</legend>
          <label className="sa-check"><input type="checkbox" checked={form.music} disabled={was.music} onChange={(e) => set({ music: e.target.checked })} />موسیقی (خواننده، آهنگساز، ترانه‌سرا…)</label>
          <label className="sa-check"><input type="checkbox" checked={form.cinema} disabled={was.cinema} onChange={(e) => set({ cinema: e.target.checked })} />فیلم و سریال (بازیگر، کارگردان، تهیه‌کننده)</label>
          <small className="sa-sub">بخشی که تیک بخورد، این هنرمند در آن هم ساخته می‌شود و در فرم‌های همان بخش قابل انتخاب است.{form.music && !was.music ? ' برای موسیقی نام انگلیسی لازم است.' : ''}</small>
        </fieldset>
        <label className="sa-field"><span>بیوگرافی</span><textarea className="input" rows={6} maxLength={20000} value={form.bio} onChange={(e) => set({ bio: e.target.value })} /></label>
      </div>
    </div>
    {error && <p role="alert" className="cbx-error">{error}</p>}
    <div className="cbx-editor-foot">
      <button type="button" className="btn btn-primary" disabled={busy || !form.name.trim() || (!form.music && !form.cinema)} onClick={() => void save()}>{busy ? 'در حال ذخیره…' : 'ذخیره در همهٔ بخش‌ها'}</button>
      {form.slug && <a href={`/celebrities/${encodeURIComponent(form.slug)}`} className="sa-link" target="_blank" rel="noreferrer">صفحهٔ هنرمند</a>}
    </div>
  </section>
}
