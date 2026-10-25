'use client'

import { useState } from 'react'
import { CinemaShell, Notice, fa, send, useJson } from '../shared'
import { STRUCTURE_LABEL, type CinemaFormat, type FormatStructure } from '@/modules/cinema/domain/formats'

type Row = CinemaFormat & { titles: number }
type Draft = { id: number | null; slug: string; name: string; nameEn: string; plural: string; icon: string; structure: FormatStructure; sortOrder: string; active: boolean; homeShelf: boolean }
const EMPTY: Draft = { id: null, slug: '', name: '', nameEn: '', plural: '', icon: '', structure: 'MOVIE', sortOrder: '0', active: true, homeShelf: false }
const API = '/api/admin/cinema/formats'
const draftOf = (row: Row): Draft => ({ ...row, sortOrder: String(row.sortOrder) })

/** The kinds of title (film, series, anime, documentary…): their names, order, structure and whether they are offered. */
export default function CinemaFormatsAdmin() {
  const { data, error, loading, reload } = useJson<{ formats: Row[] }>(API)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const rows = data?.formats || []
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => (current ? { ...current, [key]: value } : current))

  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!draft) return
    setBusy(true); setMessage(null)
    const { id, slug, sortOrder, ...rest } = draft
    const result = await send(API, id ? 'PATCH' : 'POST', { ...rest, sortOrder: Number(sortOrder) || 0, ...(id ? { id } : { slug }) })
    setBusy(false)
    if (!result.ok) { setMessage({ tone: 'error', text: result.error }); return }
    setMessage({ tone: 'ok', text: id ? 'تغییرات نوع ذخیره شد.' : `نوع «${draft.name}» اضافه شد.` })
    setDraft(null); await reload()
  }
  async function toggle(row: Row) {
    setBusy(true); setMessage(null)
    const result = await send(API, 'PATCH', { id: row.id, active: !row.active })
    setBusy(false)
    if (!result.ok) setMessage({ tone: 'error', text: result.error }); else await reload()
  }
  async function remove(row: Row) {
    if (!window.confirm(`نوع «${row.name}» حذف شود؟`)) return
    setBusy(true); setMessage(null)
    const result = await send(`${API}?id=${row.id}`, 'DELETE')
    setBusy(false)
    if (!result.ok) setMessage({ tone: 'error', text: result.error }); else { setMessage({ tone: 'ok', text: `نوع «${row.name}» حذف شد.` }); await reload() }
  }

  return <CinemaShell title="انواع فیلم و سریال" actions={<button type="button" className="btn btn-primary" disabled={busy} onClick={() => { setDraft({ ...EMPTY, sortOrder: String(rows.length) }); setMessage(null) }}>+ نوع تازه</button>}>
    <p className="cf-intro">هر عنوان یک «نوع» دارد: فیلم سینمایی، سریال، انیمه، مستند، کارتون و هر نوعی که شما بسازید. نوع در فرم عنوان، فیلتر «نوع اثر» در سایت و برچسب روی کارت‌ها دیده می‌شود. ساختار هر نوع تعیین می‌کند که عنوان‌هایش یک اثرند (لینک روی خود اثر) یا فصل و قسمت دارند.</p>
    {message && <Notice tone={message.tone}>{message.text}</Notice>}
    {error && <Notice tone="error">{error}</Notice>}

    {draft && <form className="cf-editor" onSubmit={save} aria-label={draft.id ? 'ویرایش نوع' : 'نوع تازه'}>
      <header><h2>{draft.id ? `ویرایش «${draft.name}»` : 'نوع تازه'}</h2></header>
      <div className="cf-fields">
        <label className="sa-field"><span>نام</span><input className="input" required maxLength={60} value={draft.name} onChange={(e) => set('name', e.target.value)} placeholder="انیمه" /></label>
        <label className="sa-field"><span>نام جمع (برای قفسه‌ها و فهرست)</span><input className="input" maxLength={60} value={draft.plural} onChange={(e) => set('plural', e.target.value)} placeholder="انیمه‌ها" /></label>
        <label className="sa-field"><span>نام انگلیسی</span><input className="input" dir="ltr" maxLength={60} value={draft.nameEn} onChange={(e) => set('nameEn', e.target.value)} placeholder="Anime" /></label>
        <label className="sa-field"><span>نشانی انگلیسی {draft.id ? '(ثابت)' : ''}</span><input className="input" dir="ltr" required={!draft.id} disabled={!!draft.id} maxLength={40} pattern="[a-z0-9]+(-[a-z0-9]+)*" value={draft.slug} onChange={(e) => set('slug', e.target.value.toLowerCase())} placeholder="anime" /><small>در نشانی فیلتر سایت: <code dir="ltr">?format={draft.slug || 'anime'}</code></small></label>
        <label className="sa-field"><span>نماد (ایموجی، اختیاری)</span><input className="input" maxLength={8} value={draft.icon} onChange={(e) => set('icon', e.target.value)} placeholder="🎌" /></label>
        <label className="sa-field"><span>ترتیب</span><input className="input" type="number" min={-9999} max={9999} value={draft.sortOrder} onChange={(e) => set('sortOrder', e.target.value)} /></label>
      </div>
      <fieldset className="cf-structure">
        <legend>ساختار عنوان‌های این نوع</legend>
        {(Object.keys(STRUCTURE_LABEL) as FormatStructure[]).map((structure) => <label key={structure} className={draft.structure === structure ? 'is-on' : ''}>
          <input type="radio" name="structure" value={structure} checked={draft.structure === structure} onChange={() => set('structure', structure)} />
          <strong>{STRUCTURE_LABEL[structure].fa}</strong><small>{STRUCTURE_LABEL[structure].hint}</small>
        </label>)}
      </fieldset>
      <label className="sa-check"><input type="checkbox" checked={draft.active} onChange={(e) => set('active', e.target.checked)} />فعال: در فرم عنوان و فیلتر سایت پیشنهاد شود</label>
      <label className="sa-check"><input type="checkbox" checked={draft.homeShelf} onChange={(e) => set('homeShelf', e.target.checked)} />قفسهٔ جدا در صفحهٔ اصلی فیلم و سریال (در ردیف «قفسهٔ انواع»؛ جایش را در «صفحهٔ اصلی و تنظیمات» تعیین کنید)</label>
      <div className="cf-actions"><button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'در حال ذخیره…' : draft.id ? 'ذخیرهٔ تغییرات' : 'افزودن نوع'}</button><button type="button" className="btn btn-ghost" onClick={() => setDraft(null)}>انصراف</button></div>
    </form>}

    {loading && !data ? <div className="sa-skeleton" aria-busy="true" /> : <ul className="cf-list">
      {rows.map((row) => <li key={row.id} className={row.active ? '' : 'is-off'}>
        <span className="cf-icon" aria-hidden="true">{row.icon || (row.structure === 'SERIES' ? '📺' : '🎬')}</span>
        <div className="cf-main">
          <strong>{row.name}{row.nameEn && <small dir="ltr">{row.nameEn}</small>}</strong>
          <span className="cf-meta"><span className={`cf-badge is-${row.structure.toLowerCase()}`}>{STRUCTURE_LABEL[row.structure].fa}</span><span>{fa(row.titles)} عنوان</span><code dir="ltr">?format={row.slug}</code>{row.homeShelf && <span className="cf-badge">قفسه در صفحهٔ اصلی</span>}{!row.active && <span className="cf-badge is-off">غیرفعال</span>}</span>
        </div>
        <div className="cf-tools">
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => { setDraft(draftOf(row)); setMessage(null) }}>ویرایش</button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void toggle(row)}>{row.active ? 'غیرفعال کن' : 'فعال کن'}</button>
          <button type="button" className="btn btn-ghost btn-sm is-danger" disabled={busy || row.titles > 0} title={row.titles ? 'نوعی که عنوان دارد حذف نمی‌شود؛ غیرفعالش کنید' : undefined} onClick={() => void remove(row)}>حذف</button>
        </div>
      </li>)}
    </ul>}
  </CinemaShell>
}
