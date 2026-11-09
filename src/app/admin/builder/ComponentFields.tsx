'use client'
import { useEffect, useState } from 'react'
import Link from '@/components/AppLink'
import { componentValues, type ComponentDef } from '@/modules/site/domain/components'

type L = (en: string, fa: string) => string
let library: Promise<ComponentDef[]> | null = null
const loadLibrary = () => (library ||= fetch('/api/admin/components', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(d => d?.library?.components || []).catch(() => { library = null; return [] }))

/** Picks a site component for the block and edits its field values; the component's code is never edited here. */
export default function ComponentFields({ componentId, values, L, onChange }: { componentId: string; values: string; L: L; onChange: (props: { componentId: string; values: string }) => void }) {
  const [list, setList] = useState<ComponentDef[] | null>(null)
  useEffect(() => { let live = true; void loadLibrary().then(c => { if (live) setList(c) }); return () => { live = false } }, [])
  const def = list?.find(c => c.id === componentId)
  const current = def ? componentValues(def, values) : {}
  const set = (key: string, value: string) => onChange({ componentId, values: JSON.stringify({ ...current, [key]: value }) })

  if (!list) return <p className="muted text-sm" role="status">{L('Loading components…', 'در حال دریافت کامپوننت‌ها…')}</p>
  return <div className="bld-component">
    <label className="bld-field"><span>{L('Component', 'کامپوننت')}</span>
      <select className="select" value={def ? componentId : ''} onChange={e => { const next = list.find(c => c.id === e.target.value); onChange({ componentId: e.target.value, values: next ? JSON.stringify(componentValues(next, '{}')) : '{}' }) }}>
        <option value="">{L('Choose…', 'انتخاب کنید…')}</option>
        {[...new Set(list.map(c => c.category || ''))].map(cat => <optgroup key={cat} label={cat || L('Other', 'سایر')}>{list.filter(c => (c.category || '') === cat).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>)}
      </select>
    </label>
    {!list.length && <p className="muted text-sm">{L('No components yet.', 'هنوز کامپوننتی ساخته نشده است.')} <Link href="/admin/components" target="_blank">{L('Create one', 'ساخت کامپوننت')}</Link></p>}
    {def?.description && <p className="muted text-sm">{def.description}</p>}
    {def?.fields.map(f => {
      const value = current[f.key] ?? ''
      if (f.type === 'toggle') return <label className="bld-check" key={f.key}><input type="checkbox" checked={value === '1'} onChange={e => set(f.key, e.target.checked ? '1' : '')} />{f.label}</label>
      if (f.type === 'select') return <label className="bld-field" key={f.key}><span>{f.label}</span><select className="select" value={value} onChange={e => set(f.key, e.target.value)}>{f.options.map(o => <option key={o} value={o}>{o}</option>)}</select></label>
      if (f.type === 'textarea') return <label className="bld-field" key={f.key}><span>{f.label}</span><textarea className="textarea" rows={3} value={value} onChange={e => set(f.key, e.target.value)} /></label>
      if (f.type === 'color') return <label className="bld-field" key={f.key}><span>{f.label}</span><span className="bld-color-row"><input type="color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'} onChange={e => set(f.key, e.target.value)} /><input className="input mono" dir="ltr" value={value} onChange={e => set(f.key, e.target.value)} placeholder="#2563eb / var(--primary)" /></span></label>
      return <label className="bld-field" key={f.key}><span>{f.label}</span><input className="input" type={f.type === 'number' ? 'number' : 'text'} dir={f.type === 'url' || f.type === 'image' || f.type === 'number' ? 'ltr' : undefined} value={value} placeholder={f.type === 'image' ? '/uploads/… یا https://…' : f.type === 'url' ? '/page یا https://…' : undefined} onChange={e => set(f.key, e.target.value)} /></label>
    })}
    {def && <Link className="text-sm" href={`/admin/components#${def.id}`} target="_blank">{L('Edit this component’s design', 'ویرایش طراحی همین کامپوننت ↗')}</Link>}
  </div>
}
