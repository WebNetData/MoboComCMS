'use client'

import Link from '@/components/AppLink'
import { useCallback, useEffect, useState } from 'react'
import type { PostStyleBase } from '@/modules/journal/domain/post-styles'
import PostStyleThumb from './PostStyleThumb'
import css from './post-styles.module.css'

type Meta = { id: string; type: string; name: string; status: 'draft' | 'published' }
type Drawing = { id: string; base?: string; sidebar?: boolean }
type Preset = { id: string; fa: string }

const API = '/api/admin/theme-templates'
const call = async (method: string, body?: unknown, query = '') => {
  const response = await fetch(`${API}${query}`, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined }).catch(() => null)
  const data = await response?.json().catch(() => null)
  return { ok: !!response?.ok, data, error: String(data?.error || 'انجام نشد؛ دوباره تلاش کنید') }
}

/** Opens a new article template (blank or from a ready one) in the page builder. */
export async function createPostTemplate(name: string, preset = ''): Promise<string> {
  const result = await call('POST', { type: 'single-post', name, preset })
  if (!result.ok) throw new Error(result.error)
  return String(result.data?.template?.id || '')
}

/**
 * «قالب‌های من»: the owner's article templates (the theme builder's single-post templates), made here from scratch or
 * from a ready one and designed in the page builder. Each can be renamed, copied, deleted, and set to dress every
 * article without a choice of its own; any of them can be chosen for one article or a kind of article.
 */
export default function MyPostTemplates({ drawings, presets, onChanged }: { drawings: Drawing[]; presets: Preset[]; onChanged: () => void }) {
  const [templates, setTemplates] = useState<Meta[] | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null)
  // The plainest start still has the title, cover, text and end of the article (a blank document would show only the text).
  const [draft, setDraft] = useState({ name: '', preset: 'post-classic' })
  const [note, setNote] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState('')
  const load = useCallback(async () => {
    const result = await call('GET')
    if (!result.ok) { setUnavailable(true); return }
    setTemplates((result.data?.templates || []).filter((entry: Meta) => entry.type === 'single-post'))
  }, [])
  useEffect(() => { void load() }, [load])
  if (unavailable) return null
  const done = async (text: string) => { setNote({ tone: 'ok', text }); await load(); onChanged() }
  const run = async (id: string, work: () => Promise<{ ok: boolean; error: string }>, text: string): Promise<boolean> => {
    setBusy(id); setNote(null)
    const result = await work()
    setBusy('')
    if (!result.ok) setNote({ tone: 'error', text: result.error }); else await done(text)
    return result.ok
  }
  const create = async () => {
    const name = draft.name.trim() || (presets.find((preset) => preset.id === draft.preset)?.fa ? `${presets.find((preset) => preset.id === draft.preset)?.fa} من` : 'قالب نوشتهٔ من')
    setBusy('new'); setNote(null)
    try { const id = await createPostTemplate(name, draft.preset); window.location.assign(`/admin/builder/${id}`) }
    catch (error) { setBusy(''); setNote({ tone: 'error', text: error instanceof Error ? error.message : 'ساخته نشد' }) }
  }
  const drawing = (id: string) => drawings.find((entry) => entry.id === id)
  // The switch answers at once and is put back if the change is refused.
  const toggleAuto = (template: Meta, auto: boolean) => {
    const status = auto ? 'draft' : 'published'
    setTemplates((list) => list?.map((entry) => (entry.id === template.id ? { ...entry, status } : entry)) ?? list)
    void run(template.id, () => call('PATCH', { id: template.id, status }), auto ? 'اعمال خودکار خاموش شد.' : 'از این پس روی نوشته‌های بدون انتخاب اعمال می‌شود.')
      .then((saved) => { if (!saved) void load() })
  }

  return <section className={css.block} aria-labelledby="ps-my-templates">
    <header className={css.blockHead}><h2 id="ps-my-templates">قالب‌های من</h2><small>قالب‌های نوشته‌ای که خودتان در صفحه‌ساز می‌سازید؛ ویرایش، کپی، حذف یا اعمال خودکار</small></header>
    {note && <p className={css.panelNote} role="status">{note.text}</p>}
    <div className={css.newTemplate}>
      <label className={css.field}><span>نام قالب تازه</span><input className="input" value={draft.name} maxLength={80} placeholder="مثلاً قالب نقد بازی" onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
      <label className={css.field}><span>شروع از</span>
        <select className="input" value={draft.preset} onChange={(event) => setDraft({ ...draft, preset: event.target.value })}>
          {presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.fa}</option>)}
        </select>
      </label>
      <button type="button" className="btn btn-primary" disabled={busy === 'new'} onClick={() => void create()}>{busy === 'new' ? 'در حال ساخت…' : 'ساخت و باز کردن در صفحه‌ساز'}</button>
    </div>
    {templates === null ? <div className="sa-skeleton" aria-busy="true" /> : templates.length === 0
      ? <p className="sa-hint">هنوز قالبی نساخته‌اید. از بالا یکی بسازید یا زیر هر قالب آماده «نسخهٔ من» را بزنید.</p>
      : <ul className={css.gallery} role="list">
        {templates.map((template) => {
          const art = drawing(template.id)
          const auto = template.status === 'published'
          return <li key={template.id} className={css.card} data-current={auto}>
            {auto && <span className={css.badge}>خودکار روی نوشته‌ها</span>}
            <span className={css.badgeTpl}>قالب من</span>
            <PostStyleThumb base={(art?.base || '') as PostStyleBase | ''} layout={!art?.base} sidebar={art?.sidebar} />
            {renaming?.id === template.id
              ? <form className={css.rename} onSubmit={(event) => { event.preventDefault(); void run(template.id, () => call('PATCH', { id: template.id, name: renaming.name }), 'نام قالب عوض شد.').then(() => setRenaming(null)) }}>
                <input className="input" aria-label="نام قالب" value={renaming.name} maxLength={80} autoFocus onChange={(event) => setRenaming({ id: template.id, name: event.target.value })} />
                <button type="submit" className="btn btn-primary" disabled={!renaming.name.trim() || busy === template.id}>ذخیره</button>
                <button type="button" className="btn btn-ghost" onClick={() => setRenaming(null)}>انصراف</button>
              </form>
              : <span className={css.cardText}><b>{template.name}</b><small>{auto ? 'روی هر نوشته‌ای که قالب یا استایل خودش را ندارد اعمال می‌شود.' : 'فقط وقتی برای یک نوشته یا یک نوع نوشته انتخاب شود.'}</small></span>}
            <label className="sa-check"><input type="checkbox" checked={auto} disabled={busy === template.id} onChange={() => toggleAuto(template, auto)} />اعمال خودکار روی نوشته‌ها</label>
            <span className={css.cardActions}>
              <Link className="btn btn-primary" href={`/admin/builder/${template.id}`}>ویرایش طرح<span className="sr-only"> {template.name}</span></Link>
              <button type="button" className="btn btn-ghost" onClick={() => setRenaming({ id: template.id, name: template.name })}>تغییر نام<span className="sr-only"> {template.name}</span></button>
              <button type="button" className="btn btn-ghost" disabled={busy === template.id} onClick={() => void run(template.id, () => call('POST', { action: 'duplicate', id: template.id }), 'یک کپی ساخته شد.')}>کپی<span className="sr-only"> {template.name}</span></button>
              <button type="button" className="btn btn-ghost" disabled={busy === template.id} onClick={() => { if (confirm(`قالب «${template.name}» حذف شود؟ نوشته‌هایی که آن را دارند به استایل نوع خود یا پیش‌فرض مجله برمی‌گردند.`)) void run(template.id, () => call('DELETE', undefined, `?id=${encodeURIComponent(template.id)}`), 'قالب حذف شد.') }}>حذف<span className="sr-only"> {template.name}</span></button>
            </span>
          </li>
        })}
      </ul>}
  </section>
}
