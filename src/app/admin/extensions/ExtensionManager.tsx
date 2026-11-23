'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useI18n } from '@/i18n/LocaleProvider'
import Icon from '@/components/site/Icon'
import PackageManager from './PackageManager'
import BuiltinExtensionCard from './BuiltinExtensionCard'
import type { ExtensionManifest as Manifest, ExtensionRow } from './extension-types'
import { useRouter } from '@/platform/routing/navigation'
import './extensions.css'

/** Every manifest category, in the order the owner meets them: the site's sections first, platform services last. */
const CATEGORIES: { key: string; fa: string; en: string }[] = [
  { key: 'content', fa: 'محتوا', en: 'Content' }, { key: 'commerce', fa: 'فروش', en: 'Commerce' },
  { key: 'engagement', fa: 'تعامل و جامعه', en: 'Engagement' }, { key: 'support', fa: 'پشتیبانی', en: 'Support' },
  { key: 'design', fa: 'طراحی', en: 'Design' }, { key: 'core', fa: 'سرویس اصلی', en: 'Core service' }, { key: 'system', fa: 'سیستم', en: 'System' },
]
const categoryRank = (key?: string) => { const at = CATEGORIES.findIndex((c) => c.key === (key || 'core')); return at < 0 ? CATEGORIES.length : at }
/** Words a module is found by: its names, id, description and public addresses. */
const haystack = (m: Manifest) => [m.name, m.nameEn, m.id, m.description, m.descriptionEn, ...(m.publicPaths || [])].join(' ').toLowerCase()

export default function ExtensionManager({ embedded = false }: { embedded?: boolean }) {
  const { locale } = useI18n()
  const router = useRouter()
  const fa = locale === 'fa'
  const L = useCallback((en: string, persian: string) => (fa ? persian : en), [fa])
  const [rows, setRows] = useState<ExtensionRow[]>([])
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [open, setOpen] = useState<string>('')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [state, setState] = useState<'' | 'on' | 'off'>('')

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/extensions', { cache: 'no-store' })
      if (!res.ok) throw new Error(L('Could not load extensions.', 'دریافت افزونه‌ها ناموفق بود.'))
      const data = await res.json()
      setRows(data.extensions || [])
      setLoadError(false)
    } catch (error) { setLoadError(true); setMessage({ text: error instanceof Error ? error.message : L('Could not load extensions.', 'دریافت افزونه‌ها ناموفق بود.'), error: true }) }
    finally { setLoading(false) }
  }, [L])
  useEffect(() => { void load() }, [load])

  async function save(row: ExtensionRow, patch: Record<string, unknown>) {
    setBusy(row.manifest.id); setMessage(null)
    try {
      const res = await fetch('/api/admin/extensions', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: row.manifest.id, ...patch }) })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || L('Could not save.', 'ذخیره ناموفق بود.'))
      await load()
      setMessage({ text: 'enabled' in patch
        ? (patch.enabled ? L(`${row.manifest.nameEn || row.manifest.name} is on.`, `«${row.manifest.name}» فعال شد.`) : L(`${row.manifest.nameEn || row.manifest.name} is off. Nothing was deleted.`, `«${row.manifest.name}» غیرفعال شد. داده‌ای حذف نشد.`))
        : L('Settings saved.', 'تنظیمات ذخیره شد.'), error: false })
      if ('enabled' in patch) { window.dispatchEvent(new Event('happ:modules-changed')); router.refresh() }
    } catch (error) { setMessage({ text: error instanceof Error ? error.message : L('Could not save.', 'ذخیره ناموفق بود.'), error: true }) }
    finally { setBusy('') }
  }
  function edit(id: string, key: string, value: unknown) {
    setRows(current => current.map(row => row.manifest.id === id ? { ...row, state: { ...row.state, settings: { ...row.state.settings, [key]: value } } } : row))
  }

  const byId = useMemo(() => new Map(rows.map(row => [row.manifest.id, row])), [rows])
  const allModules = rows.filter(row => row.manifest.kind === 'module')
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const shown = (row: ExtensionRow) => { const text = haystack(row.manifest); return words.every((word) => text.includes(word)) && (!state || (state === 'on') === row.state.enabled) }
  const modules = allModules.filter((row) => shown(row) && (!category || (row.manifest.category || 'core') === category))
  const groups = CATEGORIES.map((c) => ({ ...c, rows: modules.filter((row) => categoryRank(row.manifest.category) === categoryRank(c.key)) }))
    .concat([{ key: 'other', fa: 'سایر', en: 'Other', rows: modules.filter((row) => categoryRank(row.manifest.category) === CATEGORIES.length) }])
    .filter((group) => group.rows.length)
  const plugins = rows.filter(row => row.manifest.kind !== 'module' && shown(row))
  const name = (m: Manifest) => (fa ? m.name : m.nameEn || m.name)
  const count = (value: number) => value.toLocaleString(fa ? 'fa-IR' : 'en-US')
  const clearFilters = () => { setQuery(''); setCategory(''); setState('') }
  async function toggle(row: ExtensionRow, enabled: boolean) {
    // Turning a section off hides its pages, menus and blocks; say so before it happens. Nothing is deleted.
    if (!enabled && !window.confirm(L(`Turn ${name(row.manifest)} off? Its pages, menus and blocks are hidden; its data stays.`, `«${name(row.manifest)}» خاموش شود؟ صفحه‌ها، منوها و بلوک‌هایش پنهان می‌شوند و داده‌هایش می‌ماند.`))) return
    await save(row, { enabled })
  }

  const card = (row: ExtensionRow) => <BuiltinExtensionCard key={row.manifest.id}
    row={row} fa={fa} byId={byId}
    dependents={rows.filter(other => other.state.enabled && other.manifest.requires?.includes(row.manifest.id))}
    busy={!!busy} expanded={row.state.enabled && open === row.manifest.id}
    onToggle={enabled => void toggle(row, enabled)}
    onSettingsToggle={() => setOpen(open === row.manifest.id ? '' : row.manifest.id)}
    onEdit={(key, value) => edit(row.manifest.id, key, value)}
    onSave={settings => void save(row, { settings })}/>
  const enabled = rows.filter(row => row.state.enabled).length
  const hasFilters = !!(query || category || state)

  return <div className="xm-page extension-manager" dir={fa ? 'rtl' : 'ltr'}>
    {!embedded && <header className="xm-overview">
      <div className="xm-overview-copy">
        <span className="xm-eyebrow">{L('Platform capabilities', 'قابلیت‌های پلتفرم')}</span>
        <h1>{L('Modules & extensions', 'ماژول‌ها و افزونه‌ها')}</h1>
        <p>{L('Configure your site’s capabilities. Turning a capability off keeps its data.', 'قابلیت‌های سایت را مدیریت کنید؛ با غیرفعال‌سازی، داده‌ها حفظ می‌شوند.')}</p>
        {!loading && !loadError && <div className="xm-overview-counts"><span><strong>{count(rows.length)}</strong> {L('installed', 'نصب‌شده')}</span><span><i aria-hidden="true"/>{count(enabled)} {L('active', 'فعال')}</span><span>{count(rows.length - enabled)} {L('inactive', 'غیرفعال')}</span></div>}
      </div>
      <a href="#uploaded-packages" className="btn btn-ghost xm-upload-link"><Icon name="upload" size={18}/>{L('Install a package', 'نصب بسته')}</a>
    </header>}
    {message && <div className={`xm-notice${message.error ? ' is-error' : ''}`} role="status">{message.text}</div>}
    {loadError && <div className="xm-load-error"><button type="button" className="btn btn-ghost" disabled={loading} onClick={() => { setLoading(true); setMessage(null); void load() }}>{L('Try again', 'تلاش دوباره')}</button></div>}
    {loading && <div className="xm-loading" role="status">{L('Loading capabilities…', 'در حال دریافت قابلیت‌ها…')}</div>}
    {!loading && (!loadError || rows.length > 0) && <>
      <search className="xm-toolbar" aria-label={L('Find installed capabilities', 'یافتن قابلیت‌های نصب‌شده')}>
        <div className="xm-toolbar-fields">
          <label className="xm-search"><span className="sr-only">{L('Find a module or extension', 'جست‌وجوی ماژول یا افزونه')}</span><Icon name="search" size={18}/><input className="input" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={L('Name, address or description', 'نام، آدرس یا توضیح')}/></label>
          <label className="xm-category"><span>{L('Module category', 'دستهٔ ماژول')}</span><select className="input" value={category} onChange={event => setCategory(event.target.value)}><option value="">{L('Every category', 'همهٔ دسته‌ها')}</option>{CATEGORIES.filter(item => allModules.some(row => (row.manifest.category || 'core') === item.key)).map(item => <option key={item.key} value={item.key}>{fa ? item.fa : item.en}</option>)}</select></label>
        </div>
        <div className="xm-toolbar-bottom">
          <div className="xm-filter" role="group" aria-label={L('State', 'وضعیت')}>
            {([['', L('All', 'همه')], ['on', L('Active', 'فعال')], ['off', L('Inactive', 'غیرفعال')]] as ['' | 'on' | 'off', string][]).map(([value, label]) => <button key={value || 'all'} type="button" className={state === value ? 'is-active' : ''} aria-pressed={state === value} onClick={() => setState(value)}>{label}<span>{count(rows.filter(row => !value || (value === 'on') === row.state.enabled).length)}</span></button>)}
          </div>
          <p className="xm-result-count" role="status">{L(`${count(modules.length + plugins.length)} capabilities shown`, `نمایش ${count(modules.length + plugins.length)} قابلیت`)}{hasFilters && <button type="button" onClick={clearFilters}>{L('Clear filters', 'پاک‌کردن فیلترها')}</button>}</p>
        </div>
      </search>
      <section className="xm-section" aria-labelledby="xm-modules-title">
        <div className="xm-section-heading"><div><h2 id="xm-modules-title">{L('Site modules', 'ماژول‌های سایت')}</h2><p>{L('Sections and shared services included in this version', 'بخش‌ها و سرویس‌های مشترک این نسخه')}</p></div><span className="xm-section-count">{count(allModules.length)}</span></div>
        {!groups.length && <div className="xm-empty"><Icon name="search" size={22}/><p>{L('No module matches these filters', 'ماژولی با این فیلترها پیدا نشد')}</p><button type="button" className="btn btn-ghost btn-sm" onClick={clearFilters}>{L('Show all', 'نمایش همه')}</button></div>}
        {groups.map(group => <div className="xm-group" key={group.key}><h3>{fa ? group.fa : group.en}<span>{count(group.rows.length)}</span></h3><div className="xm-grid">{group.rows.map(card)}</div></div>)}
      </section>
      <section className="xm-section" aria-labelledby="xm-plugins-title">
        <div className="xm-section-heading"><div><h2 id="xm-plugins-title">{L('Extensions', 'افزونه‌ها')}</h2><p>{L('Optional tools that extend your site', 'ابزارهای اختیاری برای تکمیل امکانات سایت')}</p></div><span className="xm-section-count">{count(rows.length - allModules.length)}</span></div>
        {!plugins.length ? <div className="xm-empty"><p>{L('No extension matches these filters', 'افزونه‌ای با این فیلترها پیدا نشد')}</p>{hasFilters && <button type="button" className="btn btn-ghost btn-sm" onClick={clearFilters}>{L('Show all', 'نمایش همه')}</button>}</div> : <div className="xm-grid">{plugins.map(card)}</div>}
      </section>
    </>}
    {!loading && <PackageManager fa={fa} onChanged={() => window.dispatchEvent(new Event('happ:modules-changed'))}/>}
    {!embedded && <p className="xm-page-note"><Icon name="shield" size={16}/>{L('Installation and activation are separate. Deactivation keeps content and settings.', 'نصب و فعال‌سازی جدا هستند؛ غیرفعال‌سازی محتوا و تنظیمات را حذف نمی‌کند.')}</p>}
  </div>
}
