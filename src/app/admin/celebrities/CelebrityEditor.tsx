'use client'

import { useEffect, useRef, useState } from 'react'
import FileUpload from '@/components/admin/FileUpload'
import ContentEditor from '@/components/editor/ContentEditor'
import { suggestedCelebritySlug, validCelebritySlug } from '@/modules/celebrities/domain/celebrities'

type Works = { titles: number; tracks: number; albums: number }
type Profile = { id: number; slug: string; name: string; nameEn: string; image: string; bio: string; featured: boolean; works: Works }
const EMPTY: Profile = { id: 0, slug: '', name: '', nameEn: '', image: '', bio: '', featured: false, works: { titles: 0, tracks: 0, albums: 0 } }
const fa = (value: number) => value.toLocaleString('fa-IR')

/**
 * One profile for a person on the whole site (owner, 2026-10-27: an artist is one, not one per section). The name,
 * English name, picture and biography are written into their music artist and their cinema person at once; saving
 * makes whichever of the two they lack, so they can be picked in the forms of music and of film and series alike. What
 * they have in each section is shown, not chosen: it follows from their works.
 */
export default function CelebrityEditor({ id, onSaved, onClose }: { id: number; onSaved: (message: string) => void; onClose: () => void }) {
  const [form, setForm] = useState<Profile | null>(id ? null : EMPTY)
  const [was, setWas] = useState<Profile>(EMPTY)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const manualSlug = useRef(!!id)
  useEffect(() => {
    manualSlug.current = !!id
    if (!id) { setForm(EMPTY); setWas(EMPTY); return }
    fetch(`/api/admin/celebrities?id=${id}`, { cache: 'no-store' }).then((r) => r.json().then((body) => ({ ok: r.ok, body }))).then(({ ok, body }) => {
      if (!ok) { setError(body?.error || 'بارگذاری نشد'); return }
      setForm(body.profile); setWas(body.profile)
    }).catch(() => setError('ارتباط برقرار نشد'))
  }, [id])
  if (!form) return <section className="sa-card cbx-editor"><p>{error || 'در حال بارگذاری…'}</p></section>
  // From the latest form: the biography editor may report its value with a callback from an earlier render.
  const set = (patch: Partial<Profile>) => setForm((current) => current && { ...current, ...patch })

  async function save() {
    if (!form) return
    setBusy(true); setError('')
    const { works: _works, ...profile } = form
    const response = await fetch('/api/admin/celebrities', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'save', ...profile, ...(form.id ? { expectedSlug: was.slug } : { id: undefined }) }) }).catch(() => null)
    const body = await response?.json().catch(() => null)
    setBusy(false)
    if (!response?.ok) { setError(body?.error || 'ذخیره نشد'); return }
    onSaved(form.id ? `پروفایل «${form.name}» ذخیره شد` : `«${form.name}» ساخته شد`)
  }

  const { titles, tracks, albums } = form.works
  const invalidSlug = form.slug ? !validCelebritySlug(form.slug) : form.id > 0
  return <section className="sa-card sa-form cbx-editor" aria-labelledby="cbx-editor-title">
    <header className="sa-card-head"><h2 id="cbx-editor-title">{form.id ? `پروفایل ${was.name}` : 'هنرمند جدید'}</h2><button type="button" className="sa-link" onClick={onClose}>بستن</button></header>
    <div className="cbx-editor-grid">
      <div className="cbx-editor-photo">
        <span className="cbx-editor-portrait">{form.image ? <img src={form.image} alt="" /> : <i aria-hidden="true">{form.name.slice(0, 1) || '؟'}</i>}</span>
        <FileUpload section="music" accept="image/*" label="بارگذاری عکس" compact onUploaded={(file) => set({ image: file.url })} />
        <label className="sa-field"><span>نشانی عکس</span><input className="input" dir="ltr" value={form.image} onChange={(e) => set({ image: e.target.value })} /></label>
      </div>
      <div className="cbx-editor-fields">
        <div className="cbx-editor-names">
          <label className="sa-field"><span>نام</span><input className="input" value={form.name} maxLength={120} onChange={(e) => set({ name: e.target.value })} /></label>
          <label className="sa-field"><span>نام انگلیسی <small>(اختیاری)</small></span><input className="input" dir="ltr" value={form.nameEn} maxLength={160} onChange={(e) => set({ nameEn: e.target.value, ...(!manualSlug.current ? { slug: suggestedCelebritySlug(e.target.value) } : {}) })} placeholder="Shadmehr Aghili" /></label>
        </div>
        <div className="sa-field cbx-slug">
          <label htmlFor="celebrity-slug">نشانی صفحه (slug)</label>
          <input id="celebrity-slug" className="input" dir="ltr" value={form.slug} maxLength={80} autoCapitalize="none" autoComplete="off" spellCheck={false} aria-describedby="celebrity-slug-hint celebrity-slug-preview" aria-invalid={invalidSlug} onChange={(e) => { manualSlug.current = true; set({ slug: e.target.value.toLowerCase() }) }} placeholder="shadmehr-aghili" />
          <small id="celebrity-slug-hint">از نام انگلیسی ساخته می‌شود؛ می‌توانید پیش از ذخیره ویرایش کنید. بدون نام انگلیسی، نشانی عددی ساخته می‌شود. تغییر نام به‌تنهایی نشانی موجود را عوض نمی‌کند.</small>
          <div className="cbx-slug-preview"><code id="celebrity-slug-preview" dir="ltr">/celebrities/{form.slug || 'artist-name'}</code><button type="button" className="sa-link" disabled={busy || !suggestedCelebritySlug(form.nameEn)} onClick={() => { manualSlug.current = false; set({ slug: suggestedCelebritySlug(form.nameEn) }) }}>ساخت از نام انگلیسی</button></div>
          {invalidSlug && <p className="cbx-error" role="alert">نشانی را با حروف انگلیسی کوچک، عدد و خط تیرهٔ بین کلمات وارد کنید.</p>}
          {form.id > 0 && form.slug !== was.slug && <small>پس از ذخیره، نشانی قبلی به صفحهٔ جدید هدایت می‌شود.</small>}
        </div>
        <div className="cbx-presence" aria-label="حضور در بخش‌ها">
          <span className={`cbx-presence-item is-cinema${titles ? ' has-works' : ''}`}><b>فیلم و سریال</b><small>{titles ? `${fa(titles)} اثر` : 'هنوز اثری ندارد'}</small></span>
          <span className={`cbx-presence-item is-music${tracks || albums ? ' has-works' : ''}`}><b>موسیقی</b><small>{tracks || albums ? [tracks ? `${fa(tracks)} آهنگ` : '', albums ? `${fa(albums)} آلبوم` : ''].filter(Boolean).join('، ') : 'هنوز اثری ندارد'}</small></span>
          <p className="sa-sub">یک پروفایل برای همهٔ سایت: این هنرمند در فرم‌های موسیقی و فیلم و سریال قابل انتخاب است و هر اثری که به نامش ثبت شود، در صفحه‌اش می‌آید.</p>
        </div>
        <div className="sa-field cbx-bio"><span id="cbx-bio-label">بیوگرافی</span><div aria-labelledby="cbx-bio-label" inert={busy}><ContentEditor value={form.bio} onChange={(bio) => set({ bio })} assetSection="music" minHeight={260} placeholder="زندگی‌نامه و فعالیت‌های هنری…" /></div></div>
      </div>
    </div>
    {error && <p role="alert" className="cbx-error">{error}</p>}
    <div className="cbx-editor-foot">
      <button type="button" className="btn btn-primary" disabled={busy || !form.name.trim() || invalidSlug} onClick={() => void save()}>{busy ? 'در حال ذخیره…' : 'ذخیرهٔ پروفایل'}</button>
      {was.slug && <a href={`/celebrities/${encodeURIComponent(was.slug)}`} className="sa-link" target="_blank" rel="noreferrer">صفحهٔ هنرمند</a>}
    </div>
  </section>
}
