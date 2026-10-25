'use client'
import { useEffect, useState, type CSSProperties } from 'react'
import Link from '@/components/AppLink'
import Icon from '@/components/site/Icon'
import type { SiteConfig, ThemeColors, ThemeManifest } from '@/modules/site/config/types'
import { codeThemeDesigns } from '@/themes/generated/catalog'
import { COLOR_KEYS, COLOR_LABELS, LIGHT_FALLBACK } from './DesignTab'

/** Site Studio keeps at most this many installed or customised designs (validateSite). */
export const MAX_INSTALLED_THEMES = 20
const CODE_THEMES = new Set(codeThemeDesigns.map((theme) => theme.id))
type Source = 'bundled' | 'code' | 'custom' | 'package' | 'installed'
const SOURCES: { key: Source; label: string }[] = [
  { key: 'bundled', label: 'همراه سیستم' }, { key: 'code', label: 'قالب کدی' }, { key: 'custom', label: 'سفارشی‌شده' },
  { key: 'package', label: 'از بسته' }, { key: 'installed', label: 'نصب‌شده از JSON' },
]
const fa = (value: number) => value.toLocaleString('fa-IR')
/** Black or white, whichever reads better on the accent (the preview button). */
function readableOn(hex: string) {
  const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? '#0b0f14' : '#ffffff'
}

/**
 * The themes tab: every design the site can wear, previewed in its own colours, shape and both modes, with where it
 * comes from and whether it is live. Choosing, customising, installing and removing change the draft; nothing reaches
 * the site until "publish", and every publish is a version in the settings history.
 */
export default function ThemesTab({ config, themes, savedThemeId, change, importTheme, customize }: {
  config: SiteConfig
  themes: ThemeManifest[]
  savedThemeId: string
  change: (value: SiteConfig) => void
  importTheme: (file?: File) => void
  customize: () => void
}) {
  const [query, setQuery] = useState('')
  const [source, setSource] = useState<Source | ''>('')
  const [mode, setMode] = useState<'dark' | 'light'>('dark')
  const [drag, setDrag] = useState(false)
  // Designs an uploaded package installed belong to that package: they are removed with it, not from here.
  const [packaged, setPackaged] = useState<Set<string> | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/admin/packages', { cache: 'no-store', signal: controller.signal })
      .then(async (res) => (res.ok ? res.json() : null))
      .then((data: { packages?: { id: string; manifest?: { id?: string; kind?: string } }[] } | null) => {
        if (!controller.signal.aborted && data) setPackaged(new Set((data.packages || []).filter((row) => row.manifest?.kind === 'theme').map((row) => row.manifest?.id || row.id)))
      })
      .catch(() => {})
    return () => controller.abort()
  }, [])

  const all = [...themes, ...config.themes]
  const sourceOf = (theme: ThemeManifest): Source => {
    if (themes.some((item) => item.id === theme.id)) return CODE_THEMES.has(theme.id) ? 'code' : 'bundled'
    if (packaged?.has(theme.id)) return 'package'
    return theme.id.startsWith('custom-') ? 'custom' : 'installed'
  }
  const nameOf = (id?: string) => all.find((theme) => theme.id === id)?.name || id || ''
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const matches = (theme: ThemeManifest) => words.every((word) => [theme.name, theme.description, theme.id, theme.extends || ''].join(' ').toLowerCase().includes(word))
  const shown = all.filter((theme) => matches(theme) && (!source || sourceOf(theme) === source))
  const full = config.themes.length >= MAX_INSTALLED_THEMES
  const pending = config.themeId !== savedThemeId

  function remove(theme: ThemeManifest) {
    if (!window.confirm(`قالب «${theme.name}» از استودیو حذف شود؟ پس از انتشار تغییرات، از فهرست قالب‌ها برداشته می‌شود و از تاریخچه قابل بازگردانی است.`)) return
    change({ ...config, themes: config.themes.filter((item) => item.id !== theme.id) })
  }
  function download(theme: ThemeManifest) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(theme, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a'); a.href = url; a.download = `${theme.id}.theme.json`; a.click(); URL.revokeObjectURL(url)
  }

  return <div className="tm-tab">
    <div className={`tm-status${pending ? ' is-pending' : ''}`} role="status">
      <Icon name={pending ? 'sparkles' : 'check'} size={18} />
      <span>قالب فعال روی سایت: <b>{nameOf(savedThemeId)}</b>
        {pending && <> · انتخاب شما <b>«{nameOf(config.themeId)}»</b> با «انتشار تغییرات» روی سایت می‌نشیند.</>}
      </span>
      <small>هر انتشار نسخه‌ای در «تاریخچه و بازگردانی» می‌سازد؛ قالب قبلی از همان‌جا برمی‌گردد.</small>
    </div>
    <search className="xm-toolbar">
      <label className="xm-search"><span className="sr-only">جست‌وجوی قالب</span><Icon name="search" size={16} /><input className="input" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="جست‌وجو با نام یا توضیح قالب…" /></label>
      <div className="tm-toolbar-row">
        <div className="xm-filter is-wrap" role="group" aria-label="منبع قالب">
          <button type="button" className={!source ? 'is-active' : ''} aria-pressed={!source} onClick={() => setSource('')}>همه<span>{fa(all.filter(matches).length)}</span></button>
          {SOURCES.filter((item) => all.some((theme) => sourceOf(theme) === item.key)).map((item) => <button key={item.key} type="button" className={source === item.key ? 'is-active' : ''} aria-pressed={source === item.key} onClick={() => setSource(source === item.key ? '' : item.key)}>{item.label}<span>{fa(all.filter((theme) => matches(theme) && sourceOf(theme) === item.key).length)}</span></button>)}
        </div>
        <div className="xm-filter" role="group" aria-label="حالت پیش‌نمایش">
          {([['dark', 'تیره'], ['light', 'روشن']] as const).map(([value, label]) => <button key={value} type="button" className={mode === value ? 'is-active' : ''} aria-pressed={mode === value} onClick={() => setMode(value)}>{label}</button>)}
        </div>
      </div>
    </search>
    {!shown.length && <div className="tb-empty">قالبی با این جست‌وجو پیدا نشد.</div>}
    <div className="tm-grid">{shown.map((theme) => {
      const from = sourceOf(theme)
      const live = theme.id === savedThemeId, chosen = theme.id === config.themeId
      const colors: ThemeColors = mode === 'light' ? theme.lightColors || LIGHT_FALLBACK : theme.colors
      const owned = config.themes.some((item) => item.id === theme.id)
      // Removable: a design the studio holds, not live or chosen, and known not to belong to an installed package.
      const removable = owned && !live && !chosen && packaged !== null && from !== 'package'
      const style = { '--tp-bg': colors.background, '--tp-surface': colors.surface, '--tp-accent': colors.accent, '--tp-on-accent': readableOn(colors.accent), '--tp-text': colors.text, '--tp-muted': colors.muted, '--tp-border': colors.border, '--tp-radius': `${theme.radius}px` } as CSSProperties
      return <article key={theme.id} className={`tm-card${chosen ? ' is-chosen' : ''}`} aria-label={theme.name}>
        <div className="tm-preview" style={style} aria-hidden="true">
          <div className="tm-nav"><b>{config.brand}</b><span><i /><i /><i /></span></div>
          <div className="tm-hero"><strong>سایت شما با این قالب</strong><p>متن توضیح با رنگ فرعی و خطوط همین قالب.</p><span className="tm-button">دکمهٔ اصلی</span></div>
          <div className="tm-cards"><span><i />کارت</span><span><i />کارت</span></div>
        </div>
        <div className="tm-body">
          <div className="tm-title"><h3>{theme.name}</h3><small dir="ltr">v{theme.version}</small></div>
          <div className="tm-badges">
            {live && <span className="xm-chip is-live">فعال روی سایت</span>}
            {chosen && !live && <span className="xm-chip is-warn">انتخاب‌شده · منتشر نشده</span>}
            <span className="xm-chip is-muted">{SOURCES.find((item) => item.key === from)?.label}</span>
            {theme.extends && <span className="xm-chip is-muted">بر پایهٔ {nameOf(theme.extends)}</span>}
            {mode === 'light' && !theme.lightColors && <span className="xm-chip is-muted">رنگ روشن پیش‌فرض</span>}
          </div>
          <p>{theme.description}</p>
          <ul className="tm-swatches" aria-label="رنگ‌های قالب">{COLOR_KEYS.map((key) => <li key={key} title={`${COLOR_LABELS[key]}: ${colors[key]}`}><i style={{ background: colors[key] }} /><span className="sr-only">{COLOR_LABELS[key]} {colors[key]}</span></li>)}</ul>
          <div className="tm-actions">
            <button type="button" className={`btn btn-sm ${chosen ? 'btn-primary' : 'btn-ghost'}`} aria-pressed={chosen} onClick={() => change({ ...config, themeId: theme.id })}>{chosen ? '✓ انتخاب‌شده' : 'انتخاب قالب'}</button>
            {chosen && <button type="button" className="btn btn-ghost btn-sm" onClick={customize}>ویرایش رنگ و شکل</button>}
            {owned && <button type="button" className="btn btn-ghost btn-sm" onClick={() => download(theme)}>دریافت JSON</button>}
            {removable && <button type="button" className="btn btn-ghost btn-sm tm-remove" onClick={() => remove(theme)}>حذف</button>}
            {from === 'package' && <Link className="btn btn-ghost btn-sm" href="/admin/extensions">مدیریت بسته ↗</Link>}
          </div>
        </div>
      </article>
    })}</div>
    <label className={`pm-drop tm-drop${drag ? ' is-drag' : ''}${full ? ' is-full' : ''}`} onDragOver={(e) => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); if (!full) importTheme(e.dataTransfer.files?.[0]) }}>
      <input type="file" accept=".json,application/json" className="sr-only" disabled={full} onChange={(e) => { importTheme(e.target.files?.[0]); e.target.value = '' }} />
      <Icon name="upload" size={26} />
      <strong>{full ? `ظرفیت قالب‌های نصب‌شده پر است (${fa(MAX_INSTALLED_THEMES)})` : 'نصب قالب طراحی از فایل JSON'}</strong>
      <small>{full ? 'برای نصب قالب تازه، یکی از قالب‌های نصب‌شده را حذف کنید.' : `فایل را اینجا رها کنید یا برای انتخاب کلیک کنید. فقط رنگ‌ها و شکل نصب می‌شوند و کدی اجرا نمی‌شود؛ قالب‌های کدی که سربرگ، پابرگ و صفحهٔ اصلی را عوض می‌کنند به‌صورت بسته از بخش افزونه‌ها نصب می‌شوند. ${fa(config.themes.length)} از ${fa(MAX_INSTALLED_THEMES)} جای نصب پر است.`}</small>
    </label>
  </div>
}
