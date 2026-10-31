'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { useSelect } from '@wordpress/data'
import type { EngineBlockObject } from '@wordpress/block-editor'
import { fromEngineBlocks, toEngineBlocks } from '@/modules/editor/adapters/gutenberg/convert'
import { instantiatePattern } from '@/modules/editor/domain/structure'
import { DOCUMENT_VERSION, type MoboComDocument } from '@/modules/editor/domain/document'
import { SYNCED_PATTERN_BLOCK } from '@/modules/editor/domain/module-blocks'
import type { BlockRegistry } from '@/modules/editor/domain/registry'
import { toLiveBlocks } from './blocks'

type Kind = 'pattern' | 'template' | 'synced'
type Pattern = { id: number; title: string; kind: Kind; document: MoboComDocument; updatedAt: string }
const KIND_LABEL: Record<Kind, string> = { template: 'چیدمان کامل', pattern: 'الگوی بلوک', synced: 'الگوی همگام' }

export default function PatternLibrary({ entity, registry, canManage, current, apply }: { entity: string; registry: BlockRegistry; canManage: boolean; current: () => EngineBlockObject[]; apply: (blocks: EngineBlockObject[], replace: boolean) => void }) {
  const [open, setOpen] = useState(false), [rows, setRows] = useState<Pattern[] | null>(null), [title, setTitle] = useState(''), [kind, setKind] = useState<Kind>(entity === 'posts' ? 'pattern' : 'template')
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
  async function command(method: 'POST' | 'PATCH' | 'DELETE', body: unknown, done: string) {
    if (lock.current) return
    lock.current = true; setBusy(true); setMessage('')
    try {
      const response = await fetch(endpoint, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), data = await response.json().catch(() => null)
      if (!response.ok) throw Error(data?.error || 'ذخیره نشد.')
      setVersion(value => value + 1); setTitle(''); setMessage(done)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'ذخیره نشد.') }
    finally { lock.current = false; setBusy(false) }
  }
  /** The blocks a pattern of this kind is made from: the whole document for a full layout, else the selected block. */
  const source = (of: Kind) => fromEngineBlocks(of === 'template' ? current() : selected ? [selected] : [], registry)
  /** A synced pattern goes in as one reference block; the others as an independent copy with fresh ids. */
  const insert = (row: Pattern) => {
    const document: MoboComDocument = row.kind === 'synced'
      ? instantiatePattern({ version: DOCUMENT_VERSION, blocks: [{ id: 'synced', type: SYNCED_PATTERN_BLOCK, version: registry.get(SYNCED_PATTERN_BLOCK)?.version ?? 1, props: { pattern: row.id, title: row.title } }] })
      : instantiatePattern(row.document)
    apply(toLiveBlocks(toEngineBlocks(document, registry)), replace)
    setMessage(row.kind === 'synced' ? `«${row.title}» به‌صورت همگام درج شد؛ هر تغییری در این الگو همه‌جا دیده می‌شود.` : `«${row.title}» درج شد؛ تغییرات نوشته طبق روال ذخیره می‌شوند.`)
  }
  return <section className="mc-patterns" aria-label="کتابخانهٔ الگوهای ویرایشگر">
    <button type="button" className="mc-editor-tool" aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}>الگوها و چیدمان‌ها</button>
    {open && <div id={id} className="mc-patterns-panel">
      <div><h2>کتابخانهٔ الگوها</h2><p>الگوی بلوک و چیدمان کامل به‌صورت نسخه‌ای مستقل درج می‌شوند. «الگوی همگام» فقط یک ارجاع درج می‌کند: با به‌روزرسانی الگو، همهٔ صفحه‌هایی که آن را دارند همان لحظه عوض می‌شوند. بلوک‌های غیرفعال حفظ می‌شوند.</p></div>
      {canManage && <form className="mc-patterns-form" onSubmit={event => { event.preventDefault(); void command('POST', { title, kind, document: source(kind) }, 'الگو ذخیره شد.') }}>
        <label>نام الگو<input className="input" value={title} maxLength={100} onChange={event => setTitle(event.target.value)} required /></label>
        <label>محتوای الگو<select className="input" value={kind} onChange={event => setKind(event.target.value as Kind)}>{entity !== 'posts' && <option value="template">چیدمان کامل صفحه</option>}<option value="pattern">بلوک انتخاب‌شده با زیرمجموعه‌ها</option><option value="synced">الگوی همگام از بلوک انتخاب‌شده</option></select></label>
        <button type="submit" className="mc-editor-save" disabled={busy || !title.trim() || (kind !== 'template' && !selected)}>ذخیرهٔ الگو</button>
      </form>}
      <label className="mc-patterns-replace"><input type="checkbox" checked={replace} onChange={event => setReplace(event.target.checked)} />جایگزینی تمام بلوک‌های فعلی هنگام درج؛ با واگرد قابل برگشت است</label>
      {!rows && !message ? <p role="status">در حال بارگذاری…</p> : null}
      {rows && <ul>{rows.map(row => <li key={row.id} className={row.kind === 'synced' ? 'is-synced' : undefined}>
        <div><strong>{row.title}</strong><small>{KIND_LABEL[row.kind] || row.kind} · {row.document.blocks.length.toLocaleString('fa-IR')} بلوک اصلی</small></div>
        <button type="button" className="mc-editor-tool" disabled={busy} onClick={() => insert(row)}>درج {row.title}</button>
        {canManage && <button type="button" className="mc-editor-tool" disabled={busy || (row.kind !== 'template' && !selected)} title={row.kind === 'template' ? 'چیدمان فعلی این نوشته جای محتوای الگو می‌نشیند' : 'بلوک انتخاب‌شده جای محتوای الگو می‌نشیند'} onClick={() => { if (window.confirm(row.kind === 'synced' ? `محتوای «${row.title}» با بلوک انتخاب‌شده جایگزین شود؟ همهٔ صفحه‌هایی که این الگوی همگام را دارند همان لحظه تغییر می‌کنند.` : `محتوای «${row.title}» جایگزین شود؟`)) void command('PATCH', { id: row.id, updatedAt: row.updatedAt, document: source(row.kind) }, `«${row.title}» به‌روزرسانی شد.`) }}>به‌روزرسانی {row.title}</button>}
        {canManage && <a className="mc-editor-tool" href={`/admin/history?type=patterns-${entity}&id=${row.id}`} target="_blank" rel="noopener" aria-label={`تاریخچهٔ نسخه‌های ${row.title} (در زبانهٔ تازه)`}>تاریخچه</a>}
        {canManage && <button type="button" className="mc-editor-tool" disabled={busy} aria-label={`حذف الگوی ${row.title}`} onClick={() => void command('DELETE', { id: row.id, updatedAt: row.updatedAt }, 'الگو حذف شد.')}>حذف</button>}
      </li>)}</ul>}
      {rows?.length === 0 && <p>هنوز الگویی در این بخش ذخیره نشده است.</p>}
      {message && <p role="status">{message} {!rows && <button type="button" className="mc-editor-tool" onClick={() => setVersion(value => value + 1)}>تلاش دوباره</button>}</p>}
    </div>}
  </section>
}
