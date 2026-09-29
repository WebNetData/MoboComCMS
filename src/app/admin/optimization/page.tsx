'use client'

import { useState, type FormEvent } from 'react'
import { Notice, fa, faDate, send, useJson } from '../store/shared'

type Mode = 'off' | 'balanced' | 'aggressive' | 'custom'
type Config = {
  mode: Mode; ttl: number; staleWhileRevalidate: number; staleIfError: number; include: string[]; exclude: string[]; overrides: { prefix: string; ttl: number }[]
  keepParams: string[]; edgeHeaders: boolean; debugHeaders: boolean; maxMemoryMb: number; warm: boolean; warmIntervalMinutes: number; warmLimit: number
}
type Report = {
  entries: number; bytes: number; hits: number; stale: number; misses: number; errorServes: number; fills: number; fillErrors: number; evictions: number; purges: number; hitRate: number
  bypass: Record<string, number>; fillP50: number; fillP95: number; pendingViews: number
  top: { path: string; hits: number; kb: number; ageSeconds: number; fillMs: number; status: number }[]
  lastPurge: { at: number; reason: string; entries: number } | null; lastWarm: { at: number; pages: number; ms: number } | null
}
type Overview = { config: Config; report: Report; presets: Record<string, { ttl: number; staleWhileRevalidate: number; staleIfError: number }>; defaults: { include: string[]; exclude: string[] }; redis: boolean; instance: string }
type Probe = { first: { status: number; cache: string; ms: number; bytes: number }; second: { status: number; cache: string; ms: number; bytes: number } }

const MODES: { id: Mode; title: string; text: string }[] = [
  { id: 'off', title: 'خاموش', text: 'هر بازدید صفحه را از نو می‌سازد. مناسب توسعه و سایت‌های کم‌بازدید.' },
  { id: 'balanced', title: 'متعادل', text: 'صفحه‌ها یک دقیقه تازه می‌مانند؛ تغییرات تقریباً بلافاصله دیده می‌شود. پیشنهاد اکثر سایت‌ها.' },
  { id: 'aggressive', title: 'پرترافیک', text: 'پنج دقیقه تازه‌ماندن و ارائهٔ نسخهٔ قدیمی تا ۶ ساعت اگر برنامه خطا بدهد. برای فشار زیاد یا کمپین تبلیغاتی.' },
  { id: 'custom', title: 'سفارشی', text: 'زمان‌ها، مسیرها و استثناها را خودتان تعیین می‌کنید.' },
]
const REASONS: Record<string, string> = { method: 'درخواست غیر GET', rsc: 'ناوبری داخلی برنامه', accept: 'غیر صفحهٔ HTML', personal: 'بازدیدکنندهٔ واردشده یا دارای سبد', excluded: 'مسیر مستثنا', 'not-listed': 'مسیر در فهرست نیست', query: 'پارامتر ناشناخته در نشانی' }
const mb = (bytes: number) => (bytes / 1048576).toLocaleString('fa-IR', { maximumFractionDigits: 1 })
const seconds = (value: number) => (value >= 3600 ? `${fa(Math.round(value / 360) / 10)} ساعت` : value >= 60 ? `${fa(Math.round(value / 6) / 10)} دقیقه` : `${fa(value)} ثانیه`)
const lines = (list: string[]) => list.join('\n')
const parseLines = (text: string) => text.split(/[\s,،]+/).filter(Boolean)

export default function OptimizationPage() {
  const { data, error, reload } = useJson<Overview>('/api/admin/optimization')
  const [form, setForm] = useState<Config | null>(null)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState('')
  const [prefix, setPrefix] = useState('')
  const [probePath, setProbePath] = useState('/')
  const [probe, setProbe] = useState<Probe | null>(null)
  if (error) return <div className="sa" dir="rtl"><Notice tone="error">{error}</Notice></div>
  if (!data) return <div className="sa" dir="rtl"><div className="sa-skeleton" aria-busy="true" /></div>
  const current = form || data.config
  const set = (patch: Partial<Config>) => setForm({ ...current, ...patch })
  const preset = current.mode === 'balanced' || current.mode === 'aggressive' ? data.presets[current.mode] : null
  const view = preset ? { ...current, ...preset } : current
  const report = data.report
  const done = (text: string, ok = true) => { setNotice({ tone: ok ? 'ok' : 'error', text }); if (ok) void reload() }

  async function action(op: string, payload: Record<string, unknown> = {}, ok: (data: any) => string = () => 'انجام شد') {
    setBusy(op); setNotice(null)
    const result = await send<any>('/api/admin/optimization', 'POST', { op, ...payload })
    setBusy('')
    if (!result.ok) { done(result.error, false); return null }
    done(ok(result.data))
    return result.data
  }
  async function save(event: FormEvent) {
    event.preventDefault()
    const saved = await action('config', { config: current }, () => 'تنظیمات ذخیره شد و کش خالی شد.')
    if (saved) setForm(null)
  }
  async function runProbe() {
    setProbe(null)
    const result = await action('probe', { path: probePath }, () => 'آزمایش انجام شد.')
    if (result) setProbe(result)
  }

  return <div className="sa op" dir="rtl">
    <header className="sa-head"><div><h1>بهینه‌سازی و کش صفحه <span className={`op-state${data.config.mode !== 'off' ? ' is-on' : ''}`}>{data.config.mode === 'off' ? 'خاموش' : 'فعال'}</span></h1>
      <p className="sa-hint">مهمان‌ها (بدون ورود و بدون سبد خرید) صفحه‌های عمومی را از نسخهٔ ذخیره‌شده می‌گیرند؛ کاربران واردشده همیشه صفحهٔ زنده و شخصی می‌بینند. با تغییر محتوا یا تنظیمات، کش خودکار خالی می‌شود.</p></div>
      <div className="sa-head-actions">
        <button type="button" className="btn btn-ghost" disabled={!!busy} onClick={() => void action('warm', {}, (d) => `${fa(d.pages)} صفحه در ${fa(Math.round(d.ms / 100) / 10)} ثانیه گرم شد.`)}>{busy === 'warm' ? 'در حال گرم‌کردن…' : 'گرم‌کردن صفحه‌ها'}</button>
        <button type="button" className="btn btn-primary" disabled={!!busy} onClick={() => { if (window.confirm('همهٔ صفحه‌های ذخیره‌شده پاک شود؟ بازدیدهای بعدی دوباره ساخته‌شان می‌کند.')) void action('purge', {}, (d) => `${fa(d.removed)} صفحه پاک شد.`) }}>پاک‌کردن کل کش</button>
      </div></header>

    {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}

    <div className="sa-kpis">
      <div className="sa-kpi"><small>نرخ سرو از کش</small><b className="num">{fa(report.hitRate)}٪</b><span className="sa-sub">{fa(report.hits + report.stale)} از {fa(report.hits + report.stale + report.misses)} درخواست</span></div>
      <div className="sa-kpi"><small>صفحهٔ ذخیره‌شده</small><b className="num">{fa(report.entries)}</b><span className="sa-sub">{mb(report.bytes)} از {fa(view.maxMemoryMb)} مگابایت</span></div>
      <div className="sa-kpi"><small>ساخت یک صفحه (میانه / ۹۵٪)</small><b className="num">{fa(report.fillP50)} / {fa(report.fillP95)} <small>ms</small></b><span className="sa-sub">{fa(report.fills)} ساخت، {fa(report.fillErrors)} خطا</span></div>
      <div className={`sa-kpi${report.errorServes ? ' is-warn' : ''}`}><small>نجات‌یافته با نسخهٔ قدیمی</small><b className="num">{fa(report.errorServes)}</b><span className="sa-sub">بار که برنامه خطا داد و صفحه در دسترس ماند</span></div>
    </div>

    <form className="sa-card sa-form" onSubmit={(e) => void save(e)}>
      <header className="sa-card-head"><h2>حالت کش</h2></header>
      <div className="op-modes" role="radiogroup" aria-label="حالت کش">
        {MODES.map((mode) => <label key={mode.id} className={`op-mode${current.mode === mode.id ? ' is-on' : ''}`}>
          <input type="radio" name="mode" checked={current.mode === mode.id} onChange={() => set({ mode: mode.id })} /><b>{mode.title}</b><small>{mode.text}</small>
        </label>)}
      </div>

      {current.mode !== 'off' && <>
        <div className="sa-cols">
          <label className="sa-field"><span>مدت تازه‌بودن (ثانیه)</span><input className="input" type="number" min={1} value={view.ttl} disabled={!!preset} onChange={(e) => set({ ttl: Number(e.target.value) })} /><small className="sa-sub">{seconds(view.ttl)} بدون پرسیدن از برنامه</small></label>
          <label className="sa-field"><span>نمایش نسخهٔ قدیمی هنگام تازه‌سازی (ثانیه)</span><input className="input" type="number" min={0} value={view.staleWhileRevalidate} disabled={!!preset} onChange={(e) => set({ staleWhileRevalidate: Number(e.target.value) })} /><small className="sa-sub">پس از تازه‌بودن، صفحه فوری داده می‌شود و پشت صحنه نو می‌شود.</small></label>
          <label className="sa-field"><span>نگه‌داشتن برای زمان خطا (ثانیه)</span><input className="input" type="number" min={0} value={view.staleIfError} disabled={!!preset} onChange={(e) => set({ staleIfError: Number(e.target.value) })} /><small className="sa-sub">اگر برنامه یا پایگاه داده از کار بیفتد، آخرین نسخهٔ سالم سرو می‌شود.</small></label>
        </div>

        <div className="sa-cols">
          <label className="sa-field"><span>مسیرهایی که کش می‌شوند</span><textarea className="textarea" dir="ltr" rows={6} value={lines(current.include)} onChange={(e) => set({ include: parseLines(e.target.value) })} /><small className="sa-sub">هر مسیر و زیرمسیرهایش. «/» فقط صفحهٔ اصلی است.</small></label>
          <label className="sa-field"><span>مسیرهای مستثنا (هرگز کش نمی‌شوند)</span><textarea className="textarea" dir="ltr" rows={6} value={lines(current.exclude)} onChange={(e) => set({ exclude: parseLines(e.target.value) })} /><small className="sa-sub">بر فهرست بالا مقدم است. ورود، پرداخت، پنل‌ها و API همیشه مستثنا بمانند.</small></label>
        </div>

        <div className="sa-field"><span>زمان جداگانه برای بعضی مسیرها</span>
          <div className="op-overrides">
            {current.overrides.map((row, index) => <div key={index} className="op-override">
              <input className="input" dir="ltr" value={row.prefix} onChange={(e) => set({ overrides: current.overrides.map((item, i) => (i === index ? { ...item, prefix: e.target.value } : item)) })} aria-label="مسیر" />
              <input className="input" type="number" min={1} value={row.ttl} onChange={(e) => set({ overrides: current.overrides.map((item, i) => (i === index ? { ...item, ttl: Number(e.target.value) } : item)) })} aria-label="ثانیه" />
              <button type="button" className="sl-x" aria-label="حذف" onClick={() => set({ overrides: current.overrides.filter((_, i) => i !== index) })}>✕</button>
            </div>)}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => set({ overrides: [...current.overrides, { prefix: '/blog', ttl: 120 }] })}>+ افزودن</button>
          </div>
          <small className="sa-sub">مثلاً صفحهٔ اصلی ۳۰ ثانیه و مقاله‌ها ۱۰ دقیقه.</small>
        </div>

        <div className="sa-cols">
          <label className="sa-field"><span>پارامترهای نشانی که بخشی از صفحه‌اند</span><input className="input" dir="ltr" value={current.keepParams.join(', ')} onChange={(e) => set({ keepParams: parseLines(e.target.value) })} /><small className="sa-sub">مثل page و sort. نشانی با پارامتر دیگر کش نمی‌شود؛ utm و fbclid نادیده گرفته می‌شوند.</small></label>
          <label className="sa-field"><span>سقف حافظه در هر سرور (مگابایت)</span><input className="input" type="number" min={16} max={4096} value={current.maxMemoryMb} onChange={(e) => set({ maxMemoryMb: Number(e.target.value) })} /><small className="sa-sub">صفحه‌ها فشرده ذخیره می‌شوند؛ کم‌بازدیدترین‌ها اول حذف می‌شوند.</small></label>
        </div>

        <div className="op-toggles">
          <label className="sa-check"><input type="checkbox" checked={current.warm} onChange={(e) => set({ warm: e.target.checked })} /> <span>صفحه‌های ورودی بخش‌ها هر چند دقیقه یک‌بار از قبل ساخته شوند</span></label>
          {current.warm && <label className="op-inline">هر <input className="input" type="number" min={1} max={1440} value={current.warmIntervalMinutes} onChange={(e) => set({ warmIntervalMinutes: Number(e.target.value) })} aria-label="دقیقه" /> دقیقه</label>}
          <label className="sa-check"><input type="checkbox" checked={current.edgeHeaders} onChange={(e) => set({ edgeHeaders: e.target.checked })} /> <span>سربرگ‌های CDN (Cloudflare یا nginx جلوی سایت هم صفحهٔ مهمان را کش کند)</span></label>
          <label className="sa-check"><input type="checkbox" checked={current.debugHeaders} onChange={(e) => set({ debugHeaders: e.target.checked })} /> <span>سربرگ X-Cache (HIT / MISS / STALE) در پاسخ‌ها برای عیب‌یابی</span></label>
        </div>
      </>}
      <div className="sa-row-actions"><button type="submit" className="btn btn-primary" disabled={!!busy}>{busy === 'config' ? '…' : 'ذخیرهٔ تنظیمات'}</button>{form && <button type="button" className="btn btn-ghost" onClick={() => setForm(null)}>انصراف</button>}</div>
    </form>

    <div className="op-grid">
      <section className="sa-card sa-form">
        <header className="sa-card-head"><h2>آزمایش یک صفحه</h2></header>
        <p className="sa-hint">صفحه را دو بار مثل یک مهمان می‌خواند؛ بار اول باید MISS و بار دوم HIT باشد.</p>
        <div className="op-probe"><input className="input" dir="ltr" value={probePath} onChange={(e) => setProbePath(e.target.value)} aria-label="مسیر صفحه" /><button type="button" className="btn btn-primary btn-sm" disabled={!!busy} onClick={() => void runProbe()}>{busy === 'probe' ? '…' : 'آزمایش'}</button></div>
        {probe && <table className="data sa-table"><thead><tr><th>درخواست</th><th>وضعیت</th><th>کش</th><th>زمان</th><th>حجم</th></tr></thead><tbody>
          {([['اول', probe.first], ['دوم', probe.second]] as const).map(([label, row]) => <tr key={label}><td>{label}</td><td className="num">{row.status}</td><td><span className={`op-x op-x-${row.cache.toLowerCase()}`} dir="ltr">{row.cache}</span></td><td className="num">{fa(row.ms)} ms</td><td className="num">{fa(Math.round(row.bytes / 1024))} KB</td></tr>)}
        </tbody></table>}
        <hr className="op-hr" />
        <div className="op-probe"><input className="input" dir="ltr" value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="/blog" aria-label="مسیر برای پاک‌کردن" /><button type="button" className="btn btn-ghost btn-sm" disabled={!prefix.startsWith('/') || !!busy} onClick={() => void action('purge', { prefix }, (d) => `${fa(d.removed)} صفحه از ${prefix} پاک شد.`)}>پاک‌کردن این مسیر</button></div>
        <div className="op-facts">
          {report.lastPurge && <span>آخرین پاک‌سازی: {faDate(new Date(report.lastPurge.at), true)} ({report.lastPurge.reason})</span>}
          {report.lastWarm && <span>آخرین گرم‌کردن: {faDate(new Date(report.lastWarm.at), true)} — {fa(report.lastWarm.pages)} صفحه</span>}
          <span>{data.redis ? 'Redis فعال است؛ پاک‌سازی بین همهٔ سرورها پخش می‌شود.' : 'Redis تنظیم نشده؛ هر سرور کش مستقل دارد و پاک‌سازی فقط روی همین سرور اثر می‌کند.'}</span>
          <button type="button" className="sa-link" onClick={() => void action('reset', {}, () => 'شمارنده‌ها صفر شد.')}>صفر کردن شمارنده‌ها</button>
        </div>
      </section>

      <section className="sa-card sa-table-wrap">
        <header className="sa-card-head"><h2>پربازدیدترین صفحه‌های کش‌شده</h2></header>
        <table className="data sa-table"><thead><tr><th>مسیر</th><th>بازدید</th><th>حجم</th><th>سن</th><th>ساخت</th></tr></thead><tbody>
          {report.top.map((row) => <tr key={row.path}><td dir="ltr" className="op-path">{row.path}{row.status === 404 && <small> (۴۰۴)</small>}</td><td className="num">{fa(row.hits)}</td><td className="num">{fa(row.kb)} KB</td><td className="num">{seconds(row.ageSeconds)}</td><td className="num">{fa(row.fillMs)} ms</td></tr>)}
          {!report.top.length && <tr><td colSpan={5} className="sa-empty">هنوز صفحه‌ای ذخیره نشده است.</td></tr>}
        </tbody></table>
        {Object.keys(report.bypass).length > 0 && <div className="op-bypass"><b>درخواست‌هایی که کش نشدند</b><ul>{Object.entries(report.bypass).sort((a, b) => b[1] - a[1]).map(([reason, count]) => <li key={reason}><span>{REASONS[reason] || reason}</span><b className="num">{fa(count)}</b></li>)}</ul></div>}
      </section>
    </div>
  </div>
}
