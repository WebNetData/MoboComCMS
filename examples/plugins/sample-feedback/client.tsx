'use client'

import { useEffect, useState } from 'react'
import { usePathname } from '@/platform/routing/navigation'
import type { PluginClientModule, PluginProps } from '@/plugins/types'

/**
 * UI contribution: rendered by the site in the `site.before-footer` slot while the plugin is enabled.
 * `settings` contains only the settings marked `"public": true` in manifest.json (never secrets).
 */
function FeedbackWidget({ settings, locale }: PluginProps) {
  const pathname = usePathname()
  const fa = locale === 'fa'
  const [voted, setVoted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const key = `sample-feedback:${pathname}`

  // Browser storage can be unavailable (private windows, blocked cookies): always wrap it and work without it.
  useEffect(() => {
    try { setVoted(localStorage.getItem(key) === '1') } catch { setVoted(false) }
    setError('')
  }, [key])

  const hidden = settings['hide-on-admin'] !== false && pathname.startsWith('/admin')
  if (hidden) return null

  async function vote(value: 'up' | 'down') {
    setBusy(true); setError('')
    const response = await fetch('/api/extensions/sample-feedback/vote', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: pathname, value }),
    }).catch(() => null)
    setBusy(false)
    if (!response?.ok) { setError(fa ? 'ثبت نشد؛ دوباره تلاش کنید.' : 'Could not save. Try again.'); return }
    try { localStorage.setItem(key, '1') } catch { /* ignore */ }
    setVoted(true)
  }

  const question = typeof settings.question === 'string' && settings.question ? settings.question : (fa ? 'این صفحه مفید بود؟' : 'Was this page helpful?')
  const thanks = typeof settings.thanks === 'string' ? settings.thanks : ''

  return <aside className="container" style={{ padding: '18px 0' }} aria-label={question}>
    <div className="card" style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', padding: '14px 18px' }}>
      {voted
        ? <span role="status">{thanks}</span>
        : <>
          <span id="sample-feedback-q">{question}</span>
          <span role="group" aria-labelledby="sample-feedback-q" style={{ display: 'inline-flex', gap: 8 }}>
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void vote('up')} aria-label={fa ? 'بله، مفید بود' : 'Yes'}>👍</button>
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void vote('down')} aria-label={fa ? 'نه، مفید نبود' : 'No'}>👎</button>
          </span>
        </>}
      {error && <span role="alert" className="error-text">{error}</span>}
    </div>
  </aside>
}

type Summary = { totals: { up: number; down: number; orders: number }; pages: { path: string; up: number; down: number }[]; lastRecount: string }

/** Admin page: opened from the admin menu entry declared in manifest.json (`adminNavigation`). */
function AdminPage() {
  const [data, setData] = useState<Summary | null>(null)
  const [error, setError] = useState('')
  const load = () => fetch('/api/extensions/sample-feedback/summary', { cache: 'no-store' }).then(async (r) => {
    if (!r.ok) throw new Error(r.status === 403 ? 'دسترسی ندارید' : 'دریافت نشد')
    setData(await r.json())
  }).catch((e: Error) => setError(e.message))
  useEffect(() => { void load() }, [])

  async function reset() {
    if (!window.confirm('همهٔ رأی‌ها صفر شود؟')) return
    const r = await fetch('/api/extensions/sample-feedback/reset', { method: 'POST' })
    if (!r.ok) { setError(r.status === 403 ? 'برای صفر کردن دسترسی «sample-feedback.manage» لازم است' : 'انجام نشد'); return }
    setError(''); void load()
  }

  if (error && !data) return <div className="card" role="alert">{error}</div>
  if (!data) return <div className="card" aria-busy="true">در حال بارگذاری…</div>
  return <div className="card" dir="rtl" style={{ display: 'grid', gap: 12 }}>
    <h2 style={{ margin: 0 }}>بازخورد سریع</h2>
    <p style={{ margin: 0 }}>👍 {data.totals.up.toLocaleString('fa-IR')} · 👎 {data.totals.down.toLocaleString('fa-IR')} · سفارش‌های ثبت‌شده از نصب: {data.totals.orders.toLocaleString('fa-IR')}</p>
    {error && <p role="alert" className="error-text">{error}</p>}
    <table className="data"><thead><tr><th>صفحه</th><th>👍</th><th>👎</th></tr></thead>
      <tbody>{data.pages.map((p) => <tr key={p.path}><td dir="ltr">{p.path}</td><td>{p.up.toLocaleString('fa-IR')}</td><td>{p.down.toLocaleString('fa-IR')}</td></tr>)}
        {!data.pages.length && <tr><td colSpan={3}>هنوز رأیی ثبت نشده است.</td></tr>}</tbody></table>
    <div><button type="button" className="btn btn-ghost" onClick={() => void reset()}>صفر کردن</button></div>
  </div>
}

export const plugin: PluginClientModule = {
  ui: [{ slot: 'site.before-footer', Component: FeedbackWidget, order: 40 }],
  AdminPage,
}
