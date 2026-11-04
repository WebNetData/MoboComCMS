'use client'

import { useEffect, useState } from 'react'
import Link from '@/components/AppLink'
import Icon from '@/components/site/Icon'
import { PERMALINK_TYPES, normalizePermalinks, permalinkPath, validatePermalinks, type PermalinkConfig, type PermalinkType } from '@/shared/routing/permalinks'
import styles from './permalinks.module.css'
import { validateAliases } from '@/platform/routing/aliases'

type State = { aliases: Record<string, string>; permalinks: PermalinkConfig; revision: string; sections: { base: string; name: string; alias: string }[] }
const DEFAULTS = Object.fromEntries(PERMALINK_TYPES.map(type => [type.key, type.template])) as Record<PermalinkType, string>

export default function PermalinksPage() {
  const [state, setState] = useState<State | null>(null)
  const [templates, setTemplates] = useState(DEFAULTS)
  const [aliases, setAliases] = useState<Record<string, string>>({})
  const [message, setMessage] = useState('')
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setState(null); setMessage('')
    void fetch('/api/admin/site/routes', { cache: 'no-store', signal: controller.signal }).then(async response => {
      const data = await response.json()
      if (!response.ok) throw Error(data.error || 'دریافت تنظیمات انجام نشد')
      if (controller.signal.aborted) return
      setState(data); setTemplates(data.permalinks.templates); setAliases(data.aliases)
    }).catch(reason => { if (!controller.signal.aborted) { setError(true); setMessage(reason.message || 'ارتباط برقرار نشد') } })
    return () => controller.abort()
  }, [revision])
  const draft = normalizePermalinks({ ...state?.permalinks, templates })
  const aliasCheck = validateAliases(aliases, state?.sections.map(section => section.base) || [])
  const previewAliases = { ...Object.fromEntries((state?.sections || []).map(section => [section.base, section.base])), ...(aliasCheck.ok ? aliasCheck.aliases : {}) }
  const invalid = aliasCheck.ok ? validatePermalinks(draft, previewAliases) : aliasCheck.error
  const dirty = !!state && JSON.stringify({ templates, aliases }) !== JSON.stringify({ templates: state.permalinks.templates, aliases: state.aliases })
  const origin = typeof window === 'undefined' ? '' : window.location.origin
  async function save() {
    if (!state || invalid || busy) return
    setBusy(true); setMessage('')
    try {
      const response = await fetch('/api/admin/site/routes', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'If-Match': state.revision }, body: JSON.stringify({ templates, aliases }) })
      const data = await response.json()
      if (!response.ok) throw Error(data.error || 'ذخیره انجام نشد')
      setState({ ...state, ...data }); setTemplates(data.permalinks.templates); setAliases(data.aliases); setError(false); setMessage('پیوندهای یکتا ذخیره شدند. لینک‌های قبلی با انتقال دائمی حفظ می‌شوند.')
    } catch (reason) { setError(true); setMessage(reason instanceof Error ? reason.message : 'ذخیره انجام نشد؛ پیش‌نویس شما حفظ شد.') }
    finally { setBusy(false) }
  }
  return <div className={styles.page} dir="rtl">
    <header className={styles.heading}><div><span><Icon name="link" size={18} />ساختار آدرس‌های سایت</span><h1>پیوندهای یکتا</h1><p>آدرس‌ها را مطابق ساختار دلخواهتان بچینید؛ محتوا، شناسه‌ها و دسترسی‌ها همان می‌مانند.</p></div><button className="btn btn-primary" disabled={!state || !dirty || busy || !!invalid} onClick={save}>{busy ? 'در حال ذخیره…' : 'ذخیرهٔ ساختار لینک‌ها'}</button></header>
    {message && <div className={`${styles.notice} ${error ? styles.error : ''}`} role={error ? 'alert' : 'status'}>{message}{error && <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setRevision(value => value + 1)}>بارگذاری دوبارهٔ تنظیمات</button>}</div>}
    {!state && !message && <p role="status">در حال دریافت تنظیمات…</p>}
    {state && <>
      <section className={styles.intro}><Icon name="shield" size={26} /><div><h2>یک آدرس اصلی؛ لینک‌های قبلی محفوظ</h2><p>انتقال دائمی ۳۰۸، لینک‌های داخل سایت و آدرس canonical با هم هماهنگ می‌شوند. صفحه‌ای با slug رزروشده مانند login آدرس امن قبلی‌اش را نگه می‌دارد.</p></div><Link href="/admin/sections" className="btn btn-ghost">مدیریت بخش‌ها</Link></section>
      <div className={styles.presets}><button type="button" disabled={busy} onClick={() => setTemplates(current => ({ ...current, page: '/{slug}', track: '/music/{artist}/track/{slug}', album: '/music/{artist}/album/{slug}' }))}><Icon name="sparkles" size={21} /><span><b>صفحهٔ مستقیم و نام خواننده</b><small>صفحه بدون /p و نام خواننده در لینک آهنگ و آلبوم</small></span></button><button type="button" disabled={busy} onClick={() => setTemplates({ ...DEFAULTS })}><Icon name="layers" size={21} /><span><b>ساختار اصلی موبوکام</b><small>برگشت به ساختار پیش‌فرض؛ بدون حذف تاریخچهٔ آدرس‌ها</small></span></button></div>
      <section className={styles.legend}><b>راهنمای الگوها</b><span><code dir="ltr">{'{slug}'}</code> نام یکتای محتوا؛ دقیقاً یک‌بار و در یک بخش مسیر</span><span><code dir="ltr">{'{artist}'}</code> نام انگلیسی خواننده؛ برای آهنگ و آلبوم</span></section>
      {invalid && <p className={styles.error} role="alert">{invalid}</p>}
      <fieldset disabled={busy} className={styles.grid}>{PERMALINK_TYPES.map(type => {
        const id = 'permalink-' + type.key
        return <section className={styles.card} key={type.key}><header><h2>{type.name}</h2><small>{state.permalinks.history[type.key]?.length || 0} الگوی قبلی محفوظ</small></header><label htmlFor={id}>الگوی آدرس</label><input id={id} dir="ltr" className="input" value={templates[type.key]} maxLength={180} onChange={event => setTemplates(current => ({ ...current, [type.key]: event.target.value }))} aria-describedby={id + '-preview'} /><div className={styles.preview} id={id + '-preview'}><span>پیش‌نمایش</span><bdi dir="ltr">{origin}{permalinkPath(type.key, type.sample, { artist: 'komeil-nasri' }, draft, previewAliases)}</bdi></div><button type="button" className={styles.reset} onClick={() => setTemplates(current => ({ ...current, [type.key]: type.template }))}>الگوی پیش‌فرض</button></section>
      })}</fieldset>
      <section className={styles.card}><header><h2>نام مسیر بخش‌ها</h2><small>همان تنظیمات مشترک بخش‌های سایت</small></header><div className={styles.bases}>{state.sections.map(section => <label key={section.base}><span>{section.name} <bdi dir="ltr">{section.base}</bdi></span><input className="input" dir="ltr" disabled={busy} value={aliases[section.base] || ''} placeholder={section.base} onChange={event => setAliases(current => ({ ...current, [section.base]: event.target.value }))} /></label>)}</div></section>
    </>}
  </div>
}
