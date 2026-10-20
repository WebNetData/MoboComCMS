'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from 'react'
import { Notice, ServerShell, bytes, fa, faDate, usePanel, useServerApi } from '../shared'

type Entry = { name: string; path: string; type: 'dir' | 'file' | 'link' | 'other'; size: number; mtime: string; mode: string; octal: string; owner: string; group: string; target?: string; image: boolean }
type Listing = { path: string; parent: string | null; writable: boolean; truncated: boolean; total: number; entries: Entry[] }
type OpenFile = { path: string; content: string; etag: string; size: number; writable: boolean; crlf: boolean }

const ARCHIVE = /\.(zip|tar|tar\.gz|tgz|tar\.xz|txz|tar\.bz2|tbz2)$/i
const join = (dir: string, name: string) => (dir === '/' ? `/${name}` : `${dir}/${name}`)

function Icon({ entry }: { entry: Entry }) {
  const common = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
  if (entry.type === 'dir') return <svg {...common} className="sp-ic is-dir"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
  if (entry.image) return <svg {...common} className="sp-ic is-img"><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="m21 16-5-5-8 8" /></svg>
  if (ARCHIVE.test(entry.name)) return <svg {...common} className="sp-ic is-zip"><path d="M6 3h9l5 5v13H6z" /><path d="M10 7h2M10 10h2M10 13h2" /></svg>
  if (entry.type === 'link') return <svg {...common} className="sp-ic"><path d="M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1" /><path d="M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1" /></svg>
  return <svg {...common} className="sp-ic"><path d="M6 3h9l5 5v13H6z" /><path d="M14 3v6h6" /></svg>
}

function Explorer() {
  const api = useServerApi()
  const { session } = usePanel()
  const [dir, setDir] = useState(() => (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('path')) || session.root)
  const [address, setAddress] = useState(dir)
  const [listing, setListing] = useState<Listing | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState('')
  const [busy, setBusy] = useState(false)
  const [editor, setEditor] = useState<(OpenFile & { draft: string }) | null>(null)
  const [preview, setPreview] = useState<Entry | null>(null)
  const [found, setFound] = useState<{ query: string; paths: string[]; truncated: boolean } | null>(null)
  const [dragging, setDragging] = useState(false)
  const upload = useRef<HTMLInputElement>(null)

  const load = useCallback(async (path: string) => {
    setError('')
    const result = await api<Listing>(`/api/admin/server/files?path=${encodeURIComponent(path)}`)
    if (!result.ok) { setError(result.error); return }
    setListing(result.data); setDir(result.data.path); setAddress(result.data.path); setSelected(new Set()); setFound(null)
    window.history.replaceState(null, '', `?path=${encodeURIComponent(result.data.path)}`)
  }, [api])
  useEffect(() => { void load(dir) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return (listing?.entries || []).filter((entry) => !q || entry.name.toLowerCase().includes(q))
  }, [listing, filter])

  async function op(body: Record<string, unknown>, success: string) {
    setBusy(true); setNotice(null)
    const result = await api<{ path?: string }>('/api/admin/server/files', { body })
    setBusy(false)
    setNotice(result.ok ? { tone: 'ok', text: success } : { tone: 'error', text: result.error })
    if (result.ok) await load(dir)
    return result.ok
  }

  async function open(entry: Entry) {
    if (entry.type === 'dir') { void load(entry.path); return }
    if (entry.image) { setPreview(entry); return }
    setBusy(true)
    const result = await api<OpenFile>(`/api/admin/server/files?read=${encodeURIComponent(entry.path)}`)
    setBusy(false)
    if (!result.ok) {
      if (result.status === 413 || result.status === 415) { if (window.confirm(`${result.error}\nدانلود شود؟`)) download(entry.path) }
      else setNotice({ tone: 'error', text: result.error })
      return
    }
    setEditor({ ...result.data, draft: result.data.content.replace(/\r\n/g, '\n') })
  }

  async function save() {
    if (!editor) return
    setBusy(true)
    const content = editor.crlf ? editor.draft.replace(/\r?\n/g, '\r\n') : editor.draft
    const result = await api<{ etag: string; size: number }>('/api/admin/server/files', { body: { op: 'write', path: editor.path, content, etag: editor.etag } })
    setBusy(false)
    if (!result.ok) { setNotice({ tone: 'error', text: result.error }); return }
    setEditor({ ...editor, content, etag: result.data.etag, size: result.data.size })
    setNotice({ tone: 'ok', text: `«${editor.path}» ذخیره شد.` })
  }

  function download(path: string) {
    const link = document.createElement('a')
    link.href = `/api/admin/server/files/download?path=${encodeURIComponent(path)}`
    link.rel = 'noopener'
    link.click()
  }

  async function sendFiles(files: FileList | File[]) {
    const list = Array.from(files)
    if (!list.length) return
    const existing = new Set(listing?.entries.map((entry) => entry.name))
    const clash = list.filter((file) => existing.has(file.name))
    const overwrite = clash.length > 0 && window.confirm(`${fa(clash.length)} فایل هم‌نام وجود دارد (${clash.slice(0, 3).map((f) => f.name).join('، ')}). جایگزین شوند؟`)
    if (clash.length && !overwrite) return
    const form = new FormData()
    form.set('dir', dir)
    form.set('overwrite', overwrite ? '1' : '0')
    for (const file of list) form.append('files', file)
    setBusy(true); setNotice(null)
    const result = await api<{ saved: string[] }>('/api/admin/server/files/upload', { form })
    setBusy(false)
    setNotice(result.ok ? { tone: 'ok', text: `${fa(result.data.saved.length)} فایل بارگذاری شد.` } : { tone: 'error', text: result.error })
    if (result.ok) void load(dir)
  }

  function onDrop(event: DragEvent) {
    event.preventDefault(); setDragging(false)
    if (listing?.writable && event.dataTransfer.files.length) void sendFiles(event.dataTransfer.files)
  }

  const picked = shown.filter((entry) => selected.has(entry.path))
  const toggle = (path: string) => setSelected((current) => { const next = new Set(current); if (next.has(path)) next.delete(path); else next.add(path); return next })
  const crumbs = dir.split('/').filter(Boolean)

  async function bulk(kind: 'copy' | 'move' | 'delete' | 'zip' | 'tar.gz' | 'download') {
    const paths = picked.map((entry) => entry.path)
    if (!paths.length) return
    if (kind === 'download') { paths.forEach(download); return }
    if (kind === 'delete') {
      if (!window.confirm(`${fa(paths.length)} مورد برای همیشه حذف شود؟ این کار برگشت‌پذیر نیست.\n\n${paths.slice(0, 6).join('\n')}`)) return
      await op({ op: 'delete', paths }, `${fa(paths.length)} مورد حذف شد.`); return
    }
    if (kind === 'zip' || kind === 'tar.gz') {
      const name = window.prompt('نام فایل آرشیو:', picked.length === 1 ? picked[0].name : 'archive')
      if (name) await op({ op: 'archive', dir, names: picked.map((entry) => entry.name), format: kind, name }, 'آرشیو ساخته شد.')
      return
    }
    const dest = window.prompt(kind === 'copy' ? 'کپی به پوشهٔ (مسیر کامل):' : 'انتقال به پوشهٔ (مسیر کامل):', dir)
    if (dest) await op({ op: kind, paths, dest }, kind === 'copy' ? 'کپی شد.' : 'منتقل شد.')
  }

  async function search() {
    const query = filter.trim()
    if (query.length < 2) return
    setBusy(true)
    const result = await api<{ paths: string[]; truncated: boolean }>(`/api/admin/server/files?find=${encodeURIComponent(query)}&path=${encodeURIComponent(dir)}`)
    setBusy(false)
    if (result.ok) setFound({ query, ...result.data }); else setNotice({ tone: 'error', text: result.error })
  }

  const places = [
    { label: 'ریشه', path: session.root }, { label: 'سایت', path: session.appDir }, { label: 'آپلودها', path: `${session.appDir}/storage` },
    { label: 'Nginx', path: '/etc/nginx' }, { label: 'لاگ‌ها', path: '/var/log' }, { label: 'وب', path: '/var/www' }, { label: 'خانه', path: '/home' }, { label: 'ایمیل', path: '/var/mail' },
  ]

  return <div className={`sp-fm${dragging ? ' is-drop' : ''}`} onDragOver={(e) => { if (listing?.writable) { e.preventDefault(); setDragging(true) } }} onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false) }} onDrop={onDrop}>
    <nav className="sp-places" aria-label="مکان‌های پرکاربرد">{places.map((place) => <button key={place.label} type="button" className="sp-place" onClick={() => void load(place.path)}>{place.label}</button>)}</nav>

    <form className="sp-pathbar" onSubmit={(e) => { e.preventDefault(); void load(address.trim() || '/') }}>
      <button type="button" className="btn btn-ghost btn-sm" disabled={!listing?.parent} onClick={() => listing?.parent && void load(listing.parent)} aria-label="پوشهٔ بالاتر">↑ بالا</button>
      <ol className="sp-crumbs" dir="ltr" aria-label="مسیر فعلی">
        <li><button aria-label="ریشهٔ فایل‌ها" type="button" onClick={() => void load('/')}>/</button></li>
        {crumbs.map((part, index) => <li key={index}><button type="button" onClick={() => void load(`/${crumbs.slice(0, index + 1).join('/')}`)}>{part}</button></li>)}
      </ol>
      <input className="input sp-address" dir="ltr" value={address} onChange={(e) => setAddress(e.target.value)} aria-label="رفتن به مسیر" spellCheck={false} />
      <button type="submit" className="btn btn-ghost btn-sm">برو</button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => void load(dir)} aria-label="تازه‌سازی">⟳</button>
    </form>

    <div className="sp-toolbar">
      <input className="input" value={filter} onChange={(e) => setFilter(e.target.value)} onKeyDown={(e: KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); void search() } }} placeholder="فیلتر این پوشه — Enter برای جست‌وجو در زیرپوشه‌ها" aria-label="فیلتر و جست‌وجو" />
      <button type="button" className="btn btn-ghost btn-sm" disabled={!listing?.writable || busy} onClick={() => { const name = window.prompt('نام پوشهٔ جدید:'); if (name) void op({ op: 'mkdir', dir, name }, 'پوشه ساخته شد.') }}>+ پوشه</button>
      <button type="button" className="btn btn-ghost btn-sm" disabled={!listing?.writable || busy} onClick={() => { const name = window.prompt('نام فایل جدید:'); if (name) void op({ op: 'touch', dir, name }, 'فایل ساخته شد.') }}>+ فایل</button>
      <button type="button" className="btn btn-primary btn-sm" disabled={!listing?.writable || busy} onClick={() => upload.current?.click()}>بارگذاری</button>
      <input ref={upload} type="file" multiple hidden onChange={(e) => { if (e.target.files) void sendFiles(e.target.files); e.target.value = '' }} />
    </div>

    {picked.length > 0 && <div className="sp-bulk" role="toolbar" aria-label="کارهای گروهی">
      <b>{fa(picked.length)} انتخاب</b>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => void bulk('download')}>دانلود</button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => void bulk('copy')}>کپی به…</button>
      <button type="button" className="btn btn-ghost btn-sm" disabled={!listing?.writable} onClick={() => void bulk('move')}>انتقال به…</button>
      <button type="button" className="btn btn-ghost btn-sm" disabled={!listing?.writable} onClick={() => void bulk('zip')}>فشرده (zip)</button>
      <button type="button" className="btn btn-ghost btn-sm" disabled={!listing?.writable} onClick={() => void bulk('tar.gz')}>tar.gz</button>
      <button type="button" className="btn btn-ghost btn-sm sp-danger" disabled={!listing?.writable} onClick={() => void bulk('delete')}>حذف</button>
      <button type="button" className="sa-link" onClick={() => setSelected(new Set())}>لغو انتخاب</button>
    </div>}

    {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
    {error && <Notice tone="error">{error}</Notice>}
    {listing && !listing.writable && <p className="sa-hint">این پوشه برای کاربر سرویس سایت فقط‌خواندنی است.</p>}

    {found && <section className="sa-card">
      <header className="sa-card-head"><h2>نتیجهٔ جست‌وجوی «{found.query}» در <bdi dir="ltr">{dir}</bdi></h2><button type="button" className="sa-link" onClick={() => setFound(null)}>بستن</button></header>
      {found.paths.length ? <ul className="sp-found" dir="ltr">{found.paths.map((path) => <li key={path}><button type="button" className="sa-link" onClick={() => void load(path.slice(0, path.lastIndexOf('/')) || '/')}>{path}</button></li>)}</ul> : <p className="sa-empty">چیزی پیدا نشد.</p>}
      {found.truncated && <p className="sa-hint">فقط ۳۰۰ نتیجهٔ اول نمایش داده شد.</p>}
    </section>}

    <section className="sa-card sa-table-wrap sp-list" aria-busy={busy}>
      {!listing ? <div className="sa-skeleton" /> : <table className="data sa-table">
        <thead><tr>
          <th className="sp-check"><input type="checkbox" aria-label="انتخاب همه" checked={shown.length > 0 && picked.length === shown.length} onChange={(e) => setSelected(e.target.checked ? new Set(shown.map((entry) => entry.path)) : new Set())} /></th>
          <th>نام</th><th>حجم</th><th>تغییر</th><th>دسترسی</th><th>مالک</th><th />
        </tr></thead>
        <tbody>
          {shown.map((entry) => <tr key={entry.path} className={selected.has(entry.path) ? 'is-selected' : ''}>
            <td className="sp-check"><input type="checkbox" aria-label={`انتخاب ${entry.name}`} checked={selected.has(entry.path)} onChange={() => toggle(entry.path)} /></td>
            <td className="sp-name"><button type="button" onClick={() => void open(entry)} dir="ltr"><Icon entry={entry} /><span>{entry.name}</span>{entry.target && <small>→ {entry.target}</small>}</button></td>
            <td className="num">{entry.type === 'dir' ? '—' : bytes(entry.size)}</td>
            <td><small>{faDate(entry.mtime, true)}</small></td>
            <td dir="ltr"><button type="button" className="sp-mode" title="تغییر سطح دسترسی" disabled={!listing.writable} onClick={() => { const mode = window.prompt(`سطح دسترسی «${entry.name}» (مثلاً 644 یا 755):`, entry.octal); if (mode && mode !== entry.octal) void op({ op: 'chmod', path: entry.path, mode }, 'سطح دسترسی تغییر کرد.') }}><code>{entry.mode}</code> <small>{entry.octal}</small></button></td>
            <td dir="ltr"><small>{entry.owner}:{entry.group}</small></td>
            <td className="sp-row-actions">
              {entry.type !== 'dir' && <button type="button" className="sa-link" onClick={() => download(entry.path)}>دانلود</button>}
              {entry.type === 'dir' && <button type="button" className="sa-link" onClick={() => download(entry.path)} title="دانلود پوشه به صورت tar.gz">دانلود</button>}
              {ARCHIVE.test(entry.name) && listing.writable && <button type="button" className="sa-link" onClick={() => { const dest = window.prompt('باز کردن در پوشهٔ:', dir); if (dest) void op({ op: 'extract', path: entry.path, dest }, 'آرشیو باز شد.') }}>باز کردن</button>}
              {listing.writable && <button type="button" className="sa-link" onClick={() => { const name = window.prompt('نام جدید:', entry.name); if (name && name !== entry.name) void op({ op: 'rename', path: entry.path, name }, 'نام تغییر کرد.') }}>تغییر نام</button>}
              {listing.writable && <button type="button" className="sa-link is-danger" onClick={() => { if (window.confirm(`«${entry.path}» برای همیشه حذف شود؟`)) void op({ op: 'delete', paths: [entry.path] }, 'حذف شد.') }}>حذف</button>}
            </td>
          </tr>)}
          {!shown.length && <tr><td colSpan={7} className="sa-empty">{filter ? 'موردی با این فیلتر نیست؛ برای جست‌وجو در زیرپوشه‌ها Enter بزنید.' : 'این پوشه خالی است.'}</td></tr>}
        </tbody>
      </table>}
      {listing && <footer className="sp-list-foot"><small>{fa(listing.total)} مورد{listing.truncated ? ' (فقط ۳۰۰۰ مورد اول)' : ''}</small>{listing.writable && <small>فایل‌ها را برای بارگذاری روی این بخش بکشید.</small>}</footer>}
    </section>

    {editor && <EditorDialog file={editor} busy={busy} onChange={(draft) => setEditor({ ...editor, draft })} onSave={() => void save()} onClose={() => { if (editor.draft === editor.content.replace(/\r\n/g, '\n') || window.confirm('تغییرات ذخیره نشده‌اند. بسته شود؟')) setEditor(null) }} />}
    {preview && <dialog open className="sp-preview" onClick={() => setPreview(null)} aria-label={preview.name}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/api/admin/server/files/download?inline=1&path=${encodeURIComponent(preview.path)}`} alt={preview.name} />
      <p dir="ltr">{preview.path} · {bytes(preview.size)}</p>
    </dialog>}
  </div>
}

function EditorDialog({ file, busy, onChange, onSave, onClose }: { file: OpenFile & { draft: string }; busy: boolean; onChange: (value: string) => void; onSave: () => void; onClose: () => void }) {
  const dirty = file.draft !== file.content.replace(/\r\n/g, '\n')
  const lines = file.draft.split('\n').length
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => { const node = ref.current; if (node && !node.open) node.showModal() }, [])
  return <dialog ref={ref} className="sp-editor" aria-label={`ویرایش ${file.path}`} onCancel={(e) => { e.preventDefault(); onClose() }}>
    <header>
      <div><b dir="ltr">{file.path}</b><small>{fa(lines)} خط · {bytes(file.size)}{file.crlf ? ' · CRLF' : ''}{!file.writable ? ' · فقط‌خواندنی' : ''}{dirty ? ' · تغییر ذخیره‌نشده' : ''}</small></div>
      <div className="sa-head-actions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>بستن</button>
        {file.writable && <button type="button" className="btn btn-primary btn-sm" disabled={busy || !dirty} onClick={onSave}>{busy ? 'در حال ذخیره…' : 'ذخیره (Ctrl+S)'}</button>}
      </div>
    </header>
    <textarea dir="ltr" spellCheck={false} value={file.draft} readOnly={!file.writable} onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); if (file.writable && dirty) onSave() }
        if (e.key === 'Tab' && !e.shiftKey && file.writable) {
          e.preventDefault()
          const el = e.currentTarget, start = el.selectionStart, end = el.selectionEnd
          onChange(`${file.draft.slice(0, start)}  ${file.draft.slice(end)}`)
          requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = start + 2 })
        }
      }} aria-label="محتوای فایل" />
  </dialog>
}

export default function FilesPage() {
  return <ServerShell title="مدیریت فایل سرور"><Explorer /></ServerShell>
}
