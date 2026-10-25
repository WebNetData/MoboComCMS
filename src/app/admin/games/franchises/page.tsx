'use client'

import { useState } from 'react'
import CoverField from '../../cms/CoverField'
import { GamesShell, Notice, fa, send, useJson } from '../shared'

type Franchise = { id: number; slug: string; title: string; titleEn: string; description: string; image: string; games: number; covers: string[] }
const EMPTY = { id: 0, slug: '', title: '', titleEn: '', description: '', image: '' }

/** Series (franchises): create, edit, delete. Games are attached from the game editor or in bulk from the list. */
export default function GamesFranchisesPage() {
  const { data, error, reload } = useJson<{ franchises: Franchise[] }>('/api/admin/games/franchises')
  const [form, setForm] = useState<typeof EMPTY | null>(null)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [uploading, setUploading] = useState(false)

  async function save() {
    if (!form) return
    const response = await send('/api/admin/games/franchises', 'POST', { ...form, id: form.id || undefined })
    if (!response.ok) { setMessage({ tone: 'error', text: response.error }); return }
    setMessage({ tone: 'ok', text: form.id ? 'مجموعه ذخیره شد' : 'مجموعه ساخته شد؛ حالا بازی‌ها را از فهرست بازی‌ها به آن اضافه کنید' })
    setForm(null)
    void reload()
  }
  async function remove(row: Franchise) {
    if (!window.confirm(`مجموعهٔ «${row.title}» حذف شود؟ ${fa(row.games)} بازی آن باقی می‌مانند و فقط از مجموعه جدا می‌شوند.`)) return
    const response = await send(`/api/admin/games/franchises?id=${row.id}`, 'DELETE')
    setMessage(response.ok ? { tone: 'ok', text: 'حذف شد' } : { tone: 'error', text: response.error })
    void reload()
  }
  const set = (patch: Partial<typeof EMPTY>) => setForm((current) => (current ? { ...current, ...patch } : current))

  return <GamesShell title="مجموعه‌های بازی" actions={<button type="button" className="btn btn-primary" onClick={() => { setMessage(null); setForm({ ...EMPTY }) }}>+ مجموعهٔ تازه</button>}>
    {error && <Notice tone="error">{error}</Notice>}
    {message && <Notice tone={message.tone}>{message.text}</Notice>}
    {form && <section className="sa-card" aria-label="فرم مجموعه">
      <header className="sa-card-head"><h2>{form.id ? `ویرایش «${form.title}»` : 'مجموعهٔ تازه'}</h2></header>
      <div className="sa-grid">
        <label className="sa-field"><span>نام فارسی *</span><input className="input" value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder="گاد آو وار" /></label>
        <label className="sa-field"><span>نام انگلیسی</span><input className="input" dir="ltr" value={form.titleEn} onChange={(e) => set({ titleEn: e.target.value })} placeholder="God of War" /></label>
        <label className="sa-field"><span>نامک (slug) *</span><input className="input" dir="ltr" value={form.slug} onChange={(e) => set({ slug: e.target.value })} placeholder="god-of-war" /></label>
      </div>
      <label className="sa-field"><span>معرفی</span><textarea className="input" rows={3} value={form.description} onChange={(e) => set({ description: e.target.value })} /></label>
      <div className="sa-field"><span>تصویر بنر (خالی = تصویر تازه‌ترین بازی)</span><CoverField mode="media" value={form.image} title={form.title} onChange={(image) => set({ image })} onBusy={setUploading} /></div>
      <div className="sa-row"><button type="button" className="btn btn-primary" disabled={uploading} onClick={() => void save()}>ذخیره</button><button type="button" className="btn btn-ghost" onClick={() => setForm(null)}>انصراف</button></div>
    </section>}
    {!data ? <div className="sa-skeleton" aria-busy="true" /> : data.franchises.length === 0 ? <div className="sa-card sa-empty">هنوز مجموعه‌ای ساخته نشده است. مجموعه‌ها بازی‌های یک سری را کنار هم نشان می‌دهند.</div>
      : <div className="ga-franchise-grid">{data.franchises.map((row) => <article key={row.id} className="sa-card ga-franchise">
        <div className="ga-franchise-art">{row.image ? <img src={row.image} alt="" /> : row.covers.length ? row.covers.map((src) => <img key={src} src={src} alt="" />) : <span className="sa-ph" />}</div>
        <b>{row.title}</b><small className="sa-sub"><bdi dir="ltr">{row.titleEn || row.slug}</bdi> · {fa(row.games)} بازی</small>
        <div className="sa-row-actions"><button type="button" className="sa-link" onClick={() => { setMessage(null); setForm({ id: row.id, slug: row.slug, title: row.title, titleEn: row.titleEn, description: row.description, image: row.image }) }}>ویرایش</button><a href={`/games/franchise/${row.slug}`} target="_blank" rel="noreferrer" className="sa-link">مشاهده</a><a href={`/admin/games/titles?franchise=${row.id}`} className="sa-link">بازی‌ها</a><button type="button" className="sa-link is-danger" onClick={() => void remove(row)}>حذف</button></div>
      </article>)}</div>}
  </GamesShell>
}
