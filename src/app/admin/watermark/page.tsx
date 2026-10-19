'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import './watermark.css'
import SectionSettingsHistoryLink from '@/components/admin/SectionSettingsHistoryLink'

type Position = 'top-left' | 'top' | 'top-right' | 'left' | 'center' | 'right' | 'bottom-left' | 'bottom' | 'bottom-right' | 'tile'
type Settings = {
  enabled: boolean; kind: 'text' | 'image'; text: string; color: string; image: string; position: Position; size: number; opacity: number; margin: number; shadow: boolean
  scope: 'all' | 'sections' | 'selected'; sections: string[]; roles: ('main' | 'content')[]; minWidth: number; include: string[]; exclude: string[]
}
type Row = { file: string; url: string; sections: string[]; roles: string[]; state: 'include' | 'exclude' | 'default'; marked: boolean }
type Data = { settings: Settings; sections: { id: string; label: string }[]; indexed: number; font: boolean }

const fa = (n: number) => n.toLocaleString('fa-IR')
const GRID: { id: Position; label: string }[] = [
  { id: 'top-right', label: 'بالا راست' }, { id: 'top', label: 'بالا وسط' }, { id: 'top-left', label: 'بالا چپ' },
  { id: 'right', label: 'وسط راست' }, { id: 'center', label: 'وسط' }, { id: 'left', label: 'وسط چپ' },
  { id: 'bottom-right', label: 'پایین راست' }, { id: 'bottom', label: 'پایین وسط' }, { id: 'bottom-left', label: 'پایین چپ' },
]
const FILTERS = [
  { id: 'used', label: 'عکس‌های محتوا' }, { id: 'marked', label: 'دارای واترمارک' }, { id: 'clean', label: 'بدون واترمارک' },
  { id: 'include', label: 'همیشه واترمارک' }, { id: 'exclude', label: 'هرگز واترمارک' }, { id: 'all', label: 'همهٔ فایل‌ها' },
]

/** Image watermark: what it looks like, where it goes and which images get it. */
export default function WatermarkPage() {
  const [data, setData] = useState<Data | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const revision = useRef('')
  const [preview, setPreview] = useState('')
  const [previewFile, setPreviewFile] = useState('')
  const [images, setImages] = useState<{ rows: Row[]; total: number; page: number; pages: number } | null>(null)
  const [query, setQuery] = useState({ page: 1, section: '', filter: 'used' })
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const call = useCallback(async (method: string, body?: unknown) => {
    const headers: Record<string, string> = body ? { 'Content-Type': 'application/json' } : {}
    if (method === 'PATCH' && revision.current) headers['If-Match'] = revision.current
    const response = await fetch('/api/admin/watermark', { method, cache: 'no-store', headers, body: body ? JSON.stringify(body) : undefined }).catch(() => null)
    const result = await response?.json().catch(() => null)
    if (!response?.ok) throw new Error(result?.error || 'انجام نشد')
    if (typeof result?.settingsRevision === 'string') revision.current = result.settingsRevision
    return result
  }, [])

  const load = useCallback(async () => {
    try { const result = await call('GET'); setData(result); setSettings(result.settings) } catch (error) { setMessage({ text: (error as Error).message, error: true }) }
  }, [call])
  const loadImages = useCallback(async () => {
    try { setImages(await call('POST', { action: 'images', ...query })) } catch { /* shown empty */ }
  }, [call, query])
  useEffect(() => { void load() }, [load])
  useEffect(() => { void loadImages() }, [loadImages])

  // Live preview, a moment after the last change.
  useEffect(() => {
    if (!settings) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      try { setPreview((await call('POST', { action: 'preview', settings, file: previewFile })).image) } catch { setPreview('') }
    }, 450)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [settings, previewFile, call])

  async function save() {
    if (!settings) return
    setBusy(true); setMessage(null)
    try { const result = await call('PATCH', settings); setSettings(result.settings); setMessage({ text: 'تنظیمات واترمارک ذخیره شد', error: false }); void loadImages() }
    catch (error) { setMessage({ text: (error as Error).message, error: true }) }
    finally { setBusy(false) }
  }

  async function mark(file: string, choice: Row['state']) {
    try { const result = await call('POST', { action: 'mark', file, choice }); setSettings((current) => current && { ...current, include: result.settings.include, exclude: result.settings.exclude }); void loadImages() }
    catch (error) { setMessage({ text: (error as Error).message, error: true }) }
  }

  async function uploadLogo(file: File) {
    const form = new FormData()
    form.append('file', file)
    const response = await fetch('/api/admin/media', { method: 'POST', body: form }).catch(() => null)
    const result = await response?.json().catch(() => null)
    if (!response?.ok || !result?.url) { setMessage({ text: result?.error || 'بارگذاری نشد', error: true }); return }
    setSettings((current) => current && { ...current, kind: 'image', image: result.url })
  }

  async function reindex() {
    try { const result = await call('POST', { action: 'reindex' }); setData((current) => current && { ...current, indexed: result.indexed }); void loadImages(); setMessage({ text: `فهرست عکس‌ها به‌روز شد (${fa(result.indexed)} عکس در محتوا)`, error: false }) }
    catch (error) { setMessage({ text: (error as Error).message, error: true }) }
  }

  if (!data || !settings) return <div className="xm-page" dir="rtl">{message ? <div className="xm-notice is-error" role="alert">{message.text}</div> : <div className="tb-empty">در حال بارگذاری…</div>}</div>
  const set = (patch: Partial<Settings>) => setSettings({ ...settings, ...patch })
  const toggle = <T extends string>(list: T[], value: T) => (list.includes(value) ? list.filter((item) => item !== value) : [...list, value])
  const sectionLabel = (id: string) => data.sections.find((section) => section.id === id)?.label || id

  return <div className="xm-page wm-page" dir="rtl">
    <header className="xm-head"><div><h1>واترمارک تصاویر</h1><p className="muted">نشان شما هنگام نمایش روی عکس‌ها درج می‌شود و فایل اصلی دست نمی‌خورد؛ با خاموش کردن، همهٔ عکس‌ها بی‌واترمارک نمایش داده می‌شوند.</p><div className="xm-head-actions"><SectionSettingsHistoryLink section="watermark" /></div></div></header>
    {message && <div className={`xm-notice${message.error ? ' is-error' : ''}`} role={message.error ? 'alert' : 'status'}>{message.text}</div>}

    <div className="wm-layout">
      <form className="card fr-admin-form wm-form" onSubmit={(event) => { event.preventDefault(); void save() }}>
        <label className="studio-switch fr-admin-wide wm-master"><input type="checkbox" checked={settings.enabled} onChange={(e) => set({ enabled: e.target.checked })} /><b>واترمارک فعال باشد</b></label>

        <h2 className="fr-admin-wide">نوع واترمارک</h2>
        <div className="wm-seg fr-admin-wide" role="radiogroup" aria-label="نوع واترمارک">
          <button type="button" role="radio" aria-checked={settings.kind === 'text'} className={settings.kind === 'text' ? 'is-on' : ''} onClick={() => set({ kind: 'text' })}>متن</button>
          <button type="button" role="radio" aria-checked={settings.kind === 'image'} className={settings.kind === 'image' ? 'is-on' : ''} onClick={() => set({ kind: 'image' })}>لوگو (تصویر)</button>
        </div>
        {settings.kind === 'text' ? <>
          <label className="studio-field"><span>متن واترمارک</span><input className="input" value={settings.text} maxLength={80} onChange={(e) => set({ text: e.target.value })} placeholder="موبوکام · mobocom.ir" /></label>
          <label className="studio-field"><span>رنگ متن</span><span className="wm-color"><input type="color" value={settings.color} onChange={(e) => set({ color: e.target.value })} /><input className="input" dir="ltr" value={settings.color} onChange={(e) => set({ color: e.target.value })} /></span></label>
          <label className="studio-switch fr-admin-wide"><input type="checkbox" checked={settings.shadow} onChange={(e) => set({ shadow: e.target.checked })} />سایهٔ ملایم پشت متن (خوانایی روی عکس‌های روشن و تیره)</label>
          {!data.font && <p className="xm-notice is-error fr-admin-wide">فایل فونت واترمارک پیدا نشد (public/fonts/Vazirmatn-Bold.ttf).</p>}
        </> : <div className="studio-field fr-admin-wide">
          <span>لوگو (بهتر است PNG با پس‌زمینهٔ شفاف باشد)</span>
          <div className="wm-logo">
            {settings.image ? <img src={settings.image} alt="لوگوی واترمارک" /> : <span className="muted">هنوز لوگویی انتخاب نشده</span>}
            <label className="btn btn-ghost btn-sm">انتخاب فایل<input type="file" accept="image/png,image/webp,image/jpeg" hidden onChange={(e) => { const file = e.target.files?.[0]; if (file) void uploadLogo(file); e.target.value = '' }} /></label>
          </div>
        </div>}

        <h2 className="fr-admin-wide">محل قرارگیری</h2>
        <div className="fr-admin-wide wm-place">
          <div className="wm-grid" role="radiogroup" aria-label="محل واترمارک">
            {GRID.map((cell) => <button key={cell.id} type="button" role="radio" aria-checked={settings.position === cell.id} aria-label={cell.label} title={cell.label} className={settings.position === cell.id ? 'is-on' : ''} onClick={() => set({ position: cell.id })}><i /></button>)}
          </div>
          <button type="button" className={`wm-tile${settings.position === 'tile' ? ' is-on' : ''}`} aria-pressed={settings.position === 'tile'} onClick={() => set({ position: 'tile' })}>تکرار مورب روی کل عکس</button>
        </div>

        <label className="studio-field"><span>اندازه: {fa(settings.size)}٪ عرض عکس</span><input type="range" min={3} max={80} value={settings.size} onChange={(e) => set({ size: Number(e.target.value) })} /></label>
        <label className="studio-field"><span>شفافیت: {fa(settings.opacity)}٪</span><input type="range" min={5} max={100} value={settings.opacity} onChange={(e) => set({ opacity: Number(e.target.value) })} /></label>
        <label className="studio-field"><span>فاصله از لبه: {fa(settings.margin)}٪</span><input type="range" min={0} max={20} value={settings.margin} disabled={settings.position === 'tile' || settings.position === 'center'} onChange={(e) => set({ margin: Number(e.target.value) })} /></label>

        <h2 className="fr-admin-wide">روی کدام عکس‌ها</h2>
        <div className="wm-scope fr-admin-wide" role="radiogroup" aria-label="دامنهٔ واترمارک">
          {([['all', 'همهٔ عکس‌های محتوا', 'مجله، فروشگاه، موزیک، فیلم، بازی و نرم‌افزار'], ['sections', 'فقط بخش‌های انتخابی', 'بخش‌ها را پایین انتخاب کنید'], ['selected', 'فقط عکس‌های انتخابی', 'از فهرست عکس‌ها «همیشه» را بزنید']] as const).map(([id, title, hint]) =>
            <label key={id} className={settings.scope === id ? 'is-on' : ''}><input type="radio" name="wm-scope" checked={settings.scope === id} onChange={() => set({ scope: id })} /><b>{title}</b><small>{hint}</small></label>)}
        </div>
        {settings.scope === 'sections' && <div className="wm-checks fr-admin-wide">{data.sections.map((section) => <label key={section.id} className="studio-switch"><input type="checkbox" checked={settings.sections.includes(section.id)} onChange={() => set({ sections: toggle(settings.sections, section.id) })} />{section.label}</label>)}</div>}
        {settings.scope !== 'selected' && <div className="wm-checks fr-admin-wide">
          <label className="studio-switch"><input type="checkbox" checked={settings.roles.includes('main')} onChange={() => set({ roles: toggle(settings.roles, 'main') })} />عکس اصلی (کاور، پوستر، عکس محصول، گالری، اسکرین‌شات)</label>
          <label className="studio-switch"><input type="checkbox" checked={settings.roles.includes('content')} onChange={() => set({ roles: toggle(settings.roles, 'content') })} />عکس‌های داخل متن مطالب</label>
        </div>}
        <label className="studio-field"><span>روی عکس‌های کوچک‌تر از این عرض درج نشود (پیکسل)</span><input className="input" type="number" min={0} max={4000} value={settings.minWidth} onChange={(e) => set({ minWidth: Number(e.target.value) })} /><small className="muted">برای اینکه تصاویر کوچک کارت‌ها و فهرست‌ها شلوغ نشوند؛ ۰ یعنی همهٔ اندازه‌ها.</small></label>
        <p className="muted fr-admin-wide">عکس‌هایی که «همیشه» یا «هرگز» زده‌اید در هر حالتی همان‌طور می‌مانند: {fa(settings.include.length)} همیشه، {fa(settings.exclude.length)} هرگز. عکس‌هایی که در محتوای بخش‌ها استفاده نشده‌اند (مثل آواتار کاربران و لوگوی سایت) فقط با «همیشه» واترمارک می‌خورند و خود لوگوی واترمارک هیچ‌وقت.</p>

        <div className="fr-admin-actions"><button className="btn btn-primary btn-sm" disabled={busy}>{busy ? 'در حال ذخیره…' : 'ذخیرهٔ تنظیمات'}</button></div>
      </form>

      <aside className="card wm-preview" aria-label="پیش‌نمایش">
        <h2>پیش‌نمایش</h2>
        <div className="wm-preview-frame">{preview ? <img src={preview} alt="پیش‌نمایش واترمارک" /> : <span className="muted">{settings.kind === 'text' && !settings.text.trim() ? 'متن واترمارک را بنویسید' : settings.kind === 'image' && !settings.image ? 'لوگو را انتخاب کنید' : 'در حال ساخت پیش‌نمایش…'}</span>}</div>
        <p className="muted">{previewFile ? 'روی عکس انتخاب‌شده از فهرست پایین' : 'روی یک عکس نمونه؛ از فهرست پایین «پیش‌نمایش» هر عکسی را بزنید.'}</p>
        {previewFile && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPreviewFile('')}>عکس نمونه</button>}
      </aside>
    </div>

    <section className="card wm-images">
      <header className="wm-images-head">
        <div><h2>عکس‌های سایت</h2><p className="muted">برای هر عکس انتخاب کنید: پیروی از تنظیمات، همیشه واترمارک، یا هرگز. نشان «✓» یعنی با تنظیمات ذخیره‌شده واترمارک می‌خورد.</p></div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void reindex()}>به‌روزرسانی فهرست ({fa(data.indexed)})</button>
      </header>
      <div className="wm-filters">
        <select className="input" value={query.filter} onChange={(e) => setQuery({ ...query, filter: e.target.value, page: 1 })} aria-label="فیلتر">{FILTERS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
        <select className="input" value={query.section} onChange={(e) => setQuery({ ...query, section: e.target.value, page: 1 })} aria-label="بخش"><option value="">همهٔ بخش‌ها</option>{data.sections.map((section) => <option key={section.id} value={section.id}>{section.label}</option>)}</select>
        {images && <span className="muted">{fa(images.total)} عکس</span>}
      </div>
      {images && images.rows.length ? <ul className="wm-grid-images">
        {images.rows.map((row) => <li key={row.file} className={`is-${row.state}${row.marked ? ' is-marked' : ''}`}>
          <span className="wm-thumb"><img src={`${row.url}?w=320`} alt="" loading="lazy" />{row.marked && <em title="واترمارک می‌خورد">✓</em>}</span>
          <small className="wm-where">{row.sections.length ? row.sections.map(sectionLabel).join('، ') : 'استفاده‌نشده در محتوا'}{row.roles.includes('content') && !row.roles.includes('main') ? ' · داخل متن' : ''}</small>
          <div className="wm-choice" role="radiogroup" aria-label="واترمارک این عکس">
            {([['default', 'تنظیمات'], ['include', 'همیشه'], ['exclude', 'هرگز']] as const).map(([choice, label]) => <button key={choice} type="button" role="radio" aria-checked={row.state === choice} className={row.state === choice ? 'is-on' : ''} onClick={() => void mark(row.file, choice)}>{label}</button>)}
          </div>
          <button type="button" className="wm-peek" onClick={() => { setPreviewFile(row.file); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>پیش‌نمایش</button>
        </li>)}
      </ul> : <p className="muted wm-empty">{images ? 'عکسی با این فیلتر پیدا نشد.' : 'در حال بارگذاری…'}</p>}
      {images && images.pages > 1 && <div className="wm-pages">
        <button type="button" className="btn btn-ghost btn-sm" disabled={images.page <= 1} onClick={() => setQuery({ ...query, page: query.page - 1 })}>قبلی</button>
        <span className="muted">{fa(images.page)} از {fa(images.pages)}</span>
        <button type="button" className="btn btn-ghost btn-sm" disabled={images.page >= images.pages} onClick={() => setQuery({ ...query, page: query.page + 1 })}>بعدی</button>
      </div>}
    </section>
  </div>
}
