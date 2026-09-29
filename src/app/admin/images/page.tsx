'use client'

import { useCallback, useEffect, useState } from 'react'
import { Notice, fa } from '../store/shared'

type Stats = { count: number; bytes: number; large: number; cached: number }
const mb = (bytes: number) => `${fa(Math.round((bytes / 1024 / 1024) * 10) / 10)} مگابایت`

export default function ImagesPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [run, setRun] = useState<{ done: number; total: number; changed: number; saved: number; running: boolean } | null>(null)
  const [notice, setNotice] = useState('')
  const load = useCallback(async () => { const r = await fetch('/api/admin/images', { cache: 'no-store' }); if (r.ok) setStats(await r.json()) }, [])
  useEffect(() => { void load() }, [load])

  async function optimize() {
    let cursor: number | null = 0, changed = 0, saved = 0
    setRun({ done: 0, total: stats?.count || 0, changed: 0, saved: 0, running: true }); setNotice('')
    while (cursor !== null) {
      const response: Response = await fetch('/api/admin/images', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'optimize', cursor }) })
      const data = await response.json().catch(() => null)
      if (!response.ok) { setNotice(data?.error || 'انجام نشد'); break }
      changed += data.changed; saved += data.saved
      setRun({ done: data.next ?? data.total, total: data.total, changed, saved, running: data.next !== null })
      cursor = data.next
    }
    setRun((current) => current && { ...current, running: false })
    void load()
  }

  return <div className="sa" dir="rtl">
    <header className="sa-head"><h1>بهینه‌سازی تصاویر</h1></header>
    <div className="sa-kpis">
      <div className="sa-kpi"><small>تصاویر ذخیره‌شده</small><b className="num">{stats ? fa(stats.count) : '…'}</b></div>
      <div className="sa-kpi"><small>حجم کل</small><b className="num">{stats ? mb(stats.bytes) : '…'}</b></div>
      <div className="sa-kpi"><small>تصاویر حجیم (بیش از ۳۰۰KB)</small><b className="num">{stats ? fa(stats.large) : '…'}</b></div>
      <div className="sa-kpi"><small>نسخه‌های کوچک‌شده در حافظه</small><b className="num">{stats ? fa(stats.cached) : '…'}</b></div>
    </div>
    <section className="sa-card sa-form">
      <header className="sa-card-head"><h2>چه کارهایی خودکار انجام می‌شود</h2></header>
      <ul className="sa-list">
        <li>هر تصویر تازه (کاور، تصویر محصول، تصویر مطلب، تصاویری که از سایت‌های دیگر کپی می‌شوند) خودکار به WebP تبدیل و تا ۲۴۰۰ پیکسل کوچک می‌شود.</li>
        <li>کارت محصولات، پوسترهای فیلم و کاورهای موزیک نسخهٔ کوچک‌شدهٔ هم‌اندازهٔ کارت را می‌گیرند (برای صفحه‌نمایش‌های معمولی و رتینا جدا)؛ صفحه‌ها سبک‌تر و سریع‌تر باز می‌شوند.</li>
        <li>این دکمه تصاویر قدیمی را در همان قالب قبلی فشرده می‌کند تا نشانی‌های موجود دست نخورند؛ فقط وقتی جایگزین می‌شود که فایل واقعاً کوچک‌تر شده باشد.</li>
      </ul>
      {run && <div className="nl-row"><span className="nl-bar" style={{ flex: 1 }}><i style={{ inlineSize: `${run.total ? Math.round((run.done / run.total) * 100) : 100}%` }} /></span><small className="num">{fa(run.done)} / {fa(run.total)} · {fa(run.changed)} فایل فشرده شد · {mb(run.saved)} صرفه‌جویی</small></div>}
      {notice && <Notice tone="error">{notice}</Notice>}
      <div className="sa-head-actions">
        <button type="button" className="btn btn-primary" disabled={!!run?.running || !stats?.count} onClick={() => void optimize()}>{run?.running ? 'در حال بهینه‌سازی…' : 'بهینه‌سازی تصاویر قدیمی'}</button>
        <button type="button" className="btn btn-ghost" onClick={() => void fetch('/api/admin/images', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'clear-cache' }) }).then(() => load())}>پاک کردن نسخه‌های کوچک‌شده</button>
      </div>
    </section>
  </div>
}
