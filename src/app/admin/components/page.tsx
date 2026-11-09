'use client'
import { useEffect, useMemo, useState } from 'react'
import AiCodePanel, { asRendered, previewDoc } from '../builder/AiCodePanel'
import '../builder/studio.css'
import { COMPONENT_FIELD_TYPES, COMPONENT_MAX, newComponentId, normalizeField, type ComponentDef, type ComponentField, type ComponentLibrary } from '@/modules/site/domain/components'
import styles from './page.module.css'

const L = (_en: string, fa: string) => fa
const TYPE_LABELS: Record<ComponentField['type'], string> = { text: 'متن کوتاه', textarea: 'متن بلند', color: 'رنگ', number: 'عدد', url: 'پیوند', image: 'تصویر', select: 'فهرست انتخابی', toggle: 'روشن/خاموش' }
const blank = (): ComponentDef => ({ id: newComponentId(), name: '', description: '', category: '', fields: [{ key: 'title', label: 'تیتر', type: 'text', default: 'تیتر نمونه', options: [] }], html: '<h3>{{field.title}}</h3>', css: 'selector {\n  padding: 24px;\n  border-radius: 18px;\n  background: var(--card);\n  border: 1px solid var(--border);\n}', js: '' })

export default function ComponentsPage() {
  const [fromPackages, setFromPackages] = useState<ComponentDef[]>([])
  const [library, setLibrary] = useState<ComponentLibrary | null>(null), [revision, setRevision] = useState(''), [canEdit, setCanEdit] = useState(false)
  const [editing, setEditing] = useState<ComponentDef | null>(null), [message, setMessage] = useState<{ text: string; error: boolean } | null>(null), [busy, setBusy] = useState(false), [width, setWidth] = useState(820)

  useEffect(() => {
    fetch('/api/admin/components', { cache: 'no-store' }).then(async r => { const d = await r.json(); if (!r.ok) throw Error(d?.error || 'دریافت نشد'); setLibrary(d.library); setRevision(d.revision); setCanEdit(d.canEdit) })
      .catch(e => setMessage({ text: e instanceof Error ? e.message : 'دریافت نشد', error: true }))
    fetch('/api/admin/packages/components', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(d => setFromPackages(d?.components || [])).catch(() => setFromPackages([]))
  }, [])
  useEffect(() => { const found = library?.components.find(c => c.id === location.hash.slice(1)); if (found && canEdit) setEditing(found) }, [library, canEdit])

  async function save(next: ComponentLibrary, done: string) {
    setBusy(true); setMessage(null)
    const r = await fetch('/api/admin/components', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'If-Match': revision }, body: JSON.stringify({ library: next }) }).catch(() => null), d = await r?.json().catch(() => null)
    setBusy(false)
    if (!r?.ok) { setMessage({ text: d?.error || 'ذخیره نشد؛ ویرایش شما در فرم مانده است', error: true }); return false }
    setLibrary(d.library); setRevision(d.revision); setMessage({ text: done, error: false }); return true
  }
  const preview = useMemo(() => editing ? previewDoc(asRendered('component', { ...editing, summary: '' })) : '', [editing])
  const set = <K extends keyof ComponentDef>(key: K, value: ComponentDef[K]) => editing && setEditing({ ...editing, [key]: value })
  const setField = (index: number, patch: Partial<ComponentField>) => editing && set('fields', editing.fields.map((f, i) => i === index ? { ...f, ...patch } : f))

  if (!library) return <div className={styles.page}>{message ? <p role="alert">{message.text}</p> : <p role="status">در حال دریافت…</p>}</div>
  const categories = [...new Set(library.components.map(c => c.category || ''))]
  return <div className={styles.page}>
    <header className={styles.hero}>
      <span className={styles.mark} aria-hidden="true">◇</span>
      <div><p className={styles.eyebrow}>ظاهر سایت · صفحه‌ساز</p><h1>کتابخانهٔ کامپوننت‌ها</h1><p>کامپوننت را یک بار با HTML، CSS و جاوااسکریپت و فیلدهای قابل‌تنظیم بسازید؛ بعد در صفحه‌ساز، قالب پست و محصول، صفحه‌ها و هر جای دیگر از بلوک «کامپوننت اختصاصی» بگذارید و فقط مقدار فیلدها را عوض کنید. مقدار فیلدها همیشه ایمن‌سازی می‌شود و تغییر طراحی همه‌جا اعمال می‌شود.</p></div>
    </header>
    {!canEdit && <p className={styles.alert}>فقط مدیر کل سایت می‌تواند کامپوننت بسازد یا کدش را تغییر دهد؛ شما می‌توانید آن‌ها را در صفحه‌ها استفاده کنید.</p>}
    {message && <p className={message.error ? styles.alert : styles.ok} role="status">{message.text}</p>}

    {categories.map(cat => <section key={cat} className={styles.group} aria-label={cat || 'بدون دسته'}>
      <h2>{cat || 'بدون دسته'}</h2>
      <ul className={styles.cards}>{library.components.filter(c => (c.category || '') === cat).map(c => <li key={c.id} className={styles.card}>
        <b>{c.name}</b>{c.description && <span>{c.description}</span>}
        <small>{c.fields.length.toLocaleString('fa-IR')} فیلد{c.js.trim() ? ' · جاوااسکریپت' : ''}</small>
        {canEdit && <div className={styles.row}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(c)}>ویرایش</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing({ ...c, id: newComponentId(), name: `${c.name} (کپی)` })}>کپی</button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => { if (confirm(`«${c.name}» حذف شود؟ بلوک‌هایی که از آن استفاده می‌کنند خالی می‌شوند.`)) void save({ components: library.components.filter(x => x.id !== c.id) }, 'کامپوننت حذف شد') }}>حذف</button>
        </div>}
      </li>)}</ul>
    </section>)}
    {!library.components.length && <p className={styles.empty}>هنوز کامپوننتی ساخته نشده است.</p>}
    {fromPackages.length > 0 && <section className={styles.group} aria-label="کامپوننت‌های افزونه‌ها">
      <h2>از افزونه‌ها و قالب فعال (فقط استفاده؛ ویرایش در ویرایشگر افزونه)</h2>
      <ul className={styles.cards}>{fromPackages.map(c => <li key={c.id} className={styles.card}><b>{c.name}</b>{c.description && <span>{c.description}</span>}<small>{c.category} · {c.fields.length.toLocaleString('fa-IR')} فیلد</small></li>)}</ul>
    </section>}
    {canEdit && <button type="button" className="btn btn-primary" disabled={busy || library.components.length >= COMPONENT_MAX} onClick={() => setEditing(blank())}>کامپوننت تازه</button>}

    {editing && <form className={styles.editor} onSubmit={e => {
      e.preventDefault()
      const next = library.components.some(c => c.id === editing.id) ? library.components.map(c => c.id === editing.id ? editing : c) : [...library.components, editing]
      void save({ components: next }, 'کامپوننت ذخیره شد').then(ok => { if (ok) setEditing(null) })
    }}>
      <h2>{library.components.some(c => c.id === editing.id) ? 'ویرایش کامپوننت' : 'کامپوننت تازه'}</h2>
      <div className={styles.grid}>
        <label className="bld-field"><span>نام</span><input className="input" maxLength={80} required value={editing.name} onChange={e => set('name', e.target.value)} placeholder="مثلاً کارت ویژگی درخشان" /></label>
        <label className="bld-field"><span>دسته</span><input className="input" maxLength={40} value={editing.category} onChange={e => set('category', e.target.value)} placeholder="مثلاً کارت‌ها" /></label>
        <label className="bld-field"><span>توضیح کوتاه</span><input className="input" maxLength={300} value={editing.description} onChange={e => set('description', e.target.value)} /></label>
      </div>
      <fieldset className={styles.fields}><legend>فیلدها · در HTML با <code dir="ltr">{'{{field.key}}'}</code> و برای نمایش شرطی با <code dir="ltr">{'{{#field.key}}…{{/field.key}}'}</code></legend>
        {editing.fields.map((f, i) => <div key={i} className={styles.fieldRow}>
          <input className="input mono" dir="ltr" aria-label="کلید" value={f.key} onChange={e => setField(i, { key: e.target.value.replace(/[^a-zA-Z0-9_]/g, '') })} placeholder="key" />
          <input className="input" aria-label="برچسب" value={f.label} onChange={e => setField(i, { label: e.target.value })} placeholder="برچسب" />
          <select className="select" aria-label="نوع" value={f.type} onChange={e => setField(i, { type: e.target.value as ComponentField['type'] })}>{COMPONENT_FIELD_TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}</select>
          <input className="input" aria-label="مقدار پیش‌فرض" value={f.default} onChange={e => setField(i, { default: e.target.value })} placeholder="پیش‌فرض" />
          {f.type === 'select' && <input className="input" aria-label="گزینه‌ها" value={f.options.join('، ')} onChange={e => setField(i, { options: e.target.value.split(/[،,]\s*/) })} placeholder="گزینه‌ها با ویرگول" />}
          <button type="button" className="btn btn-ghost btn-sm" aria-label={`حذف فیلد ${f.label}`} onClick={() => set('fields', editing.fields.filter((_, j) => j !== i))}>×</button>
        </div>)}
        <button type="button" className="btn btn-ghost btn-sm" disabled={editing.fields.length >= 20} onClick={() => set('fields', [...editing.fields, { key: `field${editing.fields.length + 1}`, label: 'فیلد تازه', type: 'text', default: '', options: [] }])}>افزودن فیلد</button>
      </fieldset>
      <div className={styles.code}>
        <label className="bld-field"><span>HTML (قالب)</span><textarea className="textarea bld-code mono" dir="ltr" rows={10} value={editing.html} onChange={e => set('html', e.target.value)} /></label>
        <label className="bld-field"><span>CSS · selector یعنی ریشهٔ کامپوننت</span><textarea className="textarea bld-code mono" dir="ltr" rows={10} value={editing.css} onChange={e => set('css', e.target.value)} /></label>
        <label className="bld-field"><span>جاوااسکریپت (اختیاری) · root عنصر همین نمونه است</span><textarea className="textarea bld-code mono" dir="ltr" rows={6} value={editing.js} onChange={e => set('js', e.target.value)} /></label>
      </div>
      <AiCodePanel target="component" L={L} current={{ html: editing.html, css: editing.css, js: editing.js }} onApply={code => setEditing({ ...editing, html: code.html, css: code.css, js: code.js, fields: code.fields ? code.fields.map(normalizeField).filter((f): f is ComponentField => !!f).slice(0, 20) : editing.fields })} />
      <div className={styles.previewHead}><b>پیش‌نمایش با مقدارهای پیش‌فرض</b><span className="bld-ai-sizes">{[390, 820, 1280].map(w => <button key={w} type="button" className={width === w ? 'is-selected' : ''} onClick={() => setWidth(w)}>{w}</button>)}</span></div>
      <div className="bld-ai-frame"><iframe title="پیش‌نمایش کامپوننت" sandbox="allow-scripts" srcDoc={preview} style={{ width }} /></div>
      <div className={styles.row}><button className="btn btn-primary" disabled={busy}>ذخیره</button><button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>انصراف</button></div>
    </form>}
  </div>
}
