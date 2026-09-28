'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Notice, ServerShell, bytes, fa, faDate, useServerApi, useServerJson } from '../shared'

type StorageKind = 'local' | 'sftp' | 'ftp'
type StorageInfo = { id: string; kind: StorageKind; name: string; baseUrl: string; host: string; port: number; username: string; auth: 'password' | 'key'; secure: boolean; root: string; hasSecret: boolean }
type Job = { id: number; kind: string; label: string; status: 'queued' | 'running' | 'done' | 'failed' | 'cancelled'; title: string; url: string; storageId: string; dir: string; name: string; total: number | null; received: number; speed: number; result: string; error: string; createdAt: string; phase: string }
type Overview = { storages: StorageInfo[]; local: { root: string; baseUrl: string; free: number | null; size: number | null; writable: boolean }; tools: { sevenZip: string; rar: string; unrar: string }; jobs: Job[] }
type Entry = { name: string; path: string; type: 'dir' | 'file' | 'link'; size: number; mtime: string; url: string; archive: 'zip' | '7z' | 'rar' | 'tar' | null }
type Listing = { storage: string; dir: string; parent: string | null; entries: Entry[] }
type ArchiveEntry = { path: string; size: number; packed: number | null; dir: boolean; encrypted: boolean }
type ArchiveListing = { format: 'zip' | '7z' | 'rar' | 'tar'; encrypted: boolean; needsPassword: boolean; entries: ArchiveEntry[]; files: number; unpacked: number }
type Tone = { tone: 'ok' | 'error'; text: string } | null

const KIND_LABEL: Record<StorageKind, string> = { local: 'همین سرور', sftp: 'سرور دانلود (SFTP)', ftp: 'هاست دانلود (FTP)' }
const STATUS: Record<Job['status'], [string, string]> = { queued: ['در صف', ''], running: ['در حال انجام', 'is-info'], done: ['انجام شد', 'is-ok'], failed: ['ناموفق', 'is-bad'], cancelled: ['لغو شد', 'is-warn'] }
const PHASE: Record<string, string> = { upload: 'ارسال به فضای مقصد', download: 'دریافت از مبدأ', extract: 'باز کردن', pack: 'فشرده‌سازی' }
const TEXT_EXT = /\.(txt|nfo|md|json|xml|ya?ml|ini|conf|cfg|csv|log|html?|css|js|srt|vtt|ass|m3u8?|sfv|md5|sha\d*|htaccess|php|sh)$/i

function seconds(total: number) {
  if (total < 60) return `${fa(total)} ثانیه`
  if (total < 3600) return `${fa(Math.ceil(total / 60))} دقیقه`
  return `${fa(Math.floor(total / 3600))} ساعت و ${fa(Math.ceil((total % 3600) / 60))} دقیقه`
}

function Crumbs({ dir, onOpen }: { dir: string; onOpen: (dir: string) => void }) {
  const parts = dir.split('/').filter(Boolean)
  return <nav className="dl-crumbs" aria-label="مسیر">
    <button type="button" onClick={() => onOpen('/')}>ریشه</button>
    {parts.map((part, index) => <span key={index}><i aria-hidden="true">/</i><button type="button" onClick={() => onOpen(`/${parts.slice(0, index + 1).join('/')}`)} dir="auto">{part}</button></span>)}
  </nav>
}

// ------------------------------------------------------------------ storages

const EMPTY_STORAGE = { id: '', kind: 'sftp' as StorageKind, name: '', host: '', port: 22, username: '', secret: '', auth: 'password' as 'password' | 'key', secure: false, root: '/', baseUrl: '' }

function StorageForm({ initial, onDone, onCancel }: { initial: typeof EMPTY_STORAGE; onDone: () => void; onCancel: () => void }) {
  const api = useServerApi()
  const [form, setForm] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const editing = !!initial.id
  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true); setError('')
    const result = await api('/api/admin/server/downloads', { body: { op: 'storage-save', item: form } })
    setBusy(false)
    if (result.ok) onDone(); else setError(result.error)
  }
  return <form className="sa-card sa-form dl-storage-form" onSubmit={submit}>
    <header className="sa-card-head"><h2>{editing ? `ویرایش «${initial.name}»` : 'اتصال سرور یا هاست دانلود'}</h2></header>
    <div className="dl-kinds" role="radiogroup" aria-label="نوع اتصال">
      {(['sftp', 'ftp'] as const).map((kind) => <label key={kind} className={`dl-kind${form.kind === kind ? ' is-active' : ''}`}>
        <input type="radio" name="kind" checked={form.kind === kind} disabled={editing} onChange={() => setForm({ ...form, kind, port: kind === 'sftp' ? 22 : 21 })} />
        <b>{KIND_LABEL[kind]}</b>
        <small>{kind === 'sftp' ? 'سرور مجازی/اختصاصی با دسترسی SSH — سریع و امن' : 'هاست دانلود با کنترل‌پنل (cPanel، DirectAdmin)'}</small>
      </label>)}
    </div>
    <div className="sa-cols">
      <label className="sa-field"><span>نام نمایشی</span><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="سرور دانلود آلمان" required /></label>
      <label className="sa-field"><span>نشانی عمومی فایل‌ها</span><input className="input" dir="ltr" value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value.trim() })} placeholder="https://dl2.mobocom.net" /></label>
    </div>
    <div className="dl-host">
      <label className="sa-field"><span>Host</span><input className="input" dir="ltr" value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value.trim() })} placeholder="dl.example.com یا 1.2.3.4" required /></label>
      <label className="sa-field"><span>پورت</span><input className="input" dir="ltr" type="number" min={1} max={65535} value={form.port} onChange={(e) => setForm({ ...form, port: Number(e.target.value) })} /></label>
    </div>
    <div className="sa-cols">
      <label className="sa-field"><span>نام کاربری</span><input className="input" dir="ltr" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.trim() })} autoComplete="off" required /></label>
      <label className="sa-field"><span>پوشهٔ ریشه روی سرور</span><input className="input" dir="ltr" value={form.root} onChange={(e) => setForm({ ...form, root: e.target.value.trim() })} placeholder="/public_html" /></label>
    </div>
    {form.kind === 'sftp' && <div className="sa-toolbar">
      <label className="sa-check"><input type="radio" name="auth" checked={form.auth === 'password'} onChange={() => setForm({ ...form, auth: 'password' })} /> <span>ورود با رمز</span></label>
      <label className="sa-check"><input type="radio" name="auth" checked={form.auth === 'key'} onChange={() => setForm({ ...form, auth: 'key' })} /> <span>ورود با کلید SSH</span></label>
    </div>}
    {form.kind === 'ftp' && <label className="sa-check"><input type="checkbox" checked={form.secure} onChange={(e) => setForm({ ...form, secure: e.target.checked })} /> <span>اتصال رمزنگاری‌شده (FTPS / TLS) — اگر هاست پشتیبانی می‌کند روشن کنید</span></label>}
    {form.kind === 'sftp' && form.auth === 'key'
      ? <label className="sa-field"><span>کلید خصوصی {editing && <small>(خالی = بدون تغییر)</small>}</span><textarea className="input dl-key" dir="ltr" rows={5} value={form.secret} onChange={(e) => setForm({ ...form, secret: e.target.value })} placeholder="-----BEGIN OPENSSH PRIVATE KEY-----" /></label>
      : <label className="sa-field"><span>رمز عبور {editing && <small>(خالی = بدون تغییر)</small>}</span><input className="input" dir="ltr" type="password" autoComplete="new-password" value={form.secret} onChange={(e) => setForm({ ...form, secret: e.target.value })} /></label>}
    {error && <Notice tone="error">{error}</Notice>}
    <p className="sa-hint">پیش از ذخیره، اتصال آزمایش می‌شود. رمز و کلید رمزنگاری‌شده نگه‌داری می‌شوند و به مرورگر برنمی‌گردند.</p>
    <div className="sa-head-actions"><button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'در حال آزمایش اتصال…' : 'آزمایش و ذخیره'}</button><button type="button" className="btn btn-ghost" onClick={onCancel}>انصراف</button></div>
  </form>
}

// ------------------------------------------------------------------ archive tools

function ArchivePanel({ entry, tools, onClose, onQueued }: { entry: Entry; tools: Overview['tools']; onClose: () => void; onQueued: (text: string) => void }) {
  const api = useServerApi()
  const [password, setPassword] = useState('')
  const [listing, setListing] = useState<ArchiveListing | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [format, setFormat] = useState<'zip' | '7z' | 'rar'>(entry.archive === 'tar' || !entry.archive ? 'zip' : entry.archive)
  const [replace, setReplace] = useState(true)
  const [folder, setFolder] = useState(true)
  const [showPw, setShowPw] = useState(false)

  const load = useCallback(async (pw: string) => {
    setBusy(true); setError('')
    const result = await api<ArchiveListing>('/api/admin/server/downloads', { body: { op: 'archive-list', storage: 'local', path: entry.path, password: pw } })
    setBusy(false)
    if (result.ok) { setListing(result.data); if (result.data.needsPassword && pw) setError('رمز درست نیست') } else setError(result.error)
  }, [api, entry.path])
  useEffect(() => { void load('') }, [load])

  async function queue(body: Record<string, unknown>, text: string) {
    setBusy(true); setError('')
    const result = await api('/api/admin/server/downloads', { body: { storage: 'local', path: entry.path, password, ...body } })
    setBusy(false)
    if (result.ok) { onQueued(text); onClose() } else setError(result.error)
  }
  const locked = !listing || listing.needsPassword
  const canRar = !!tools.rar
  return <section className="sa-card dl-archive" aria-label="ابزار آرشیو">
    <header className="sa-card-head">
      <h2><span className="dl-badge">{(listing?.format || entry.archive || '').toUpperCase()}</span> <bdi dir="auto">{entry.name}</bdi></h2>
      <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>بستن</button>
    </header>
    <div className="dl-archive-body">
      <div className="dl-archive-side">
        <div className="dl-facts">
          <div><small>حجم آرشیو</small><b>{bytes(entry.size)}</b></div>
          <div><small>پس از باز شدن</small><b>{listing && !listing.needsPassword ? bytes(listing.unpacked) : '—'}</b></div>
          <div><small>فایل‌ها</small><b>{listing && !listing.needsPassword ? fa(listing.files) : '—'}</b></div>
          <div><small>رمز</small><b className={listing?.encrypted || listing?.needsPassword ? 'dl-lock' : ''}>{!listing ? '…' : listing.encrypted || listing.needsPassword ? 'دارد' : 'ندارد'}</b></div>
        </div>
        {(listing?.encrypted || listing?.needsPassword) && <form className="sa-form" onSubmit={(e) => { e.preventDefault(); void load(password) }}>
          <label className="sa-field"><span>رمز فعلی آرشیو</span>
            <div className="dl-pw"><input className="input" dir="ltr" type={showPw ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" /><button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowPw(!showPw)}>{showPw ? 'پنهان' : 'نمایش'}</button></div>
          </label>
          <button type="submit" className="btn btn-ghost btn-sm" disabled={busy || !password}>بررسی رمز</button>
        </form>}
        {error && <Notice tone="error">{error}</Notice>}
        {listing && !listing.needsPassword && listing.encrypted && password && <Notice tone="ok">رمز درست است.</Notice>}

        <fieldset className="dl-action" disabled={busy || locked}>
          <legend>باز کردن (Extract)</legend>
          <label className="sa-check"><input type="checkbox" checked={folder} onChange={(e) => setFolder(e.target.checked)} /> <span>در پوشه‌ای هم‌نام آرشیو</span></label>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => void queue({ op: 'extract', folder }, 'باز کردن آرشیو در صف قرار گرفت.')}>باز کردن همین‌جا</button>
        </fieldset>

        <fieldset className="dl-action" disabled={busy || locked}>
          <legend>رمز آرشیو</legend>
          <label className="sa-field"><span>{listing?.encrypted ? 'رمز تازه (خالی = برداشتن رمز)' : 'رمز برای گذاشتن روی آرشیو'}</span><input className="input" dir="ltr" type={showPw ? 'text' : 'password'} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" /></label>
          <div className="sa-toolbar">
            <label className="sa-inline"><span>قالب خروجی</span><select className="select" value={format} onChange={(e) => setFormat(e.target.value as 'zip' | '7z' | 'rar')}>
              <option value="zip">ZIP (AES-256)</option><option value="7z">7z (نام فایل‌ها هم رمزدار)</option><option value="rar" disabled={!canRar}>RAR{canRar ? ' (نام فایل‌ها هم رمزدار)' : ' — ابزار rar نصب نیست'}</option>
            </select></label>
            <label className="sa-check"><input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} /> <span>جایگزین فایل اصلی</span></label>
          </div>
          <div className="sa-head-actions">
            {listing?.encrypted && <button type="button" className="btn btn-ghost btn-sm" onClick={() => void queue({ op: 'repack', newPassword: '', format, replace }, 'برداشتن رمز در صف قرار گرفت.')}>برداشتن رمز</button>}
            <button type="button" className="btn btn-primary btn-sm" disabled={!newPassword} onClick={() => void queue({ op: 'repack', newPassword, format, replace }, listing?.encrypted ? 'تغییر رمز در صف قرار گرفت.' : 'رمزگذاری در صف قرار گرفت.')}>{listing?.encrypted ? 'تغییر رمز' : 'گذاشتن رمز'}</button>
          </div>
          {entry.archive === 'rar' && !canRar && <small className="sa-hint">خروجی RAR به ابزار rar نیاز دارد؛ بدون آن نسخهٔ بی‌رمز/رمزدار به ZIP یا 7z ساخته می‌شود.</small>}
        </fieldset>
      </div>
      <div className="dl-archive-list">
        {!listing ? <div className="sa-skeleton" style={{ height: 220 }} /> : listing.needsPassword ? <p className="sa-empty">فهرست فایل‌های این آرشیو رمزدار است؛ رمز را وارد کنید.</p> : <ul>
          {listing.entries.filter((item) => !item.dir).slice(0, 400).map((item) => <li key={item.path}><span dir="ltr">{item.path}</span><small>{bytes(item.size)}{item.encrypted ? ' · 🔒' : ''}</small></li>)}
          {listing.files > 400 && <li className="sa-hint">و {fa(listing.files - 400)} فایل دیگر…</li>}
        </ul>}
      </div>
    </div>
  </section>
}

// ------------------------------------------------------------------ editor

function Editor({ storage, entry, onClose, onSaved }: { storage: string; entry: Entry; onClose: () => void; onSaved: () => void }) {
  const api = useServerApi()
  const { data, error } = useServerJson<{ content: string; etag: string }>(`/api/admin/server/downloads?view=read&storage=${encodeURIComponent(storage)}&path=${encodeURIComponent(entry.path)}`)
  const [content, setContent] = useState<string | null>(null)
  const [notice, setNotice] = useState<Tone>(null)
  const [etag, setEtag] = useState('')
  useEffect(() => { if (data) { setContent(data.content); setEtag(data.etag) } }, [data])
  async function save() {
    const result = await api<{ etag: string }>('/api/admin/server/downloads', { body: { op: 'write', storage, path: entry.path, content, etag } })
    if (result.ok) { setEtag(result.data.etag); setNotice({ tone: 'ok', text: 'ذخیره شد.' }); onSaved() } else setNotice({ tone: 'error', text: result.error })
  }
  return <section className="sa-card sa-form">
    <header className="sa-card-head"><h2>ویرایش <bdi dir="auto">{entry.name}</bdi></h2><div className="sa-head-actions"><button type="button" className="btn btn-primary btn-sm" disabled={content === null} onClick={() => void save()}>ذخیره</button><button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>بستن</button></div></header>
    {(error || notice) && <Notice tone={error ? 'error' : notice!.tone}>{error || notice!.text}</Notice>}
    {content === null ? !error && <div className="sa-skeleton" style={{ height: 260 }} /> : <textarea className="input dl-editor" dir="auto" spellCheck={false} value={content} onChange={(e) => setContent(e.target.value)} onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); void save() } }} aria-label="محتوای فایل" />}
  </section>
}

// ------------------------------------------------------------------ jobs

function Jobs({ jobs, onChange }: { jobs: Job[]; onChange: () => void }) {
  const api = useServerApi()
  const act = async (body: Record<string, unknown>) => { const result = await api('/api/admin/server/downloads', { body }); if (!result.ok) window.alert(result.error); onChange() }
  const finished = jobs.some((job) => ['done', 'failed', 'cancelled'].includes(job.status))
  return <section className="sa-card dl-jobs">
    <header className="sa-card-head"><h2>کارها و دانلودها</h2>{finished && <button type="button" className="sa-link" onClick={() => void act({ op: 'jobs-clear' })}>پاک کردن تمام‌شده‌ها</button>}</header>
    {!jobs.length && <p className="sa-empty">هنوز کاری نیست. یک نشانی دانلود وارد کنید.</p>}
    <ul>{jobs.map((job) => {
      const percent = job.total ? Math.min(100, Math.round((job.received / job.total) * 100)) : null
      const remaining = job.status === 'running' && job.total && job.speed > 0 && job.kind === 'fetch' ? Math.ceil((job.total - job.received) / job.speed) : null
      const [label, tone] = STATUS[job.status]
      return <li key={job.id} className={`dl-job is-${job.status}`}>
        <div className="dl-job-head">
          <span className={`sa-state ${tone}`}>{label}</span>
          <b dir="auto" title={job.url || job.title}>{job.name || job.title}</b>
        </div>
        <small className="dl-job-meta">{job.label}{job.phase && job.status === 'running' ? ` · ${PHASE[job.phase] || job.phase}` : ''}{job.kind === 'fetch' && job.url ? <> · <bdi dir="ltr">{(() => { try { return new URL(job.url).hostname } catch { return '' } })()}</bdi></> : ''}</small>
        {(job.status === 'running' || job.status === 'queued') && <div className="dl-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent ?? undefined} aria-label={`پیشرفت ${job.name}`}><i className={percent === null ? 'is-indeterminate' : ''} style={percent === null ? undefined : { inlineSize: `${percent}%` }} /></div>}
        {job.status === 'running' && <small className="dl-job-meta num">
          {percent !== null ? `${fa(percent)}٪` : ''}{['fetch', 'transfer'].includes(job.kind) ? ` · ${bytes(job.received)}${job.total ? ` از ${bytes(job.total)}` : ''}` : ''}{job.speed > 0 && ['fetch', 'transfer'].includes(job.kind) ? ` · ${bytes(job.speed)}/ث` : ''}{remaining ? ` · ${seconds(remaining)} مانده` : ''}
        </small>}
        {job.status === 'done' && job.result && <small className="dl-job-meta">ذخیره در <bdi dir="ltr">{job.result}</bdi>{job.total && ['fetch', 'transfer'].includes(job.kind) ? ` · ${bytes(job.total)}` : ''}</small>}
        {job.status === 'failed' && <small className="dl-job-error">{job.error}</small>}
        <div className="dl-job-actions">
          {(job.status === 'running' || job.status === 'queued') && <button type="button" className="sa-link is-danger" onClick={() => void act({ op: 'job-cancel', id: job.id })}>لغو</button>}
          {(job.status === 'failed' || job.status === 'cancelled') && <button type="button" className="sa-link" onClick={() => void act({ op: 'job-retry', id: job.id })}>تلاش دوباره</button>}
          <small>{faDate(job.createdAt, true)}</small>
        </div>
      </li>
    })}</ul>
  </section>
}

// ------------------------------------------------------------------ page

function DownloadCenter() {
  const api = useServerApi()
  const overview = useServerJson<Overview>('/api/admin/server/downloads')
  const [storage, setStorage] = useState('local')
  const [dir, setDir] = useState('/')
  const listing = useServerJson<Listing>(`/api/admin/server/downloads?view=list&storage=${encodeURIComponent(storage)}&dir=${encodeURIComponent(dir)}`)
  const [jobs, setJobs] = useState<Job[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [notice, setNotice] = useState<Tone>(null)
  const [busy, setBusy] = useState(false)
  const [storageForm, setStorageForm] = useState<typeof EMPTY_STORAGE | null>(null)
  const [archive, setArchive] = useState<Entry | null>(null)
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

export default function DownloadsPage() {
  return <ServerShell title="مرکز دانلود"><DownloadCenter /></ServerShell>
}
