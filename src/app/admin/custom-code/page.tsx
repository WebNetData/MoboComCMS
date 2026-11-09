'use client'
import { useEffect, useState } from 'react'
import AiCodePanel from '../builder/AiCodePanel'
import { PROTECTED_PATHS, SITE_CODE_MAX, newSnippetId, type SiteCodeSettings, type SiteSnippet } from '@/modules/site/domain/site-code'
import '../builder/studio.css'
import styles from './page.module.css'

const L = (_en: string, fa: string) => fa
const KINDS = { html: 'HTML (می‌تواند اسکریپت داشته باشد)', css: 'CSS', js: 'جاوااسکریپت' } as const
const PLACES = { head: 'داخل head', 'body-start': 'ابتدای body', 'body-end': 'انتهای body' } as const
const AUDIENCES = { all: 'همهٔ بازدیدکنندگان', guests: 'فقط مهمان‌ها', members: 'فقط کاربران واردشده' } as const
const blank = (): SiteSnippet => ({ id: newSnippetId(), name: '', kind: 'html', location: 'body-end', code: '', enabled: false, paths: [], exclude: [], audience: 'all' })

export default function CustomCodePage() {
  const [settings, setSettings] = useState<SiteCodeSettings | null>(null), [revision, setRevision] = useState(''), [serverOff, setServerOff] = useState(false)
  const [editing, setEditing] = useState<SiteSnippet | null>(null), [message, setMessage] = useState<{ text: string; error: boolean } | null>(null), [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch('/api/admin/site-code', { cache: 'no-store' }).then(async r => { const d = await r.json(); if (!r.ok) throw Error(d?.error || 'دریافت نشد'); setSettings(d.settings); setRevision(d.revision); setServerOff(d.disabledByServer) })
      .catch(e => setMessage({ text: e instanceof Error ? e.message : 'دریافت نشد', error: true }))
  }, [])

  async function save(next: SiteCodeSettings, done: string) {
    setBusy(true); setMessage(null)
    const r = await fetch('/api/admin/site-code', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'If-Match': revision }, body: JSON.stringify({ settings: next }) }).catch(() => null), d = await r?.json().catch(() => null)
    setBusy(false)
    if (!r?.ok) { setMessage({ text: d?.error || 'ذخیره نشد؛ ویرایش شما در فرم مانده است', error: true }); return false }
    setSettings(d.settings); setRevision(d.revision); setMessage({ text: done, error: false }); return true
  }
  const put = (snippet: SiteSnippet) => settings && save({ ...settings, snippets: settings.snippets.some(s => s.id === snippet.id) ? settings.snippets.map(s => s.id === snippet.id ? snippet : s) : [...settings.snippets, snippet] }, 'کد ذخیره شد').then(ok => { if (ok) setEditing(null) })
  const set = <K extends keyof SiteSnippet>(key: K, value: SiteSnippet[K]) => editing && setEditing({ ...editing, [key]: value })

  if (!settings) return <div className={styles.page}>{message ? <p role="alert">{message.text}</p> : <p role="status">در حال دریافت…</p>}</div>
  return <div className={styles.page}>
    <header className={styles.hero}>
      <div><p className={styles.eyebrow}>ظاهر سایت · کد</p><h1>کد سفارشی سایت</h1><p>کد HTML، CSS یا جاوااسکریپت برای همهٔ صفحه‌ها یا صفحه‌های مشخص؛ مثل کد آمار، ابزار گفتگو، فونت یا افکت سراسری. این کدها در صفحه‌های مدیریت، ورود و نصب هرگز اجرا نمی‌شوند تا همیشه بتوانید از همین‌جا خاموششان کنید.</p></div>
      <label className={styles.master} data-on={settings.enabled}>
        <input type="checkbox" checked={settings.enabled} disabled={busy} onChange={e => void save({ ...settings, enabled: e.target.checked }, e.target.checked ? 'کدهای فعال روی سایت اجرا می‌شوند' : 'همهٔ کدهای سفارشی خاموش شدند')} />
        <span><b>{settings.enabled ? 'روشن' : 'خاموش'}</b><small>کلید اصلی همهٔ کدها</small></span>
      </label>
    </header>
    {serverOff && <p className={styles.alert} role="status">متغیر SITE_CODE_DISABLED=1 روی سرور تنظیم شده و همهٔ کدها، صرف‌نظر از این صفحه، خاموش‌اند.</p>}
    {message && <p className={message.error ? styles.alert : styles.ok} role="status">{message.text}</p>}

    <section className={styles.list} aria-label="کدها">
      {settings.snippets.map(s => <article key={s.id} className={styles.item} data-on={s.enabled && settings.enabled}>
        <div><b>{s.name || 'بدون نام'}</b><span>{KINDS[s.kind]} · {PLACES[s.location]} · {AUDIENCES[s.audience]} · {s.paths.length ? `فقط ${s.paths.join('، ')}` : 'همهٔ صفحه‌ها'}{s.exclude.length ? ` · به‌جز ${s.exclude.join('، ')}` : ''}</span></div>
        <label className={styles.toggle}><input type="checkbox" checked={s.enabled} disabled={busy} onChange={e => void save({ ...settings, snippets: settings.snippets.map(x => x.id === s.id ? { ...x, enabled: e.target.checked } : x) }, e.target.checked ? 'کد فعال شد' : 'کد خاموش شد')} /><span>{s.enabled ? 'فعال' : 'خاموش'}</span></label>
        <div className={styles.row}><button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(s)}>ویرایش</button><button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => { if (confirm(`«${s.name || 'بدون نام'}» حذف شود؟`)) void save({ ...settings, snippets: settings.snippets.filter(x => x.id !== s.id) }, 'کد حذف شد') }}>حذف</button></div>
      </article>)}
      {!settings.snippets.length && <p className={styles.empty}>هنوز کدی اضافه نشده است.</p>}
      <button type="button" className="btn btn-primary" disabled={busy || settings.snippets.length >= SITE_CODE_MAX} onClick={() => setEditing(blank())}>افزودن کد</button>
    </section>

    {editing && <form className={styles.editor} onSubmit={e => { e.preventDefault(); void put(editing) }}>
      <h2>{settings.snippets.some(s => s.id === editing.id) ? 'ویرایش کد' : 'کد تازه'}</h2>
      <div className={styles.grid}>
        <label className="bld-field"><span>نام</span><input className="input" maxLength={80} value={editing.name} onChange={e => set('name', e.target.value)} placeholder="مثلاً کد آمار گوگل" required /></label>
        <label className="bld-field"><span>نوع</span><select className="select" value={editing.kind} onChange={e => set('kind', e.target.value as SiteSnippet['kind'])}>{Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label className="bld-field"><span>محل</span><select className="select" value={editing.kind === 'css' ? 'head' : editing.location} disabled={editing.kind === 'css'} onChange={e => set('location', e.target.value as SiteSnippet['location'])}>{Object.entries(PLACES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label className="bld-field"><span>برای</span><select className="select" value={editing.audience} onChange={e => set('audience', e.target.value as SiteSnippet['audience'])}>{Object.entries(AUDIENCES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label className="bld-field"><span>فقط این مسیرها (هر خط یکی؛ خالی = همه)</span><textarea className="textarea mono" dir="ltr" rows={3} value={editing.paths.join('\n')} placeholder={'/shop\n/blog/*'} onChange={e => set('paths', e.target.value.split('\n'))} /></label>
        <label className="bld-field"><span>به‌جز این مسیرها</span><textarea className="textarea mono" dir="ltr" rows={3} value={editing.exclude.join('\n')} placeholder="/checkout" onChange={e => set('exclude', e.target.value.split('\n'))} /></label>
      </div>
      <label className="bld-field"><span>کد</span><textarea className="textarea bld-code mono" dir="ltr" rows={12} maxLength={60000} value={editing.code} onChange={e => set('code', e.target.value)} placeholder={editing.kind === 'css' ? 'body { … }' : editing.kind === 'js' ? 'console.log("hi")' : '<script async src="…"></script>'} /></label>
      <AiCodePanel target="page" L={L} current={editing.kind === 'css' ? { html: '', css: editing.code, js: '' } : editing.kind === 'js' ? { html: '', css: '', js: editing.code } : { html: editing.code, css: '', js: '' }} onApply={code => {
        const parts = [code.html, code.css && `<style>${code.css}</style>`, code.js && `<script>${code.js}</script>`].filter(Boolean)
        setEditing({ ...editing, ...(code.html || parts.length > 1 ? { kind: 'html' as const, code: parts.join('\n') } : code.css ? { kind: 'css' as const, location: 'head' as const, code: code.css } : { kind: 'js' as const, code: code.js }) })
      }} />
      <p className={styles.note}>مسیرهای محافظت‌شده که هیچ کدی در آن‌ها اجرا نمی‌شود: <span dir="ltr">{PROTECTED_PATHS.join('  ')}</span>. کد جاوااسکریپت برای هر بازدیدکننده اجرا می‌شود؛ فقط کدی را که می‌شناسید فعال کنید. هر ذخیره در تاریخچه و گزارش فعالیت ثبت می‌شود.</p>
      <label className={styles.toggle}><input type="checkbox" checked={editing.enabled} onChange={e => set('enabled', e.target.checked)} /><span>بعد از ذخیره فعال باشد</span></label>
      <div className={styles.row}><button className="btn btn-primary" disabled={busy}>ذخیره</button><button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>انصراف</button></div>
    </form>}
  </div>
}
