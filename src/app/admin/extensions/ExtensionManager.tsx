'use client'
import SectionSettingsHistoryLink from '@/components/admin/SectionSettingsHistoryLink'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from '@/components/AppLink'
import { useI18n } from '@/i18n/LocaleProvider'
import Icon from '@/components/site/Icon'
import PackageManager from './PackageManager'

type SettingDef = { key: string; label: string; labelEn?: string; description?: string; descriptionEn?: string; type: string; options?: { label: string; value: string }[] }
type Manifest = {
  id: string; name: string; nameEn?: string; description?: string; descriptionEn?: string; version: string; kind: string
  capabilities?: string[]; settings?: SettingDef[]; adminNavigation?: { href: string; label: string; labelEn?: string }[]
  requires?: string[]; publicPaths?: string[]; adminPaths?: string[]; category?: string; icon?: string
}
type ExtensionRow = { manifest: Manifest; state: { enabled: boolean; settings: Record<string, unknown> } }

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
  const fa = locale === 'fa'
  const L = useCallback((en: string, persian: string) => (fa ? persian : en), [fa])
  const [rows, setRows] = useState<ExtensionRow[]>([])
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  const [loading, setLoading] = useState(true)
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
    } catch (error) { setMessage({ text: error instanceof Error ? error.message : L('Could not load extensions.', 'دریافت افزونه‌ها ناموفق بود.'), error: true }) }
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
      if ('enabled' in patch) window.dispatchEvent(new Event('happ:modules-changed'))
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
  const categoryLabel = (c?: string) => { const found = CATEGORIES.find((item) => item.key === (c || 'core')); return found ? (fa ? found.fa : found.en) : L('Other', 'سایر') }
  const count = (value: number) => value.toLocaleString(fa ? 'fa-IR' : 'en-US')
  const inCategory = (key: string) => allModules.filter((row) => shown(row) && (row.manifest.category || 'core') === key).length
  async function toggle(row: ExtensionRow, enabled: boolean) {
    // Turning a section off hides its pages, menus and blocks; say so before it happens. Nothing is deleted.
    if (!enabled && !window.confirm(L(`Turn ${name(row.manifest)} off? Its pages, menus and blocks are hidden; its data stays.`, `«${name(row.manifest)}» خاموش شود؟ صفحه‌ها، منوها و بلوک‌هایش پنهان می‌شوند و داده‌هایش می‌ماند.`))) return
    await save(row, { enabled })
  }

  const card = (row: ExtensionRow) => {
    const m = row.manifest
    const on = row.state.enabled
    const missing = (m.requires || []).filter(id => !byId.get(id)?.state.enabled)
    const dependents = rows.filter(other => other.state.enabled && (other.manifest.requires || []).includes(m.id))
    // The server refuses to turn off a module an enabled module needs; the switch says so instead of failing.
    const locked = on && dependents.length > 0
    const manage = on && !m.adminNavigation?.length ? (m.adminPaths || [])[0] : undefined
    const expanded = open === m.id
    return <article className={`xm-card${on ? ' is-on' : ''}${m.kind === 'module' ? ' is-module' : ''}`} key={m.id} aria-busy={busy === m.id}>
      <div className="xm-card-head">
        <span className="xm-icon" aria-hidden="true"><Icon name={m.icon || (m.kind === 'module' ? 'grid' : 'sparkles')} size={22} /></span>
        <div className="xm-title">
          <h3>{name(m)}</h3>
          <small dir="ltr">{m.id} · v{m.version}{m.kind === 'module' ? ` · ${categoryLabel(m.category)}` : ''}</small>
        </div>
        <label className="xm-switch" title={locked ? L(`On while ${dependents.map(d => name(d.manifest)).join(', ')} needs it`, `تا «${dependents.map(d => name(d.manifest)).join('، ')}» روشن است خاموش نمی‌شود`) : on ? L('Turn off', 'غیرفعال‌کردن') : L('Turn on', 'فعال‌کردن')}>
          <input type="checkbox" checked={on} disabled={busy === m.id || locked} onChange={e => void toggle(row, e.target.checked)} />
          <span>{on ? L('On', 'فعال') : L('Off', 'غیرفعال')}</span>
        </label>
      </div>
      <p className="xm-desc">{fa ? m.description : m.descriptionEn || m.description}</p>
      <div className="xm-meta">
        {(m.publicPaths || []).map(path => <span className="xm-chip" dir="ltr" key={path}>{path}</span>)}
        {(m.requires || []).map(id => <span className={`xm-chip${missing.includes(id) ? ' is-warn' : ''}`} key={id}>{L('needs', 'نیازمند')} {byId.get(id) ? name(byId.get(id)!.manifest) : id}</span>)}
        {dependents.length > 0 && <span className="xm-chip">{L('used by', 'مورد استفادهٔ')} {dependents.map(d => name(d.manifest)).join('، ')}</span>}
        {m.kind !== 'module' && (m.capabilities || []).map(capability => <span className="xm-chip is-muted" key={capability}>{capability}</span>)}
      </div>
      {(!!m.settings?.length || (on && !!m.adminNavigation?.length) || !!manage) && <div className="xm-foot">
        {manage && <Link className="btn btn-ghost btn-sm" href={manage}>{L('Manage section', 'مدیریت بخش')} ↗</Link>}
        {on && (m.adminNavigation || []).map(item => <Link className="btn btn-ghost btn-sm" href={item.href} key={item.href}>{fa ? item.label : item.labelEn || item.label} ↗</Link>)}
        {!!m.settings?.length && <button type="button" className="btn btn-ghost btn-sm" aria-expanded={expanded} onClick={() => setOpen(expanded ? '' : m.id)}>{expanded ? L('Hide settings', 'بستن تنظیمات') : L('Settings', 'تنظیمات')}</button>}
      </div>}
      {m.id === 'businesses' && <SectionSettingsHistoryLink section="businesses" />}
      {expanded && !!m.settings?.length && <div className="xm-settings">{m.settings.map(def => <label className="studio-field" key={def.key}><span>{fa ? def.label : def.labelEn || def.label}</span>{def.type === 'boolean' ? <input type="checkbox" checked={Boolean(row.state.settings[def.key])} disabled={busy === m.id} onChange={e => void save(row, { settings: { [def.key]: e.target.checked } })}/> : def.type === 'select' ? <select className="input" value={String(row.state.settings[def.key] ?? '')} disabled={busy === m.id} onChange={e => void save(row, { settings: { [def.key]: e.target.value } })}>{def.options?.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : def.type === 'textarea' ? <textarea className="input" value={String(row.state.settings[def.key] ?? '')} disabled={busy === m.id} onChange={e => edit(m.id, def.key, e.target.value)} onBlur={e => void save(row, { settings: { [def.key]: e.target.value } })}/> : <input className="input" type={def.type === 'secret' ? 'password' : def.type === 'number' ? 'number' : 'text'} value={String(row.state.settings[def.key] ?? '')} disabled={busy === m.id} onChange={e => edit(m.id, def.key, def.type === 'number' ? Number(e.target.value) : e.target.value)} onBlur={e => void save(row, { settings: { [def.key]: def.type === 'number' ? Number(e.target.value) : e.target.value } })}/>}{def.description && <small className="muted">{fa ? def.description : def.descriptionEn || def.description}</small>}</label>)}</div>}
    </article>
  }

  return <div className="xm-page" dir={fa ? 'rtl' : 'ltr'}>
    {!embedded && <header className="tb-hero">
      <div>
        <span className="tb-eyebrow">ماژول‌ها و افزونه‌ها</span>
        <h1>{L('Modules & extensions', 'ماژول‌ها و افزونه‌ها')}</h1>
        <p>{L('Every major part of the site is a module you can switch on or off. Turning a module off hides its pages, menus and blocks — its data stays untouched.', 'هر بخش اصلی سایت یک ماژول است که می‌توانید روشن یا خاموش کنید. با خاموش‌کردن، صفحه‌ها، منوها و بلوک‌های آن پنهان می‌شوند و داده‌هایش دست‌نخورده می‌ماند.')}</p>
      </div>
    </header>}
    {message && <div className={`xm-notice${message.error ? ' is-error' : ''}`} role="status">{message.text}</div>}
    {loading && <div className="tb-empty">{L('Loading…', 'در حال بارگذاری…')}</div>}
    {!loading && <search className="xm-toolbar">
      <label className="xm-search"><span className="sr-only">{L('Find a module', 'جست‌وجوی ماژول')}</span><Icon name="search" size={16} /><input className="input" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={L('Find by name, address or description…', 'جست‌وجو با نام، آدرس یا توضیح…')} /></label>
      <div className="xm-filter" role="group" aria-label={L('State', 'وضعیت')}>
        {([['', L('All', 'همه')], ['on', L('On', 'فعال')], ['off', L('Off', 'غیرفعال')]] as ['' | 'on' | 'off', string][]).map(([value, label]) => <button key={value || 'all'} type="button" className={state === value ? 'is-active' : ''} aria-pressed={state === value} onClick={() => setState(value)}>{label}<span>{count(rows.filter((row) => row.manifest.kind === 'module' && (!value || (value === 'on') === row.state.enabled)).length)}</span></button>)}
      </div>
      <div className="xm-filter is-wrap" role="group" aria-label={L('Category', 'دسته')}>
        <button type="button" className={!category ? 'is-active' : ''} aria-pressed={!category} onClick={() => setCategory('')}>{L('Every category', 'همهٔ دسته‌ها')}</button>
        {CATEGORIES.filter((c) => allModules.some((row) => (row.manifest.category || 'core') === c.key)).map((c) => <button key={c.key} type="button" className={category === c.key ? 'is-active' : ''} aria-pressed={category === c.key} onClick={() => setCategory(category === c.key ? '' : c.key)}>{fa ? c.fa : c.en}<span>{count(inCategory(c.key))}</span></button>)}
      </div>
    </search>}
    {!loading && <section className="xm-section">
      <h2>{L('Site modules', 'ماژول‌های سایت')} <small className="muted">{L(`${count(allModules.filter((row) => row.state.enabled).length)} of ${count(allModules.length)} on`, `${count(allModules.filter((row) => row.state.enabled).length)} فعال از ${count(allModules.length)}`)}</small></h2>
      {!groups.length && <div className="tb-empty">{L('No module matches this search.', 'ماژولی با این جست‌وجو پیدا نشد.')}</div>}
      {groups.map((group) => <div className="xm-group" key={group.key}><h3>{fa ? group.fa : group.en} <span>{count(group.rows.length)}</span></h3><div className="xm-grid">{group.rows.map(card)}</div></div>)}
    </section>}
    {!loading && <section className="xm-section">
      <h2>{L('Extensions', 'افزونه‌ها')}</h2>
      {!plugins.length && <div className="tb-empty">{L('No extensions are installed in this release.', 'افزونه‌ای در این نسخه نصب نشده است.')}</div>}
      <div className="xm-grid">{plugins.map(card)}</div>
    </section>}
    {/* Uploading packages is occasional; the modules come first. */}
    {!loading && <PackageManager fa={fa} onChanged={() => window.dispatchEvent(new Event('happ:modules-changed'))}/>}
    {!embedded && <p className="muted text-sm">{L('Module and extension code ships with each release; activation and settings are stored separately from themes and content.', 'کد ماژول‌ها و افزونه‌ها همراه هر نسخه نصب می‌شود؛ فعال‌سازی و تنظیمات جدا از قالب و محتوا ذخیره می‌شود.')}</p>}
  </div>
}
