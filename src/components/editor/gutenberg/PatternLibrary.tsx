'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { useSelect } from '@wordpress/data'
import type { EngineBlockObject } from '@wordpress/block-editor'
import { fromEngineBlocks, toEngineBlocks } from '@/modules/editor/adapters/gutenberg/convert'
import { instantiatePattern } from '@/modules/editor/domain/structure'
import type { MoboComDocument } from '@/modules/editor/domain/document'
import type { BlockRegistry } from '@/modules/editor/domain/registry'
import { toLiveBlocks } from './blocks'

type Pattern = { id: number; title: string; kind: 'pattern' | 'template'; document: MoboComDocument; updatedAt: string }
export default function PatternLibrary({ entity, registry, canManage, current, apply }: { entity: string; registry: BlockRegistry; canManage: boolean; current: () => EngineBlockObject[]; apply: (blocks: EngineBlockObject[], replace: boolean) => void }) {
  const [open, setOpen] = useState(false), [rows, setRows] = useState<Pattern[] | null>(null), [title, setTitle] = useState(''), [kind, setKind] = useState<'pattern' | 'template'>('template')
  const [replace, setReplace] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [version, setVersion] = useState(0)
  const lock = useRef(false), id = useId(), endpoint = `/api/admin/editor/patterns?entity=${entity}`
  const selected = useSelect(select => (select('core/block-editor') as { getSelectedBlock(): EngineBlockObject | null }).getSelectedBlock(), [])
  useEffect(() => {
    if (!open) return
    const controller = new AbortController(); setRows(null); setMessage('')
    fetch(endpoint, { cache: 'no-store', signal: controller.signal }).then(async response => {
      const data = await response.json()
      if (!response.ok || !Array.isArray(data?.patterns)) throw Error(data?.error || 'الگوها دریافت نشدند.')
      if (!controller.signal.aborted) setRows(data.patterns)
    }).catch(error => { if (!controller.signal.aborted) setMessage(error.message || 'ارتباط برقرار نشد.') })
    return () => controller.abort()
  }, [open, endpoint, version])
  async function command(method: 'POST' | 'DELETE', body: unknown) {
    if (lock.current) return
    lock.current = true; setBusy(true); setMessage('')
    try {
      const response = await fetch(endpoint, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), data = await response.json().catch(() => null)
      if (!response.ok) throw Error(data?.error || 'ذخیره نشد.')
      setVersion(value => value + 1); setTitle('')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'ذخیره نشد.') }
    finally { lock.current = false; setBusy(false) }
  }
  return <section className="mc-patterns" aria-label="کتابخانهٔ الگوهای ویرایشگر">
    <button type="button" className="mc-editor-tool" aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}>الگوها و چیدمان‌ها</button>
    {open && <div id={id} className="mc-patterns-panel">
      <div><h2>کتابخانهٔ الگوها</h2><p>نسخه‌ای مستقل درج می‌شود؛ تغییر این نوشته، الگوی ذخیره‌شده را تغییر نمی‌دهد. بلوک‌های غیرفعال حفظ می‌شوند.</p></div>
      {canManage && <form className="mc-patterns-form" onSubmit={event => { event.preventDefault(); void command('POST', { title, kind, document: fromEngineBlocks(kind === 'pattern' && selected ? [selected] : current(), registry) }) }}>
        <label>نام الگو<input className="input" value={title} maxLength={100} onChange={event => setTitle(event.target.value)} required /></label>
        <label>محتوای الگو<select className="input" value={kind} onChange={event => setKind(event.target.value as typeof kind)}><option value="template">چیدمان کامل نوشته</option><option value="pattern">بلوک انتخاب‌شده با زیرمجموعه‌ها</option></select></label>
        <button type="submit" className="mc-editor-save" disabled={busy || !title.trim() || (kind === 'pattern' && !selected)}>ذخیرهٔ الگو</button>
      </form>}
      <label className="mc-patterns-replace"><input type="checkbox" checked={replace} onChange={event => setReplace(event.target.checked)} />جایگزینی تمام بلوک‌های فعلی هنگام درج؛ با واگرد قابل برگشت است</label>
      {!rows && !message ? <p role="status">در حال بارگذاری…</p> : null}
      {rows && <ul>{rows.map(row => <li key={row.id}><div><strong>{row.title}</strong><small>{row.kind === 'template' ? 'چیدمان کامل' : 'الگوی بلوک'} · {row.document.blocks.length.toLocaleString('fa-IR')} بلوک اصلی</small></div><button type="button" className="mc-editor-tool" disabled={busy} onClick={() => { apply(toLiveBlocks(toEngineBlocks(instantiatePattern(row.document), registry)), replace); setMessage(`«${row.title}» درج شد؛ تغییرات نوشته طبق روال ذخیره می‌شوند.`) }}>درج {row.title}</button>{canManage && <button type="button" className="mc-editor-tool" disabled={busy} aria-label={`حذف الگوی ${row.title}`} onClick={() => void command('DELETE', { id: row.id, updatedAt: row.updatedAt })}>حذف</button>}</li>)}</ul>}
      {rows?.length === 0 && <p>هنوز الگویی در این بخش ذخیره نشده است.</p>}
      {message && <p role="status">{message} {!rows && <button type="button" className="mc-editor-tool" onClick={() => setVersion(value => value + 1)}>تلاش دوباره</button>}</p>}
    </div>}
  </section>
}
