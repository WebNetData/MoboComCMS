'use client'
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Notice, bytes, fa, faDate, useServerApi, useServerJson } from '@/app/admin/server/shared'
import { EMPTY_STORAGE, KIND_LABEL, STATUS, PHASE, TEXT_EXT, type Entry, type Overview, type ArchiveListing, type Job, type Listing, type Tone } from './types'
import StorageForm from './StorageForm'
import ArchivePanel from './ArchivePanel'
import Editor from './FileEditor'
import Jobs from './Jobs'
import { Crumbs } from './common'
export default function DownloadCenter({ initialPath = '', onPick }: { initialPath?: string; onPick?: (entry: Entry) => void }) {
  const api = useServerApi()
  const overview = useServerJson<Overview>('/api/admin/server/downloads')
  const [storage, setStorage] = useState('local')
  const [dir, setDir] = useState(initialPath ? initialPath.slice(0, initialPath.lastIndexOf('/')) || '/' : '/')
  const listing = useServerJson<Listing>(`/api/admin/server/downloads?view=list&storage=${encodeURIComponent(storage)}&dir=${encodeURIComponent(dir)}`)
  const [jobs, setJobs] = useState<Job[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [notice, setNotice] = useState<Tone>(null)
  const [busy, setBusy] = useState(false)
  const [storageForm, setStorageForm] = useState<typeof EMPTY_STORAGE | null>(null)
  const [archive, setArchive] = useState<Entry | null>(null)
  const opened = useRef(false)
  useEffect(() => { if (!opened.current && initialPath && listing.data) { opened.current = true; const entry = listing.data.entries.find(e => e.path === initialPath); if (entry?.archive) setArchive(entry) } }, [initialPath, listing.data])
  const [editing, setEditing] = useState<Entry | null>(null)
  const [urls, setUrls] = useState('')
  const [filter, setFilter] = useState('')
  const [baseUrl, setBaseUrl] = useState<string | null>(null)
  const upload = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const data = overview.data
  const current = data?.storages.find((item) => item.id === storage)
  useEffect(() => { if (data) setJobs(data.jobs) }, [data])
  useEffect(() => { setSelected([]); setArchive(null); setEditing(null) }, [storage, dir])

  const active = jobs.some((job) => job.status === 'running' || job.status === 'queued')
  const jobsRef = useRef<Job[]>([])
  useEffect(() => { jobsRef.current = jobs }, [jobs])
  const reloadList = listing.reload
  const refreshJobs = useCallback(async () => {
    const result = await api<{ jobs: Job[] }>('/api/admin/server/downloads?view=jobs')
    if (!result.ok) return
    const finishedNow = result.data.jobs.some((job) => job.status === 'done' && jobsRef.current.some((old) => old.id === job.id && old.status !== 'done'))
    setJobs(result.data.jobs)
    if (finishedNow) void reloadList()
  }, [api, reloadList])
  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => void refreshJobs(), 1500)
    return () => clearInterval(timer)
  }, [active, refreshJobs])

  async function op(body: Record<string, unknown>, success: string) {
    setBusy(true); setNotice(null)
    const result = await api('/api/admin/server/downloads', { body: { storage, ...body } })
    setBusy(false)
    setNotice(result.ok ? { tone: 'ok', text: success } : { tone: 'error', text: result.error })
    if (result.ok) { void listing.reload(); void refreshJobs(); setSelected([]) }
    return result.ok
  }

  async function sendUploads(files: FileList | null) {
    if (!files?.length) return
    const form = new FormData()
    form.set('storage', storage); form.set('dir', dir)
    for (const file of Array.from(files)) form.append('files', file)
    setUploading(true); setNotice(null)
    const result = await api<{ saved: string[] }>('/api/admin/server/downloads/upload', { form })
    setUploading(false)
    setNotice(result.ok ? { tone: 'ok', text: `${fa(result.data.saved.length)} فایل بارگذاری شد.` } : { tone: 'error', text: result.error })
    if (upload.current) upload.current.value = ''
    void listing.reload()
  }

  const entries = useMemo(() => (listing.data?.entries || []).filter((entry) => !filter || entry.name.toLowerCase().includes(filter.toLowerCase())), [listing.data, filter])
  const toggle = (target: string) => setSelected((list) => list.includes(target) ? list.filter((item) => item !== target) : [...list, target])
  const copy = (text: string) => { void navigator.clipboard?.writeText(text); setNotice({ tone: 'ok', text: 'پیوند کپی شد.' }) }
  const others = (data?.storages || []).filter((item) => item.id !== storage)

  if (overview.error) return <Notice tone="error">{overview.error}</Notice>
  if (!data) return <div className="sa-skeleton" />
  const disk = data.local

  return <>
    <section className="dl-storages" aria-label="فضاهای ذخیره">
      {data.storages.map((item) => <button key={item.id} type="button" className={`dl-storage${storage === item.id ? ' is-active' : ''}`} onClick={() => { setStorage(item.id); setDir('/') }} aria-pressed={storage === item.id}>
        <span className={`dl-storage-icon is-${item.kind}`} aria-hidden="true">{item.kind === 'local' ? '⌂' : item.kind === 'sftp' ? '⇅' : '⇡'}</span>
        <span className="dl-storage-text"><b>{item.name}</b><small>{item.kind === 'local' ? (disk.free !== null ? `${bytes(disk.free)} آزاد از ${bytes(disk.size || 0)}` : disk.root) : `${KIND_LABEL[item.kind]} · ${item.host}`}</small></span>
      </button>)}
      <button type="button" className="dl-storage is-add" onClick={() => setStorageForm({ ...EMPTY_STORAGE })}><span className="dl-storage-icon" aria-hidden="true">+</span><span className="dl-storage-text"><b>اتصال سرور/هاست دانلود</b><small>SFTP یا FTP</small></span></button>
    </section>

    {storageForm && <StorageForm key={storageForm.id || 'new'} initial={storageForm} onCancel={() => setStorageForm(null)} onDone={() => { setStorageForm(null); void overview.reload(); setNotice({ tone: 'ok', text: 'اتصال آزمایش و ذخیره شد.' }) }} />}

    {current && <section className="sa-card dl-storage-bar">
      <div className="dl-storage-meta">
        <b>{current.name}</b>
        <small>{current.kind === 'local' ? <>پوشه: <bdi dir="ltr">{disk.root}</bdi></> : <><bdi dir="ltr">{current.username}@{current.host}:{current.port}{current.root}</bdi></>}</small>
        <small>نشانی عمومی: {current.baseUrl ? <bdi dir="ltr">{current.baseUrl}</bdi> : <span className="dl-warn">تعیین نشده — پیوند مستقیم ساخته نمی‌شود</span>}</small>
      </div>
      <div className="sa-head-actions">
        {current.kind === 'local' ? (baseUrl === null
          ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => setBaseUrl(current.baseUrl)}>تنظیم نشانی عمومی</button>
          : <form className="sa-toolbar" onSubmit={(e) => { e.preventDefault(); void op({ op: 'base-url', url: baseUrl }, 'نشانی عمومی ذخیره شد.').then((done) => { if (done) { setBaseUrl(null); void overview.reload() } }) }}>
            <input className="input" dir="ltr" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value.trim())} placeholder="https://dl.mobocom.net" aria-label="نشانی عمومی" />
            <button type="submit" className="btn btn-primary btn-sm">ذخیره</button><button type="button" className="btn btn-ghost btn-sm" onClick={() => setBaseUrl(null)}>انصراف</button>
          </form>)
          : <>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void op({ op: 'storage-test', id: current.id }, 'اتصال برقرار است.')}>آزمایش اتصال</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStorageForm({ ...EMPTY_STORAGE, ...current, secret: '' })}>ویرایش</button>
            <button type="button" className="btn btn-ghost btn-sm sp-danger" onClick={() => { if (window.confirm(`اتصال «${current.name}» حذف شود؟ فایل‌های روی آن سرور دست نمی‌خورند.`)) void op({ op: 'storage-delete', id: current.id }, 'اتصال حذف شد.').then(() => { setStorage('local'); void overview.reload() }) }}>حذف اتصال</button>
          </>}
      </div>
      {current.kind === 'local' && !current.baseUrl && <p className="sa-hint dl-span">برای پیوند مستقیم مثل <bdi dir="ltr">https://dl.mobocom.net/file.zip</bdi>، در «دامنه و SSL» یک زیردامنه با کاربرد «پوشهٔ فایل» و مسیر <bdi dir="ltr">{disk.root}</bdi> بسازید و همان نشانی را این‌جا وارد کنید. <a className="text-link" href="/admin/server/domains">دامنه و SSL</a></p>}
    </section>}

    {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
    {archive && <ArchivePanel key={archive.path} entry={archive} tools={data.tools} onClose={() => setArchive(null)} onQueued={(text) => { setNotice({ tone: 'ok', text }); void refreshJobs() }} />}
    {editing && <Editor key={editing.path} storage={storage} entry={editing} onClose={() => setEditing(null)} onSaved={() => void listing.reload()} />}

    <div className="dl-layout">
      <section className="sa-card dl-files">
        <header className="dl-files-head">
          <Crumbs dir={dir} onOpen={setDir} />
          <div className="sa-toolbar">
            <input className="input dl-filter" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="فیلتر نام…" aria-label="فیلتر" />
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { const name = window.prompt('نام پوشهٔ تازه:'); if (name) void op({ op: 'mkdir', dir, name }, 'پوشه ساخته شد.') }}>پوشهٔ تازه</button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={uploading} onClick={() => upload.current?.click()}>{uploading ? 'در حال بارگذاری…' : 'بارگذاری فایل'}</button>
            <input ref={upload} type="file" multiple hidden onChange={(e) => void sendUploads(e.target.files)} />
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void listing.reload()} aria-label="تازه‌سازی">⟳</button>
          </div>
        </header>
        {selected.length > 0 && <div className="dl-bulk">
          <b>{fa(selected.length)} مورد انتخاب شد</b>
          <button type="button" className="sa-link" onClick={() => { const dest = window.prompt('انتقال به پوشه (مسیر از ریشه):', dir); if (dest) void op({ op: 'move', paths: selected, dest }, 'منتقل شد.') }}>انتقال به پوشه</button>
          {others.length > 0 && <select className="select btn-sm" value="" onChange={(e) => { const to = e.target.value; if (!to) return; const target = window.prompt('پوشهٔ مقصد روی فضای مقصد:', '/'); if (target) void op({ op: 'transfer', paths: selected, to, dir: target }, 'ارسال به فضای دیگر در صف قرار گرفت.') }} aria-label="ارسال به فضای دیگر">
            <option value="">ارسال به فضای دیگر…</option>{others.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>}
          {storage === 'local' && <button type="button" className="sa-link" onClick={() => {
            const format = (window.prompt('قالب آرشیو: zip، 7z یا rar', 'zip') || '').trim().toLowerCase()
            if (!['zip', '7z', 'rar'].includes(format)) return
            const password = window.prompt('رمز آرشیو (خالی = بدون رمز):', '') ?? ''
            void op({ op: 'pack', dir, names: selected.map((item) => item.split('/').pop()), format, newPassword: password }, 'ساخت آرشیو در صف قرار گرفت.')
          }}>فشرده‌سازی</button>}
          <button type="button" className="sa-link is-danger" onClick={() => { if (window.confirm(`${fa(selected.length)} مورد برای همیشه حذف شود؟`)) void op({ op: 'delete', paths: selected }, 'حذف شد.') }}>حذف</button>
          <button type="button" className="sa-link" onClick={() => setSelected([])}>لغو انتخاب</button>
        </div>}
        {listing.error && <Notice tone="error">{listing.error}</Notice>}
        <div className="sa-table-wrap">
          <table className="data sa-table dl-table" style={{ minWidth: 640 }}>
            <thead><tr><th style={{ inlineSize: 32 }}><input type="checkbox" aria-label="انتخاب همه" checked={!!entries.length && selected.length === entries.length} onChange={(e) => setSelected(e.target.checked ? entries.map((entry) => entry.path) : [])} /></th><th>نام</th><th>حجم</th><th>تاریخ</th><th /></tr></thead>
            <tbody>
              {listing.data?.parent !== null && listing.data && <tr><td /><td colSpan={4}><button type="button" className="dl-name is-dir" onClick={() => setDir(listing.data!.parent || '/')}>↰ پوشهٔ بالاتر</button></td></tr>}
              {!listing.data && <tr><td colSpan={5}><div className="sa-skeleton" style={{ height: 160 }} /></td></tr>}
              {entries.map((entry) => <tr key={entry.path} className={selected.includes(entry.path) ? 'is-selected' : ''}>
                <td><input type="checkbox" checked={selected.includes(entry.path)} onChange={() => toggle(entry.path)} aria-label={`انتخاب ${entry.name}`} /></td>
                <td>{entry.type === 'dir'
                  ? <button type="button" className="dl-name is-dir" onClick={() => setDir(entry.path)} dir="auto">📁 {entry.name}</button>
                  : <span className="dl-name" dir="auto">{entry.archive ? '🗜' : '📄'} {entry.name}{entry.archive && <span className="dl-badge">{entry.archive.toUpperCase()}</span>}</span>}</td>
                <td className="num">{entry.type === 'dir' ? '—' : bytes(entry.size)}</td>
                <td><small>{new Date(entry.mtime).getTime() > 0 ? faDate(entry.mtime, true) : '—'}</small></td>
                <td className="sp-row-actions">
                  {onPick && entry.type === 'file' && <button type="button" className="btn btn-primary btn-sm" disabled={!entry.url} onClick={() => onPick(entry)}>استفاده از فایل</button>}
                  {storage !== 'local' && entry.type === 'file' && <button type="button" className="sa-link" onClick={() => void op({ op: 'transfer', paths: [entry.path], to: 'local', dir: '/uploads/general/' + new Date().toISOString().slice(0, 7) }, 'کپی در کتابخانه در صف قرار گرفت.')}>کپی به کتابخانه</button>}
                  {entry.url && <button type="button" className="sa-link" onClick={() => copy(entry.url)} title={entry.url}>کپی پیوند</button>}
                  {entry.archive && storage === 'local' && <button type="button" className="sa-link" onClick={() => { setEditing(null); setArchive(entry) }}>آرشیو و رمز</button>}
                  {entry.type === 'file' && TEXT_EXT.test(entry.name) && entry.size <= 2 * 1024 * 1024 && <button type="button" className="sa-link" onClick={() => { setArchive(null); setEditing(entry) }}>ویرایش</button>}
                  <button type="button" className="sa-link" onClick={() => { const name = window.prompt('نام تازه (با پسوند):', entry.name); if (name && name !== entry.name) void op({ op: 'rename', path: entry.path, name }, 'نام تغییر کرد.') }}>تغییر نام</button>
                  {entry.type === 'file' && <a className="sa-link" href={`/api/admin/server/downloads?view=file&storage=${encodeURIComponent(storage)}&path=${encodeURIComponent(entry.path)}`}>دریافت</a>}
                  <button type="button" className="sa-link is-danger" onClick={() => { if (window.confirm(`«${entry.name}» حذف شود؟`)) void op({ op: 'delete', paths: [entry.path] }, 'حذف شد.') }}>حذف</button>
                </td>
              </tr>)}
              {listing.data && !entries.length && <tr><td colSpan={5} className="sa-empty">{filter ? 'چیزی با این نام نیست.' : 'این پوشه خالی است.'}</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <aside className="sa-stack dl-side">
        <form className="sa-card sa-form" onSubmit={(e) => { e.preventDefault(); void op({ op: 'fetch', dir, list: urls }, 'دانلود در صف قرار گرفت؛ پیشرفت را در «کارها» ببینید.').then((done) => { if (done) setUrls('') }) }}>
          <header className="sa-card-head"><h2>دانلود از نشانی</h2></header>
          <p className="sa-hint">فایل مستقیم روی «{current?.name}» در پوشهٔ <bdi dir="ltr">{dir}</bdi> ذخیره می‌شود؛ لازم نیست اول روی رایانهٔ خودتان دانلود کنید. هر نشانی در یک خط؛ برای نام دلخواه: <bdi dir="ltr">URL | name.zip</bdi></p>
          <textarea className="input dl-urls" dir="ltr" rows={4} value={urls} onChange={(e) => setUrls(e.target.value)} placeholder={'https://example.com/file.rar\nhttps://example.com/a.zip | my-name.zip'} aria-label="نشانی‌های دانلود" />
          <button type="submit" className="btn btn-primary" disabled={busy || !urls.trim()}>شروع دانلود</button>
        </form>
        <Jobs jobs={jobs} onChange={() => void refreshJobs()} />
        <section className="sa-card dl-tools">
          <header className="sa-card-head"><h2>ابزارهای آرشیو سرور</h2></header>
          <ul className="sp-checks">
            <li><span className={`sa-state ${data.tools.sevenZip ? 'is-ok' : 'is-warn'}`}>{data.tools.sevenZip ? 'آماده' : 'نصب نیست'}</span>7z (zip، 7z)</li>
            <li><span className={`sa-state ${data.tools.unrar ? 'is-ok' : 'is-warn'}`}>{data.tools.unrar ? 'آماده' : 'نصب نیست'}</span>unrar (باز کردن RAR)</li>
            <li><span className={`sa-state ${data.tools.rar ? 'is-ok' : 'is-warn'}`}>{data.tools.rar ? 'آماده' : 'نصب نیست'}</span>rar (ساخت RAR)</li>
          </ul>
        </section>
      </aside>
    </div>
  </>
}
