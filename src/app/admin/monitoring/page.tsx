'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Notice, fa } from '../store/shared'
import Link from '@/components/AppLink'
import type { HealthAction } from '@/modules/operations/domain/health'
import type { BackupHealth } from '@/modules/notifications/domain/backup-health'

type Overview = {
  now: string
  health: HealthAction[]
  backup: BackupHealth
  system: { node: string; platform: string; cpus: number; load: number[]; memory: { total: number; free: number; rss: number; heapUsed: number; heapTotal: number }; uptime: number; disk: { total: number; free: number; usedPercent: number } | null; instance: string }
  database: { ok: boolean; pingMs: number; engine: string }
  cache: { backend: string; pingMs: number; configured: boolean; hits: number; misses: number; errors: number; hitRate: number; degraded?: boolean; degradedSince?: string | null; reconnectAttempts?: number; lastError?: string }
  queue: { counts: Record<string, number>; recent: { id: number; kind: string; label: string; status: string; attempts: number; lastError: string; result: string; createdAt: string; finishedAt: string | null }[] }
  fulfillment: Record<string, number>
  scheduler: { name: string; until: string }[]
  runtime: { startedAt: string; errors: { at: string; event: string; message: string; path: string }[]; errorCount: number; slowQueries: { at: string; model: string; action: string; ms: number }[]; queries: number; avgQueryMs: number }
  vitals: { samples: number; metrics: { kind: string; p75: number; rating: string; count: number; mobile: number; desktop: number }[]; slowPages: { page: string; lcp: number; count: number }[] }
  cdn: { assetPrefix: string; mediaCdn: string }
}

const GB = (bytes: number) => `${(bytes / 1024 ** 3).toLocaleString('fa-IR', { maximumFractionDigits: 1 })} گیگ`
const MB = (bytes: number) => `${Math.round(bytes / 1024 ** 2).toLocaleString('fa-IR')} مگ`
const clock = (value: string) => new Date(value).toLocaleString('fa-IR', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })
const uptime = (s: number) => (s > 86400 ? `${fa(Math.floor(s / 86400))} روز` : s > 3600 ? `${fa(Math.floor(s / 3600))} ساعت` : `${fa(Math.floor(s / 60))} دقیقه`)
const VITAL: Record<string, [string, string]> = { LCP: ['بزرگ‌ترین محتوا (LCP)', 'زمان نمایش بخش اصلی صفحه'], INP: ['پاسخ به کلیک (INP)', 'تأخیر واکنش به کلیک و لمس'], CLS: ['پرش صفحه (CLS)', 'جابه‌جایی ناگهانی اجزا'], FCP: ['اولین نمایش (FCP)', 'اولین محتوای دیده‌شده'], TTFB: ['پاسخ سرور (TTFB)', 'زمان رسیدن اولین بایت'] }
const RATING: Record<string, [string, string]> = { good: ['خوب', 'is-ok'], needs: ['نیاز به بهبود', 'is-warn'], poor: ['ضعیف', 'is-bad'] }
const vitalValue = (kind: string, value: number) => (kind === 'CLS' ? value.toLocaleString('fa-IR', { maximumFractionDigits: 3 }) : value >= 1000 ? `${(value / 1000).toLocaleString('fa-IR', { maximumFractionDigits: 2 })} ثانیه` : `${fa(Math.round(value))} میلی‌ثانیه`)
const JOBS = [['images.optimize', 'بهینه‌سازی همهٔ تصاویر'], ['images.clear-cache', 'پاک‌کردن کش اندازهٔ تصاویر'], ['search.reindex', 'بازسازی نمایهٔ جست‌وجو']] as const
const STATUS: Record<string, [string, string]> = { QUEUED: ['در صف', 'is-info'], RUNNING: ['در حال اجرا', 'is-warn'], DONE: ['انجام شد', 'is-ok'], FAILED: ['ناموفق', 'is-bad'] }

function Meter({ value, label, warn = 75, bad = 90 }: { value: number; label: string; warn?: number; bad?: number }) {
  return <span className={`mo-meter ${value >= bad ? 'is-bad' : value >= warn ? 'is-warn' : 'is-ok'}`} role="meter" aria-label={label} aria-valuenow={Math.min(100, value)} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${Math.min(100, value)}%` }} /></span>
}

export default function Monitoring() {
  const [data, setData] = useState<Overview | null>(null)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState('')
  const [loadError, setLoadError] = useState(false)
  const request = useRef<AbortController | null>(null)
  const load = useCallback(async () => {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    try {
      const response = await fetch('/api/admin/performance', { cache: 'no-store', signal: controller.signal })
      if (!response.ok) throw new Error('Monitoring unavailable')
      const next = await response.json() as Overview
      if (!controller.signal.aborted) { setData(next); setLoadError(false) }
    } catch {
      if (!controller.signal.aborted) setLoadError(true)
    }
  }, [])
  useEffect(() => { void load(); const timer = setInterval(() => void load(), 15_000); return () => { clearInterval(timer); request.current?.abort() } }, [load])
  async function act(body: Record<string, unknown>, done: string) {
    setBusy(String(body.kind || body.op)); setNotice(null)
    const response = await fetch('/api/admin/performance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null)
    const result = await response?.json().catch(() => null)
    setBusy('')
    setNotice(response?.ok ? { tone: 'ok', text: body.op === 'purge-cdn' ? `کش CDN پاک شد: ${(result?.zones || []).join('، ')}` : done } : { tone: 'error', text: result?.error || 'انجام نشد' })
    void load()
  }
  if (!data) return <div className="sa">{loadError ? <Notice tone="error">دریافت وضعیت سلامت ناموفق بود. <button type="button" className="sa-link" onClick={() => void load()}>تلاش دوباره</button></Notice> : <p role="status" aria-busy="true">در حال دریافت وضعیت سلامت…</p>}</div>
  const s = data.system
  const memUsed = Math.round(((s.memory.total - s.memory.free) / s.memory.total) * 100)
  const loadPct = Math.round((s.load[0] / Math.max(1, s.cpus)) * 100)
  return <div className="sa monitoring-overview" dir="rtl">
    <header className="sa-head"><div><h1>پایش سرعت و سلامت سرور</h1><p className="sa-hint">به‌روزرسانی خودکار هر ۱۵ ثانیه · نمونهٔ {s.instance} · روشن از {uptime(s.uptime)} پیش</p></div></header>
    {loadError && <Notice tone="error">به‌روزرسانی ناموفق بود؛ اطلاعات زیر مربوط به {clock(data.now)} است. <button type="button" className="sa-link" onClick={() => void load()}>تلاش دوباره</button></Notice>}
    {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}

    <section className="sa-card" aria-labelledby="monitoring-actions-title">
      <header className="sa-card-head"><h2 id="monitoring-actions-title">سلامت عملیاتی و اقدام‌های لازم</h2><small className="sa-sub">آخرین دریافت: {clock(data.now)}</small></header>
      <ul className="mo-checks">
        {(data.health || []).map(item => <li key={item.id} className={item.tone === 'danger' ? 'is-bad' : item.tone === 'warning' ? 'is-warn' : 'is-ok'}>
          <b>{item.title}</b><p>{item.detail}</p><Link className="sa-link" href={item.href}>{item.action}</Link>
        </li>)}
      </ul>
      {data.backup?.latestAt && <p className="sa-hint">آخرین فایل ثبت‌شده: {clock(data.backup.latestAt)} · آزمون بازیابی همان فایل: {data.backup.restoreTest === 'passed' ? 'موفق ثبت شده' : data.backup.restoreTest === 'failed' ? 'ناموفق ثبت شده' : 'تأیید نشده'}</p>}
      <div className="sa-row"><Link className="btn btn-ghost" href="/admin/extensions">وضعیت و وابستگی افزونه‌ها</Link><Link className="btn btn-ghost" href="/admin/updates">بررسی سازگاری به‌روزرسانی</Link><Link className="btn btn-ghost" href="/admin/operations">رسیدگی به تحویل سفارش‌ها</Link></div>
      <p className="sa-hint">این نما فقط وضعیت را می‌خواند؛ تلاش دوباره، آزمون بازیابی و به‌روزرسانی از ابزارهای مجاز هر بخش انجام می‌شوند.</p>
    </section>

    <div className="sa-kpis">
      <div className="sa-kpi"><small>بار پردازنده ({fa(s.cpus)} هسته)</small><b className="num">{fa(loadPct)}٪</b><Meter label="بار پردازنده" value={loadPct} warn={70} bad={100} /><span className="sa-sub">میانگین ۱/۵/۱۵ دقیقه: {s.load.map((n) => n.toLocaleString('fa-IR')).join(' / ')}</span></div>
      <div className="sa-kpi"><small>حافظه</small><b className="num">{fa(memUsed)}٪</b><Meter label="مصرف حافظه" value={memUsed} /><span className="sa-sub">برنامه: {MB(s.memory.rss)} از {GB(s.memory.total)}</span></div>
      <div className="sa-kpi"><small>دیسک</small><b className="num">{s.disk ? `${fa(s.disk.usedPercent)}٪` : '—'}</b>{s.disk && <Meter label="مصرف دیسک" value={s.disk.usedPercent} />}<span className="sa-sub">{s.disk ? `${GB(s.disk.free)} آزاد` : 'نامشخص'}</span></div>
      <div className="sa-kpi"><small>پایگاه داده ({data.database.engine})</small><b className={data.database.ok ? '' : 'mo-bad'}>{data.database.ok ? `${data.database.pingMs.toLocaleString('fa-IR')} ms` : 'قطع'}</b><span className="sa-sub">{fa(data.runtime.queries)} کوئری · میانگین {data.runtime.avgQueryMs.toLocaleString('fa-IR')} ms</span></div>
      <div className="sa-kpi"><small>کش ({data.cache.backend === 'redis' ? 'Redis' : 'حافظهٔ داخلی'})</small><b className="num">{fa(data.cache.hitRate)}٪ برخورد</b><span className="sa-sub">{data.cache.configured && data.cache.backend !== 'redis' ? '⚠ Redis تنظیم شده ولی در دسترس نیست' : data.cache.backend === 'redis' ? `پینگ ${data.cache.pingMs.toLocaleString('fa-IR')} ms` : 'برای چند سرور، REDIS_URL را تنظیم کنید'}</span></div>
    </div>

    <section className="sa-card">
      <header className="sa-card-head"><h2>سرعت واقعی کاربران (Web Vitals، صدک ۷۵ در ۲۴ ساعت)</h2><small className="sa-sub">{fa(data.vitals.samples)} نمونه از بازدیدها</small></header>
      {data.vitals.samples ? <div className="mo-vitals">{data.vitals.metrics.map((m) => <div key={m.kind} className={`mo-vital ${(RATING[m.rating] || ['', ''])[1]}`}>
        <small>{VITAL[m.kind]?.[0] || m.kind}</small>
        <b>{m.count ? vitalValue(m.kind, m.p75) : '—'}</b>
        {m.count > 0 && <span className={`sa-state ${(RATING[m.rating] || ['', ''])[1]}`}>{(RATING[m.rating] || [''])[0]}</span>}
        <small className="sa-sub">موبایل {m.mobile ? vitalValue(m.kind, m.mobile) : '—'} · دسکتاپ {m.desktop ? vitalValue(m.kind, m.desktop) : '—'}</small>
      </div>)}</div> : <p className="sa-empty">هنوز داده‌ای جمع نشده؛ با بازدید کاربران (نمونهٔ ۲۰٪ صفحات) پر می‌شود.</p>}
      {data.vitals.slowPages.length > 0 && <table className="data sa-table"><thead><tr><th>کندترین صفحه‌ها</th><th>LCP صدک ۷۵</th><th>نمونه</th></tr></thead><tbody>{data.vitals.slowPages.map((p) => <tr key={p.page}><td dir="ltr">{p.page}</td><td>{vitalValue('LCP', p.lcp)}</td><td className="num">{fa(p.count)}</td></tr>)}</tbody></table>}
    </section>

    <div className="mo-stack">
      <section className="sa-card sa-table-wrap" id="monitoring-jobs">
        <header className="sa-card-head"><h2>صف کارهای سنگین</h2><small className="sa-sub">{Object.entries(data.queue.counts).map(([k, v]) => `${(STATUS[k] || [k])[0]}: ${fa(v)}`).join(' · ') || 'خالی'}</small></header>
        <div className="sa-row">{JOBS.map(([kind, label]) => <button key={kind} type="button" className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => void act({ op: 'job', kind }, `«${label}» در صف قرار گرفت و در پس‌زمینه اجرا می‌شود.`)}>{busy === kind ? '…' : label}</button>)}</div>
        <table className="data sa-table"><thead><tr><th>کار</th><th>وضعیت</th><th>زمان</th><th /></tr></thead><tbody>
          {data.queue.recent.map((job) => <tr key={job.id}><td>{job.label}{job.lastError && <small className="sa-sub mo-bad">{job.lastError}</small>}</td><td><span className={`sa-state ${(STATUS[job.status] || ['', ''])[1]}`}>{(STATUS[job.status] || [job.status])[0]}</span></td><td>{clock(job.createdAt)}</td><td>{job.status === 'FAILED' && <button type="button" className="sa-link" onClick={() => void act({ op: 'retry', id: job.id }, 'دوباره در صف قرار گرفت')}>تلاش دوباره</button>}</td></tr>)}
          {!data.queue.recent.length && <tr><td colSpan={4} className="sa-empty">کاری ثبت نشده است.</td></tr>}
        </tbody></table>
        <p className="sa-hint">تحویل سفارش‌ها: {Object.entries(data.fulfillment).map(([k, v]) => `${k}: ${fa(v)}`).join(' · ') || '—'}</p>
      </section>
      <section className="sa-card sa-table-wrap">
        <header className="sa-card-head"><h2>زمان‌بند کارهای خودکار</h2></header>
        <table className="data sa-table"><thead><tr><th>کار</th><th>قفل تا</th></tr></thead><tbody>
          {data.scheduler.map((row) => <tr key={row.name}><td dir="ltr">{row.name}</td><td>{clock(row.until)}{new Date(row.until) > new Date() ? ' · در حال اجرا/اخیر' : ''}</td></tr>)}
          {!data.scheduler.length && <tr><td colSpan={2} className="sa-empty">هنوز اجرا نشده است.</td></tr>}
        </tbody></table>
      </section>
    </div>

    <div className="mo-stack">
      <section className="sa-card sa-table-wrap">
        <header className="sa-card-head"><h2>خطاهای اخیر</h2><small className="sa-sub">{fa(data.runtime.errorCount)} خطا از {clock(data.runtime.startedAt)}</small></header>
        <table className="data sa-table"><thead><tr><th>رویداد</th><th>پیام</th><th>زمان</th></tr></thead><tbody>
          {data.runtime.errors.map((row, index) => <tr key={index}><td dir="ltr">{row.event}{row.path && <small className="sa-sub">{row.path}</small>}</td><td dir="auto">{row.message || '—'}</td><td>{clock(row.at)}</td></tr>)}
          {!data.runtime.errors.length && <tr><td colSpan={3} className="sa-empty">خطایی ثبت نشده است. 🎉</td></tr>}
        </tbody></table>
      </section>
      <section className="sa-card sa-table-wrap">
        <header className="sa-card-head"><h2>کوئری‌های کند (بیش از ۳۰۰ms)</h2></header>
        <table className="data sa-table"><thead><tr><th>جدول</th><th>عمل</th><th>زمان</th></tr></thead><tbody>
          {data.runtime.slowQueries.slice(0, 15).map((row, index) => <tr key={index}><td dir="ltr">{row.model}</td><td dir="ltr">{row.action}</td><td className="num">{fa(row.ms)} ms</td></tr>)}
          {!data.runtime.slowQueries.length && <tr><td colSpan={3} className="sa-empty">کوئری کندی دیده نشده است.</td></tr>}
        </tbody></table>
      </section>
    </div>

    <section className="sa-card sa-form">
      <header className="sa-card-head"><h2>CDN و آمادگی برای ترافیک بالا</h2></header>
      <ul className="mo-checks">
        <li className={data.cache.backend === 'redis' ? 'is-ok' : data.cache.degraded ? 'is-bad' : 'is-warn'}><b>کش و محدودیت مشترک (Redis):</b> {data.cache.backend === 'redis' ? 'فعال'
          : data.cache.degraded ? <>تنظیم شده ولی در دسترس نیست{data.cache.degradedSince ? <> از <bdi dir="ltr">{new Date(data.cache.degradedSince).toLocaleString('fa-IR')}</bdi></> : null}؛ سایت روی حافظهٔ داخلی همین نسخه کار می‌کند و خودکار دوباره وصل می‌شود ({fa(data.cache.reconnectAttempts || 0)} تلاش). تا آن زمان محدودیت‌های ورود فقط در همین نسخه شمرده می‌شوند و ورود با گوگلی که به نسخهٔ دیگری برگردد رد می‌شود.{data.cache.lastError ? <> آخرین خطا: <bdi dir="ltr">{data.cache.lastError}</bdi></> : null}</>
          : 'غیرفعال — برای اجرای چند نسخهٔ برنامه، REDIS_URL را در .env تنظیم کنید.'}</li>
        <li className={data.database.engine === 'PostgreSQL' ? 'is-ok' : 'is-warn'}><b>پایگاه داده:</b> {data.database.engine === 'PostgreSQL' ? 'PostgreSQL (مناسب ترافیک بالا)' : 'SQLite — برای ترافیک بالا به PostgreSQL مهاجرت کنید (راهنمای DEPLOY-FA.md).'}</li>
        <li className={data.cdn.assetPrefix ? 'is-ok' : ''}><b>CDN فایل‌های برنامه:</b> {data.cdn.assetPrefix ? <bdi dir="ltr">{data.cdn.assetPrefix}</bdi> : 'تنظیم نشده (CDN_URL) — با کلادفلر روی کل دامنه هم کافی است.'}</li>
        <li className={data.cdn.mediaCdn ? 'is-ok' : ''}><b>CDN تصاویر:</b> {data.cdn.mediaCdn ? <bdi dir="ltr">{data.cdn.mediaCdn}</bdi> : 'تنظیم نشده (NEXT_PUBLIC_MEDIA_CDN) — تصاویر با کش یک‌ساله از خود سایت سرو می‌شوند.'}</li>
      </ul>
      <div className="sa-row"><button type="button" className="btn btn-ghost" disabled={!!busy} onClick={() => void act({ op: 'purge-cdn' }, '')}>{busy === 'purge-cdn' ? 'در حال پاک‌کردن…' : 'پاک‌کردن کش کلادفلر'}</button></div>
      <p className="sa-hint">آزمون بار: روی یک سیستم دیگر اجرا کنید <code dir="ltr">node scripts/load-test.mjs https://your-site.com --users 50 --seconds 60</code> و نتیجه را همین‌جا در «سرعت واقعی» و «کوئری‌های کند» دنبال کنید.</p>
    </section>
  </div>
}
