'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useI18n } from '@/i18n/LocaleProvider'
import Icon from '@/components/site/Icon'

type SettingDef = { key: string; label: string; labelEn?: string; description?: string; descriptionEn?: string; type: string; options?: { label: string; value: string }[] }
type Manifest = {
  id: string; name: string; nameEn?: string; description?: string; descriptionEn?: string; version: string; kind: string
  capabilities?: string[]; settings?: SettingDef[]; adminNavigation?: { href: string; label: string; labelEn?: string }[]
  requires?: string[]; publicPaths?: string[]; adminPaths?: string[]; category?: string; icon?: string
}
type ExtensionRow = { manifest: Manifest; state: { enabled: boolean; settings: Record<string, unknown> } }

const CATEGORY_ORDER = ['core', 'commerce', 'content', 'engagement', 'design']

export default function ExtensionManager({ embedded = false }: { embedded?: boolean }) {
  const { locale } = useI18n()
  const fa = locale === 'fa'
  const L = useCallback((en: string, persian: string) => (fa ? persian : en), [fa])
  const [rows, setRows] = useState<ExtensionRow[]>([])
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState<string>('')

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
  const modules = rows.filter(row => row.manifest.kind === 'module')
    .sort((a, b) => CATEGORY_ORDER.indexOf(a.manifest.category || 'core') - CATEGORY_ORDER.indexOf(b.manifest.category || 'core'))
  const plugins = rows.filter(row => row.manifest.kind !== 'module')
  const name = (m: Manifest) => (fa ? m.name : m.nameEn || m.name)
  const categoryLabel = (c?: string) => ({ core: L('Core service', 'سرویس اصلی'), commerce: L('Commerce', 'فروش'), content: L('Content', 'محتوا'), engagement: L('Engagement', 'تعامل'), design: L('Design', 'طراحی') } as Record<string, string>)[c || 'core'] || c

  const card = (row: ExtensionRow) => {
    const m = row.manifest
    const on = row.state.enabled
    const missing = (m.requires || []).filter(id => !byId.get(id)?.state.enabled)
    const dependents = rows.filter(other => other.state.enabled && (other.manifest.requires || []).includes(m.id))
    const expanded = open === m.id
    return <article className={`xm-card${on ? ' is-on' : ''}${m.kind === 'module' ? ' is-module' : ''}`} key={m.id} aria-busy={busy === m.id}>
      <div className="xm-card-head">
        <span className="xm-icon" aria-hidden="true"><Icon name={m.icon || (m.kind === 'module' ? 'grid' : 'sparkles')} size={22} /></span>
        <div className="xm-title">
          <h3>{name(m)}</h3>
          <small dir="ltr">{m.id} · v{m.version}{m.kind === 'module' ? ` · ${categoryLabel(m.category)}` : ''}</small>
        </div>
        <label className="xm-switch" title={on ? L('Turn off', 'غیرفعال‌کردن') : L('Turn on', 'فعال‌کردن')}>
          <input type="checkbox" checked={on} disabled={busy === m.id} onChange={e => void save(row, { enabled: e.target.checked })} />
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
      {(!!m.settings?.length || (on && !!m.adminNavigation?.length)) && <div className="xm-foot">
        {on && (m.adminNavigation || []).map(item => <Link className="btn btn-ghost btn-sm" href={item.href} key={item.href}>{fa ? item.label : item.labelEn || item.label} ↗</Link>)}
        {!!m.settings?.length && <button type="button" className="btn btn-ghost btn-sm" aria-expanded={expanded} onClick={() => setOpen(expanded ? '' : m.id)}>{expanded ? L('Hide settings', 'بستن تنظیمات') : L('Settings', 'تنظیمات')}</button>}
      </div>}
      {expanded && !!m.settings?.length && <div className="xm-settings">{m.settings.map(def => <label className="studio-field" key={def.key}><span>{fa ? def.label : def.labelEn || def.label}</span>{def.type === 'boolean' ? <input type="checkbox" checked={Boolean(row.state.settings[def.key])} disabled={busy === m.id} onChange={e => void save(row, { settings: { [def.key]: e.target.checked } })}/> : def.type === 'select' ? <select className="input" value={String(row.state.settings[def.key] ?? '')} disabled={busy === m.id} onChange={e => void save(row, { settings: { [def.key]: e.target.value } })}>{def.options?.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : def.type === 'textarea' ? <textarea className="input" value={String(row.state.settings[def.key] ?? '')} disabled={busy === m.id} onChange={e => edit(m.id, def.key, e.target.value)} onBlur={e => void save(row, { settings: { [def.key]: e.target.value } })}/> : <input className="input" type={def.type === 'secret' ? 'password' : def.type === 'number' ? 'number' : 'text'} value={String(row.state.settings[def.key] ?? '')} disabled={busy === m.id} onChange={e => edit(m.id, def.key, def.type === 'number' ? Number(e.target.value) : e.target.value)} onBlur={e => void save(row, { settings: { [def.key]: def.type === 'number' ? Number(e.target.value) : e.target.value } })}/>}{def.description && <small className="muted">{fa ? def.description : def.descriptionEn || def.description}</small>}</label>)}</div>}
    </article>
  }

  return <div className="xm-page" dir={fa ? 'rtl' : 'ltr'}>
    {!embedded && <header className="tb-hero">
      <div>
        <span className="tb-eyebrow">MODULES & EXTENSIONS</span>
        <h1>{L('Modules & extensions', 'ماژول‌ها و افزونه‌ها')}</h1>
        <p>{L('Every major part of the site is a module you can switch on or off. Turning a module off hides its pages, menus and blocks — its data stays untouched.', 'هر بخش اصلی سایت یک ماژول است که می‌توانید روشن یا خاموش کنید. با خاموش‌کردن، صفحه‌ها، منوها و بلوک‌های آن پنهان می‌شوند و داده‌هایش دست‌نخورده می‌ماند.')}</p>
      </div>
    </header>}
    {message && <div className={`xm-notice${message.error ? ' is-error' : ''}`} role="status">{message.text}</div>}
    {loading && <div className="tb-empty">{L('Loading…', 'در حال بارگذاری…')}</div>}
    {!loading && modules.length > 0 && <section className="xm-section">
      <h2>{L('Site modules', 'ماژول‌های سایت')}</h2>
      <div className="xm-grid">{modules.map(card)}</div>
    </section>}
    {!loading && <section className="xm-section">
      <h2>{L('Extensions', 'افزونه‌ها')}</h2>
      {!plugins.length && <div className="tb-empty">{L('No extensions are installed in this release.', 'افزونه‌ای در این نسخه نصب نشده است.')}</div>}
      <div className="xm-grid">{plugins.map(card)}</div>
    </section>}
    {!embedded && <p className="muted text-sm">{L('Module and extension code ships with each release; activation and settings are stored separately from themes and content.', 'کد ماژول‌ها و افزونه‌ها همراه هر نسخه نصب می‌شود؛ فعال‌سازی و تنظیمات جدا از قالب و محتوا ذخیره می‌شود.')}</p>}
  </div>
}
