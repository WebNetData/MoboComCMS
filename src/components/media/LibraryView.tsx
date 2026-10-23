'use client'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { LibraryAsset, LibraryFolder, LibraryKind } from '@/modules/media/domain/library'
import { uploadFile } from '@/components/admin/upload-file'
import { formatBytes, libraryApi } from './api'
import AssetDetails from './AssetDetails'
import FolderTree from './FolderTree'
import TransferPanel from './TransferPanel'
import LibrarySettings from './LibrarySettings'
import ConnectedLibrary from './ConnectedLibrary'
import CompatibleAudio from './CompatibleAudio'
import './library.css'

type Listing = { items: LibraryAsset[]; folders: LibraryFolder[]; total: number; page: number; pages: number; manage: boolean; configure?: boolean; serverTools?: boolean }
const KIND_LABELS = { image: 'تصویر', audio: 'صوت', video: 'ویدئو', document: 'سند', archive: 'آرشیو', file: 'فایل' }
export default function LibraryView({ onSelect, kind, renderSelection }: { onSelect?: (asset: LibraryAsset) => void; kind?: LibraryKind; renderSelection?: (asset: LibraryAsset) => ReactNode }) {
  const [data, setData] = useState<Listing>({ items: [], folders: [], total: 0, page: 1, pages: 1, manage: false })
  const [folder, setFolder] = useState('all'), [q, setQ] = useState(''), [type, setType] = useState(kind || ''), [trash, setTrash] = useState(false), [page, setPage] = useState(1)
  const [view, setView] = useState('grid'), [tab, setTab] = useState('files'), [selected, setSelected] = useState<string[]>([]), [version, setVersion] = useState(0), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const [newFolder, setNewFolder] = useState(''), [folderEdit, setFolderEdit] = useState(false), [parent, setParent] = useState(''), [moveTo, setMoveTo] = useState(''), [tags, setTags] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  const discovered = useRef(false)
  const [archivePath, setArchivePath] = useState('')
  const refresh = useCallback(() => setVersion(v => v + 1), [])
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setSelected([])
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ folder, q, kind: type, trash: trash ? '1' : '0', page: String(page) })
      fetch(`/api/admin/media/library?${params}`, { signal: controller.signal, cache: 'no-store' }).then(async r => { const body = await r.json(); if (!r.ok) throw new Error(body.error); setData(body); setSelected([]); setError(''); if (body.total === 0 && body.manage && !discovered.current && !q && !trash && folder === 'all') { discovered.current = true; void libraryApi({ action: 'discover' }).then(() => setVersion(v => v + 1)).catch(e => setError(e.message)) } }).catch(e => { if (!controller.signal.aborted) setError(e.message) }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    }, 180)
    return () => { clearTimeout(timer); controller.abort() }
  }, [folder, q, type, trash, page, version])
  const chosen = loading ? [] : data.items.filter(a => selected.includes(a.id))
  const currentFolder = data.folders.find(f => String(f.id) === folder)
  const pickFolder = (value: string) => { setFolder(value); setPage(1); setFolderEdit(false) }
  async function command(input: Record<string, unknown>) {
    setBusy(true); setError(''); setNotice('')
    try { await libraryApi(input); refresh(); setNotice('تغییرات ذخیره شد') } catch (e) { setError(e instanceof Error ? e.message : 'عملیات انجام نشد') } finally { setBusy(false) }
  }
  async function patch(patch: Record<string, unknown>) { await command({ action: 'assets.update', items: chosen.map(a => ({ id: a.id, revision: a.revision })), patch }) }
  async function upload(files: FileList | File[]) {
    setBusy(true); setError('')
    try {
      for (const file of [...files]) {
        setNotice(`در حال بارگذاری ${file.name}…`)
        let result: { assetId?: string; revision?: number }
        if (['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
          const form = new FormData(); form.append('file', file)
          const r = await fetch('/api/admin/media', { method: 'POST', body: form }); const body = await r.json(); if (!r.ok) throw new Error(body.error); result = body
        } else result = await uploadFile(file, 'general', sent => setNotice(`${file.name} · ${Math.floor(sent / file.size * 100)}٪`)) as typeof result
        if (result.assetId && currentFolder) await libraryApi({ action: 'assets.update', items: [{ id: result.assetId, revision: result.revision || 0 }], patch: { folderId: currentFolder.id } })
      }
      setNotice('بارگذاری تکمیل شد'); refresh()
    } catch (e) { setError(e instanceof Error ? e.message : 'بارگذاری انجام نشد'); refresh() } finally { setBusy(false) }
  }
  async function discover() {
    setBusy(true); setError(''); let cursor: string | null = '', count = 0
    try { do { const r: { cursor: string | null; count: number } = await libraryApi({ action: 'discover', cursor }); cursor = r.cursor; count += r.count; setNotice(`${count.toLocaleString('fa-IR')} فایل بررسی شد`) } while (cursor); refresh() } catch (e) { setError(e instanceof Error ? e.message : 'نمایه‌سازی انجام نشد') } finally { setBusy(false) }
  }
  return <div className="mcl" dir="rtl">
    <div className="mcl-topline"><div><span className="mcl-eyebrow">رسانه‌های سایت</span><h2>یک کتابخانه، برای همهٔ محتواها</h2><p>فایل‌ها را مرتب کنید و هر بار از همان رسانه استفاده کنید.</p></div><div className="mcl-actions"><button type="button" className="btn btn-primary" disabled={busy} onClick={() => fileInput.current?.click()}>＋ بارگذاری فایل</button><button type="button" className="btn btn-ghost" onClick={() => setTab('transfers')}>↓ دریافت از لینک</button></div><input type="file" ref={fileInput} hidden multiple onChange={e => { if (e.target.files?.length) void upload(e.target.files); e.target.value = '' }} /></div>
    <nav className="mcl-tabs" aria-label="بخش‌های کتابخانه"><button type="button" aria-current={tab === 'files' ? 'page' : undefined} onClick={() => { setTab('files'); refresh() }}>کتابخانه <b>{data.total.toLocaleString('fa-IR')}</b></button><button type="button" aria-current={tab === 'transfers' ? 'page' : undefined} onClick={() => setTab('transfers')}>انتقال‌ها</button>{data.serverTools && <button type="button" aria-current={tab === 'connected' ? 'page' : undefined} onClick={() => { setArchivePath(''); setTab('connected') }}>فضاهای متصل و آرشیوها</button>}{data.configure && <button type="button" aria-current={tab === 'settings' ? 'page' : undefined} onClick={() => setTab('settings')}>تنظیمات</button>}</nav>
    {error && <p className="mcl-message is-error" role="alert">{error}</p>}<p className="mcl-message" role="status">{notice}</p>
    {tab === 'connected' ? <ConnectedLibrary key={archivePath} initialPath={archivePath} kind={kind} onSelect={onSelect} /> : tab === 'transfers' ? <TransferPanel folderId={currentFolder?.id || null} onChange={refresh} /> : tab === 'settings' ? <LibrarySettings /> : <div className="mcl-workspace">
      <aside className="mcl-folders" aria-label="پوشه‌ها"><h3>پوشه‌های من</h3><button type="button" aria-current={folder === 'all' ? 'true' : undefined} onClick={() => pickFolder('all')}>▧ همهٔ فایل‌ها</button><button type="button" aria-current={folder === '' ? 'true' : undefined} onClick={() => pickFolder('')}>▱ بدون پوشه</button><FolderTree folders={data.folders} selected={folder} onSelect={pickFolder} />
        <form className="mcl-folder-form" onSubmit={e => { e.preventDefault(); void command({ action: folderEdit ? 'folder.update' : 'folder.create', ...(folderEdit && currentFolder ? { id: currentFolder.id, revision: currentFolder.revision } : {}), name: newFolder, parentId: folderEdit ? parent : currentFolder?.id || null }); setNewFolder('') }}>
          <label>{folderEdit ? 'تغییر پوشه' : currentFolder ? 'زیرپوشهٔ جدید' : 'پوشهٔ جدید'}<input className="input" value={newFolder} maxLength={120} required onChange={e => setNewFolder(e.target.value)} /></label>
          {folderEdit && data.manage && <label>داخل پوشه<select className="select" value={parent} onChange={e => setParent(e.target.value)}><option value="">ریشه</option>{data.folders.filter(f => f.id !== currentFolder?.id).map(f => <option value={f.id} key={f.id}>{f.name} (#{f.id})</option>)}</select></label>}
          <button type="submit" className="btn btn-ghost btn-sm" disabled={busy}>{folderEdit ? 'ذخیرهٔ پوشه' : '＋ ساخت پوشه'}</button>
        </form>
        {currentFolder?.editable && <div className="mcl-actions"><button className="btn btn-ghost btn-sm" type="button" onClick={() => { setFolderEdit(!folderEdit); setNewFolder(currentFolder.name); setParent(String(currentFolder.parentId || '')) }}>ویرایش</button><button className="btn btn-ghost btn-sm" type="button" disabled={busy} onClick={() => void command({ action: 'folder.delete', id: currentFolder.id, revision: currentFolder.revision })}>حذف پوشهٔ خالی</button></div>}
        <hr /><button type="button" onClick={() => { setTrash(!trash); setPage(1) }} aria-pressed={trash}>♲ {trash ? 'بازگشت به فایل‌ها' : 'زباله‌دان'}</button>{data.manage && <button type="button" disabled={busy} onClick={() => void discover()}>↻ یافتن فایل‌های قبلی سایت</button>}<small>زباله‌دان فقط فایل را از کتابخانه پنهان می‌کند؛ محتوای پست‌ها و لینک‌ها حفظ می‌شوند.</small>
      </aside>
      <section className="mcl-main" aria-label="فایل‌های کتابخانه" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (!busy && e.dataTransfer.files.length) void upload(e.dataTransfer.files) }}>
        <div className="mcl-toolbar"><label className="mcl-search">جست‌وجوی نام، توضیح یا تگ<input type="search" className="input" placeholder="جست‌وجو در رسانه‌ها…" value={q} onChange={e => { setQ(e.target.value); setPage(1) }} /></label><label>نوع فایل<select className="select" value={type} disabled={!!kind} onChange={e => { setType(e.target.value); setPage(1) }}><option value="">همهٔ انواع</option>{Object.entries(KIND_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}</select></label><button type="button" className="btn btn-ghost" onClick={() => setView(view === 'grid' ? 'list' : 'grid')}>{view === 'grid' ? '☷ فهرست' : '▦ شبکه'}</button></div>
        <div className="mcl-bulk"><label className="mcl-check"><input type="checkbox" disabled={loading || busy} checked={data.items.length > 0 && selected.length === data.items.length} onChange={e => setSelected(e.target.checked ? data.items.map(a => a.id) : [])} /> انتخاب این صفحه</label>{selected.length > 0 && <><span>{selected.length.toLocaleString('fa-IR')} انتخاب</span><label>انتقال به<select className="select" value={moveTo} onChange={e => setMoveTo(e.target.value)}><option value="">بدون پوشه</option>{data.folders.map(f => <option key={f.id} value={f.id}>{f.name} (#{f.id})</option>)}</select></label><button type="button" className="btn btn-ghost btn-sm" disabled={busy || chosen.some(a => !a.editable)} onClick={() => void patch({ folderId: moveTo || null })}>انتقال</button><label>تگ گروهی<input className="input" value={tags} onChange={e => setTags(e.target.value)} /></label><button type="button" className="btn btn-ghost btn-sm" disabled={busy || chosen.some(a => !a.editable)} onClick={() => void patch({ tags })}>ثبت تگ‌ها</button><button type="button" className="btn btn-ghost btn-sm" disabled={busy || chosen.some(a => !a.editable)} onClick={() => void patch({ archived: !trash })}>{trash ? 'بازیابی' : 'به زباله‌دان'}</button></>}</div>
        <div className={`mcl-assets is-${view}`} aria-busy={loading}>{(!loading ? data.items : []).map(a => <article className={`mcl-asset${selected.includes(a.id) ? ' is-selected' : ''}`} key={a.id}><label className="mcl-asset-check"><input type="checkbox" aria-label={`انتخاب ${a.name}`} checked={selected.includes(a.id)} onChange={e => setSelected(e.target.checked ? [...selected, a.id] : selected.filter(id => id !== a.id))} /></label><button type="button" className="mcl-preview" aria-label={`جزئیات ${a.name}`} onClick={() => setSelected([a.id])}>{a.kind === 'image' ? <img src={a.url + (a.url.startsWith('/api/media/covers/') ? '?w=320' : '')} alt={a.alt} loading="lazy" /> : <span aria-hidden="true">{a.kind === 'video' ? '▷' : a.kind === 'audio' ? '♫' : '▤'}</span>}</button><div className="mcl-asset-info"><strong title={a.name}>{a.name}</strong><small><span>{KIND_LABELS[a.kind]}</span><span dir="ltr">{formatBytes(Number(a.bytes))}</span></small>{a.tags.length > 0 && <p>{a.tags.slice(0, 3).map(t => <button type="button" key={t} onClick={() => { setQ(t); setPage(1) }}>{t}</button>)}</p>}</div></article>)}</div>
        {!loading && !data.items.length && <div className="mcl-empty"><span aria-hidden="true">▧</span><h3>{q ? 'فایلی با این جست‌وجو پیدا نشد' : 'این‌جا هنوز فایلی ندارید'}</h3><p>فایل را این‌جا رها کنید، بارگذاری کنید یا از لینک دریافت کنید.</p></div>}
        <nav className="mcl-pagination" aria-label="صفحه‌بندی کتابخانه"><button type="button" className="btn btn-ghost" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}>صفحهٔ قبل</button><span>{page.toLocaleString('fa-IR')} از {data.pages.toLocaleString('fa-IR')}</span><button type="button" className="btn btn-ghost" disabled={page >= data.pages || loading} onClick={() => setPage(page + 1)}>صفحهٔ بعد</button></nav>
      </section>
      {chosen.length === 1 && <aside className="mcl-inspector" aria-label="جزئیات فایل">{onSelect && !trash && <button className="btn btn-primary mcl-select" type="button" onClick={() => onSelect(chosen[0])}>استفاده از این فایل ←</button>}{data.serverTools && chosen[0].kind === 'archive' && chosen[0].url.startsWith('/files/') && <button type="button" className="btn btn-ghost" onClick={() => { setArchivePath(decodeURIComponent(chosen[0].url.slice(6))); setTab('connected') }}>ویرایش آرشیو و رمز</button>}{renderSelection ? renderSelection(chosen[0]) : <AssetDetails key={`${chosen[0].id}:${chosen[0].revision}`} asset={chosen[0]} folders={data.folders} onSave={patch} />}{data.manage && !trash && chosen[0].kind === 'video' && <CompatibleAudio key={chosen[0].id} assetId={chosen[0].id} />}</aside>}
    </div>}
  </div>
}
