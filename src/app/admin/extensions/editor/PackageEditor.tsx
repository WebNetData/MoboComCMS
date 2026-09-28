'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from '@/components/AppLink'
import { useRouter, useSearchParams } from '@/platform/routing/navigation'
import Icon from '@/components/site/Icon'
import { useI18n } from '@/i18n/LocaleProvider'
import type { PackageRow } from '../PackageManager'

type Revision = { at: string; path: string; actor: string; note: string; restorable: boolean; bytes: number }
type Status = { text: string; error: boolean } | null

const NEW_FILE_TEMPLATES: Record<string, string> = {
  html: '<section class="my-block">\n  <h2>{{site.brand}}</h2>\n  <p>…</p>\n</section>\n',
  css: '/* Styles for this package */\n',
  md: '# Notes\n',
  json: '{\n}\n',
  tsx: "'use client'\n\nexport default function Component() {\n  return null\n}\n",
  ts: 'export {}\n',
}

/**
 * WordPress-style file editor for uploaded packages. Declarative packages take
 * effect as soon as a file is saved; code packages are staged until they are
 * applied and rebuilt. Every save is validated server-side and kept in the
 * revision history, so any change can be rolled back.
 */
export default function PackageEditor() {
  const { locale } = useI18n()
  const fa = locale === 'fa'
  const L = useCallback((en: string, persian: string) => (fa ? persian : en), [fa])
  const params = useSearchParams()
  const router = useRouter()
  const id = params.get('package') || ''
  const [pkg, setPkg] = useState<PackageRow | null>(null)
  const [packages, setPackages] = useState<PackageRow[]>([])
  const [path, setPath] = useState(params.get('file') || 'manifest.json')
  const [content, setContent] = useState('')
  const [saved, setSaved] = useState('')
  const [revisions, setRevisions] = useState<Revision[]>([])
  const [status, setStatus] = useState<Status>(null)
  const [busy, setBusy] = useState(false)
  const [loadingFile, setLoadingFile] = useState(false)
  const area = useRef<HTMLTextAreaElement>(null)
  const gutter = useRef<HTMLDivElement>(null)
  const dirty = content !== saved

  const loadList = useCallback(async () => {
    const res = await fetch('/api/admin/packages', { cache: 'no-store' })
    if (res.ok) setPackages((await res.json()).packages || [])
  }, [])
  const loadFile = useCallback(async (target: string) => {
    if (!id) return
    setLoadingFile(true)
    try {
      const res = await fetch(`/api/admin/packages/${id}?file=${encodeURIComponent(target)}&revisions=1`, { cache: 'no-store' })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || L('Could not open the package.', 'باز کردن بسته ناموفق بود.'))
      setPkg(data.package)
      setRevisions(data.revisions || [])
      const text = data.file?.content ?? ''
      setContent(text); setSaved(text)
    } catch (error) { setStatus({ text: error instanceof Error ? error.message : String(error), error: true }) }
    finally { setLoadingFile(false) }
  }, [id, L])
  useEffect(() => { void loadList() }, [loadList])
  useEffect(() => { void loadFile(path) }, [loadFile, path])
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault() } }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const current = pkg?.files.find(file => file.path === path)
  const editable = current ? current.editable : true
  const code = pkg?.manifest.runtime === 'code'

  function open(target: string) {
    if (target === path) return
    if (dirty && !window.confirm(L('Discard unsaved changes?', 'تغییرات ذخیره‌نشده کنار گذاشته شود؟'))) return
    setStatus(null)
    setPath(target)
    router.replace(`/admin/extensions/editor?package=${id}&file=${encodeURIComponent(target)}`, { scroll: false })
  }

  async function mutate(request: () => Promise<Response>, success: string) {
    setBusy(true); setStatus(null)
    try {
      const res = await request()
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || L('Saving failed.', 'ذخیره ناموفق بود.'))
      setStatus({ text: success, error: false })
      return data
    } catch (error) { setStatus({ text: error instanceof Error ? error.message : String(error), error: true }); return null }
    finally { setBusy(false) }
  }

  async function save() {
    if (!editable || busy) return
    const data = await mutate(() => fetch(`/api/admin/packages/${id}/files`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path, content }) }),
      code ? L('Saved. Apply & rebuild to put code changes live.', 'ذخیره شد. برای اجرای تغییرات کد، «اعمال و build» را بزنید.') : L('Saved — the change is live.', 'ذخیره شد و تغییر روی سایت اعمال شد.'))
    if (data) { setSaved(content); setPkg(data.package); void loadFile(path) }
  }

  async function createFile() {
    const name = window.prompt(L('New file path (e.g. slots/footer.html, style.css)', 'مسیر فایل جدید (مثلاً slots/footer.html یا style.css)'))?.trim()
    if (!name) return
    const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase()
    const data = await mutate(() => fetch(`/api/admin/packages/${id}/files`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: name, content: NEW_FILE_TEMPLATES[ext] ?? '' }) }), L('File created.', 'فایل ساخته شد.'))
    if (data) { setPkg(data.package); open(name) }
  }

  async function deleteFile() {
    if (path === 'manifest.json' || !window.confirm(L(`Delete ${path}?`, `فایل ${path} حذف شود؟`))) return
    const data = await mutate(() => fetch(`/api/admin/packages/${id}/files?path=${encodeURIComponent(path)}`, { method: 'DELETE' }), L('File deleted. It can be restored from the history.', 'فایل حذف شد و از تاریخچه قابل بازگردانی است.'))
    if (data) { setPkg(data.package); setSaved(''); setContent(''); setPath('manifest.json') }
  }

  async function restore(index: number) {
    const revision = revisions[index]
    if (!window.confirm(L(`Restore ${revision.path} to how it was before this change?`, `فایل ${revision.path} به حالت قبل از این تغییر برگردد؟`))) return
    const data = await mutate(() => fetch(`/api/admin/packages/${id}/revisions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ index }) }), L('Restored.', 'بازگردانی شد.'))
    if (data) { setPkg(data.package); if (revision.path === path) void loadFile(path); else open(revision.path) }
  }

  async function applyCode() {
    if (dirty) { setStatus({ text: L('Save your changes first.', 'ابتدا تغییرات را ذخیره کنید.'), error: true }); return }
    if (!window.confirm(L('Apply this code package now? It runs with full server access after the build; if the build or its checks fail, the current site keeps running.', 'این بستهٔ کددار الان اعمال شود؟ بعد از build با دسترسی کامل سرور اجرا می‌شود؛ اگر build یا بررسی‌ها خطا بدهند، سایت فعلی دست‌نخورده می‌ماند.'))) return
    const data = await mutate(() => fetch(`/api/admin/packages/${id}/apply`, { method: 'POST' }), L('Applied. The site rebuilds with this code.', 'اعمال شد؛ سایت با این کد دوباره build می‌شود.'))
    if (data) { setPkg(data.package); void loadFile(path) }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); void save(); return }
    if (event.key === 'Tab' && !event.shiftKey) {
      event.preventDefault()
      const target = event.currentTarget
      const { selectionStart: start, selectionEnd: end } = target
      const next = content.slice(0, start) + '  ' + content.slice(end)
      setContent(next)
      requestAnimationFrame(() => { target.selectionStart = target.selectionEnd = start + 2 })
    }
  }

  const lines = useMemo(() => Math.max(1, content.split('\n').length), [content])
  const tree = useMemo(() => {
    const groups = new Map<string, PackageRow['files']>()
    for (const file of pkg?.files || []) {
      const folder = file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : ''
      groups.set(folder, [...(groups.get(folder) || []), file])
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [pkg])
  const previewHref = pkg?.manifest.pages?.[0] ? `/ext/${pkg.id}/${pkg.manifest.pages[0].slug}` : '/'

  if (!id) return <div className="xm-page pe-page" dir={fa ? 'rtl' : 'ltr'}>
    <header className="tb-hero"><div><span className="tb-eyebrow">EDITOR</span><h1>{L('Package editor', 'ویرایشگر افزونه و قالب')}</h1><p>{L('Pick an uploaded plugin or theme to edit its files.', 'یک افزونه یا قالب آپلودی را برای ویرایش فایل‌هایش انتخاب کنید.')}</p></div></header>
    <div className="xm-grid">{packages.map(row => <Link key={row.id} href={`/admin/extensions/editor?package=${row.id}`} className="xm-card"><div className="xm-card-head"><span className="xm-icon"><Icon name={row.manifest.kind === 'theme' ? 'palette' : 'code'} size={20}/></span><div className="xm-title"><h3>{fa ? row.manifest.name : row.manifest.nameEn || row.manifest.name}</h3><small dir="ltr">{row.id} · v{row.manifest.version}</small></div></div></Link>)}</div>
    {!packages.length && <div className="tb-empty">{L('Upload a package in Extensions first.', 'ابتدا از بخش افزونه‌ها یک بسته آپلود کنید.')} <Link href="/admin/extensions">{L('Go to Extensions', 'رفتن به افزونه‌ها')}</Link></div>}
  </div>

  return <div className="pe-page" dir={fa ? 'rtl' : 'ltr'}>
    <header className="pe-bar">
      <div className="pe-title">
        <Link href="/admin/extensions" className="btn btn-ghost btn-sm" aria-label={L('Back to extensions', 'بازگشت به افزونه‌ها')}><Icon name="arrow" size={16}/></Link>
        <div><h1>{pkg ? (fa ? pkg.manifest.name : pkg.manifest.nameEn || pkg.manifest.name) : id}</h1><small dir="ltr">{id}{pkg ? ` · v${pkg.manifest.version} · ${pkg.manifest.kind} · ${pkg.manifest.runtime}` : ''}</small></div>
      </div>
      <div className="pe-actions">
        <select className="input" value={id} aria-label={L('Package', 'بسته')} onChange={event => { if (!dirty || window.confirm(L('Discard unsaved changes?', 'تغییرات ذخیره‌نشده کنار گذاشته شود؟'))) { setPath('manifest.json'); router.push(`/admin/extensions/editor?package=${event.target.value}`) } }}>{packages.map(row => <option key={row.id} value={row.id}>{row.manifest.name}</option>)}</select>
        {!code && <a className="btn btn-ghost btn-sm" href={previewHref} target="_blank" rel="noreferrer">{L('View site', 'مشاهدهٔ سایت')} ↗</a>}
        {code && <button type="button" className="btn btn-ghost btn-sm" disabled={busy || pkg?.codeStatus === 'applied'} onClick={() => void applyCode()}>{pkg?.codeStatus === 'applied' ? L('Applied', 'اعمال‌شده') : L('Apply & rebuild', 'اعمال و build')}</button>}
        <button type="button" className="btn btn-primary btn-sm" disabled={!dirty || !editable || busy} onClick={() => void save()}>{busy ? L('Saving…', 'در حال ذخیره…') : L('Save (Ctrl+S)', 'ذخیره (Ctrl+S)')}</button>
      </div>
    </header>
    {code && <div className="xm-notice is-error pe-notice">{L('Code package: edits are staged and run only after “Apply & rebuild” in Extensions. The build checks the code first, so a broken change never replaces the running site.', 'بستهٔ کددار: تغییرات ذخیره می‌شوند و فقط بعد از «اعمال و build» در بخش افزونه‌ها اجرا می‌شوند. build ابتدا کد را بررسی می‌کند، پس تغییر خراب جای سایت فعلی را نمی‌گیرد.')}</div>}
    {status && <div className={`xm-notice pe-notice${status.error ? ' is-error' : ''}`} role="status">{status.text}</div>}
    <div className="pe-layout">
      <aside className="pe-files" aria-label={L('Files', 'فایل‌ها')}>
        <div className="pe-files-head"><strong>{L('Files', 'فایل‌ها')}</strong><button type="button" className="btn btn-ghost btn-sm" onClick={() => void createFile()} disabled={busy}><Icon name="plus" size={15}/>{L('New', 'جدید')}</button></div>
        {tree.map(([folder, files]) => <div key={folder || '/'} className="pe-folder">
          {folder && <span className="pe-folder-name" dir="ltr">{folder}/</span>}
          {files.map(file => <button key={file.path} type="button" className={`pe-file${file.path === path ? ' is-on' : ''}${file.editable ? '' : ' is-binary'}`} onClick={() => open(file.path)} dir="ltr" aria-current={file.path === path ? 'true' : undefined}><Icon name="file" size={14}/><span>{file.path.split('/').pop()}</span>{file.path === path && dirty && <i aria-label={L('unsaved', 'ذخیره‌نشده')}>●</i>}</button>)}
        </div>)}
        <details className="pe-help"><summary>{L('Placeholders & rules', 'راهنما و قوانین')}</summary><p dir="auto">{L('Use {{site.brand}}, {{locale}} and {{settings.key}} in HTML. Scripts, inline styles, iframes and forms are removed when rendering; style with CSS files. Relative image paths such as assets/logo.png point to files in this package.', 'در HTML از {{site.brand}}، {{locale}} و {{settings.key}} استفاده کنید. اسکریپت، style درون‌خطی، iframe و فرم هنگام نمایش حذف می‌شوند؛ ظاهر را با فایل CSS بسازید. مسیرهای نسبی مثل assets/logo.png به فایل‌های همین بسته اشاره می‌کنند.')}</p></details>
      </aside>
      <section className="pe-editor" aria-busy={loadingFile}>
        <div className="pe-editor-head"><span dir="ltr">{path}</span>{editable && path !== 'manifest.json' && <button type="button" className="btn btn-ghost btn-sm" onClick={() => void deleteFile()} disabled={busy}>{L('Delete file', 'حذف فایل')}</button>}</div>
        {editable ? <div className="pe-code">
          <div ref={gutter} className="pe-gutter" aria-hidden="true">{Array.from({ length: lines }, (_, index) => <span key={index}>{index + 1}</span>)}</div>
          <textarea ref={area} value={content} onChange={event => setContent(event.target.value)} onKeyDown={onKeyDown} onScroll={event => { if (gutter.current) gutter.current.scrollTop = event.currentTarget.scrollTop }} spellCheck={false} dir="ltr" wrap="off" aria-label={path} disabled={loadingFile}/>
        </div> : <div className="pe-binary">{/\.(png|jpe?g|webp|gif|avif|svg|ico)$/i.test(path) && pkg && !code ? <img src={`/api/public/packages/${pkg.id}/files/${path}`} alt=""/> : <Icon name="file" size={40}/>}<p>{L('Media files are replaced by uploading a new version of the package.', 'فایل‌های رسانه با آپلود نسخهٔ جدید بسته جایگزین می‌شوند.')}</p></div>}
      </section>
      <aside className="pe-history" aria-label={L('History', 'تاریخچه')}>
        <strong>{L('History', 'تاریخچه')}</strong>
        {!revisions.length && <p className="muted text-sm">{L('No changes yet.', 'هنوز تغییری ثبت نشده است.')}</p>}
        <ol>{revisions.map((revision, index) => <li key={`${revision.at}-${index}`}>
          <span dir="ltr">{revision.path === '*' ? L('package', 'بسته') : revision.path}</span>
          <small>{revision.note} · {new Date(revision.at).toLocaleString(fa ? 'fa-IR' : 'en-US', { dateStyle: 'short', timeStyle: 'short' })}</small>
          <small dir="ltr">{revision.actor}</small>
          {revision.restorable && <button type="button" className="btn btn-ghost btn-sm" onClick={() => void restore(index)} disabled={busy}>{L('Restore previous', 'بازگردانی نسخهٔ قبل')}</button>}
        </li>)}</ol>
      </aside>
    </div>
  </div>
}
