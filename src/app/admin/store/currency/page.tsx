'use client'

import { useState, type FormEvent } from 'react'
import Link from '@/components/AppLink'
import { Notice, StoreShell, fa, faDate, send, useJson } from '../shared'

type Provider = 'navasan' | 'brsapi' | 'custom' | 'manual'
type Config = {
  provider: Provider; apiKey: string; hasKey: boolean; customUrl: string; customMap: Record<string, string>; customUnit: 'IRT' | 'IRR'; crossRates: boolean
  intervalMinutes: number; maxJumpPercent: number; roundToman: number; currencies: string[]; syncGatewayRate: boolean
}
type Rate = { code: string; name: string; rate: number | null; source: string; locked: boolean; pendingRate: number | null; pendingAt: string | null; updatedAt: string | null; stale: boolean; change24h: number | null; products: number }
type Overview = {
  config: Config
  catalog: { code: string; name: string; symbol: string }[]
  lastRun: string | null
  rates: Rate[]
  log: { id: number; code: string; name: string; rate: number; source: string; products: number; at: string }[]
  products: { id: number; name: string; image: string; active: boolean; price: string; currency: string; fxCurrency: string; fxAmount: string; markupPercent: string; markupFixed: string; repricedAt: string | null }[]
  fxProducts: number
}

const PROVIDERS: { id: Provider; title: string; text: string }[] = [
  { id: 'navasan', title: 'نوسان (navasan.tech)', text: 'نرخ لحظه‌ای بازار آزاد تهران؛ کلید API رایگان/اشتراکی از سایت نوسان.' },
  { id: 'brsapi', title: 'BrsApi.ir', text: 'نرخ ارز و طلا و رمزارز؛ کلید API از پنل BrsApi.' },
  { id: 'custom', title: 'API سفارشی (JSON)', text: 'هر وب‌سرویسی که JSON برمی‌گرداند؛ مسیر مقدار هر ارز را مشخص کنید.' },
  { id: 'manual', title: 'دستی', text: 'نرخ‌ها را خودتان وارد می‌کنید؛ ارزهای دیگر می‌توانند از نرخ دلار و نرخ جهانی حساب شوند.' },
]
const SOURCE_LABEL: Record<string, string> = { navasan: 'نوسان', brsapi: 'BrsApi', custom: 'API سفارشی', cross: 'نرخ جهانی از دلار', MANUAL: 'دستی', manual: 'دستی' }

const toman = (value: number | null) => (value == null ? '—' : value >= 100 ? fa(Math.round(value)) : value.toLocaleString('fa-IR', { maximumFractionDigits: 2 }))
const ago = (iso: string | null) => {
  if (!iso) return 'هرگز'
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (minutes < 1) return 'همین حالا'
  if (minutes < 60) return `${fa(minutes)} دقیقه پیش`
  if (minutes < 1440) return `${fa(Math.round(minutes / 60))} ساعت پیش`
  return faDate(iso, true)
}

function RateRow({ row, onDone }: { row: Rate; onDone: (text: string, ok?: boolean) => void }) {
  const [edit, setEdit] = useState(false)
  const [value, setValue] = useState(row.rate ? String(Math.round(row.rate)) : '')
  const [lock, setLock] = useState(true)
  const [busy, setBusy] = useState(false)
  async function act(body: Record<string, unknown>, done: (data: any) => string) {
    setBusy(true)
    const result = await send<any>('/api/admin/fx', 'POST', { code: row.code, ...body })
    setBusy(false)
    if (!result.ok) { onDone(result.error, false); return }
    setEdit(false)
    onDone(done(result.data))
  }
  const change = row.change24h
  return <tr className={row.pendingRate ? 'fx-row is-pending' : 'fx-row'}>
    <td><div className="fx-cur"><span className="fx-code" dir="ltr">{row.code}</span><div><b>{row.name}</b><small>{row.products ? `${fa(row.products)} محصول` : 'بدون محصول'}</small></div></div></td>
    <td>
      {edit
        ? <form className="fx-edit" onSubmit={(e) => { e.preventDefault(); void act({ op: 'rate', rate: value, lock }, (data) => `نرخ ${row.name} ثبت شد؛ ${fa(data.repriced)} محصول به‌روز شد.`) }}>
          <input className="input" dir="ltr" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ''))} aria-label={`نرخ ${row.name} به تومان`} autoFocus />
          <label className="sa-check"><input type="checkbox" checked={lock} onChange={(e) => setLock(e.target.checked)} /> <span>قفل (به‌روزرسانی خودکار نشود)</span></label>
          <div className="fx-edit-actions"><button type="submit" className="btn btn-primary btn-sm" disabled={busy || !value}>ثبت</button><button type="button" className="btn btn-ghost btn-sm" onClick={() => setEdit(false)}>انصراف</button></div>
        </form>
        : <div className="fx-rate"><b className="num">{toman(row.rate)}</b><small>تومان</small></div>}
      {row.pendingRate && <div className="fx-pending" role="status">
        <span>نرخ تازه <b className="num">{toman(row.pendingRate)}</b> منتظر تأیید</span>
        <button type="button" className="btn btn-primary btn-sm" disabled={busy} aria-label={`تأیید نرخ تازهٔ ${row.name}`} onClick={() => void act({ op: 'approve' }, (data) => `نرخ تازه اعمال شد؛ ${fa(data.repriced)} محصول به‌روز شد.`)}>تأیید</button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={busy} aria-label={`رد نرخ تازهٔ ${row.name}`} onClick={() => void act({ op: 'reject' }, () => 'نرخ پیشنهادی رد شد.')}>رد</button>
      </div>}
    </td>
    <td>{change == null ? <span className="muted">—</span> : <span className={`fx-change ${change > 0 ? 'is-up' : change < 0 ? 'is-down' : ''}`}>{change > 0 ? '▲' : change < 0 ? '▼' : '•'} <span className="num">{Math.abs(change).toLocaleString('fa-IR')}٪</span></span>}</td>
    <td><span className="fx-source">{row.locked ? '🔒 ' : ''}{SOURCE_LABEL[row.source] || row.source || '—'}</span><small className={`fx-when${row.stale ? ' is-stale' : ''}`}>{row.stale && row.rate ? 'قدیمی · ' : ''}{ago(row.updatedAt)}</small></td>
    <td className="fx-actions">
      {!edit && <button type="button" className="btn btn-ghost btn-sm" aria-label={`ویرایش دستی نرخ ${row.name}`} onClick={() => setEdit(true)}>ویرایش دستی</button>}
      {row.rate != null && <button type="button" className="btn btn-ghost btn-sm" disabled={busy} aria-label={`${row.locked ? 'بازکردن قفل' : 'قفل'} نرخ ${row.name}`} onClick={() => void act({ op: 'lock', locked: !row.locked }, (data) => (data.locked ? `نرخ ${row.name} قفل شد.` : `نرخ ${row.name} دوباره خودکار به‌روز می‌شود.`))}>{row.locked ? 'بازکردن قفل' : 'قفل'}</button>}
    </td>
  </tr>
}

function SourceForm({ data, onSaved }: { data: Overview; onSaved: (text: string, ok?: boolean) => void }) {
  const [form, setForm] = useState<Config>(data.config)
  const [busy, setBusy] = useState(false)
  const [test, setTest] = useState<{ rates: Record<string, number>; crossed: string[] } | null>(null)
  const set = (patch: Partial<Config>) => setForm((current) => ({ ...current, ...patch }))
  const needsKey = form.provider === 'navasan' || form.provider === 'brsapi'

  async function save(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    const result = await send<{ config: Config }>('/api/admin/fx', 'POST', { op: 'config', config: form })
    setBusy(false)
    if (!result.ok) { onSaved(result.error, false); return }
    setForm(result.data.config)
    onSaved('تنظیمات منبع نرخ ذخیره شد.')
  }
  async function tryIt() {
    setBusy(true); setTest(null)
    const result = await send<{ rates: Record<string, number>; crossed: string[] }>('/api/admin/fx', 'POST', { op: 'test', config: form })
    setBusy(false)
    if (!result.ok) { onSaved(result.error, false); return }
    setTest(result.data)
  }

  return <form className="sa-card sa-form fx-source-form" onSubmit={(e) => void save(e)}>
    <header className="sa-card-head"><h2>منبع نرخ ارز</h2><small className="sa-sub">نرخ‌ها به تومان ذخیره می‌شوند</small></header>
    <div className="fx-providers" role="radiogroup" aria-label="منبع نرخ">
      {PROVIDERS.map((provider) => <label key={provider.id} className={`fx-provider${form.provider === provider.id ? ' is-on' : ''}`}>
        <input type="radio" name="provider" checked={form.provider === provider.id} onChange={() => set({ provider: provider.id })} />
        <b>{provider.title}</b><small>{provider.text}</small>
      </label>)}
    </div>
    {(needsKey || form.provider === 'custom') && <label className="sa-field"><span>کلید API {form.hasKey && <small>— ذخیره شده؛ برای تغییر کلید تازه را وارد کنید</small>}</span><input className="input" dir="ltr" value={form.apiKey} onChange={(e) => set({ apiKey: e.target.value })} placeholder={form.provider === 'custom' ? 'اختیاری؛ در نشانی با {key} جایگزین می‌شود' : 'API key'} autoComplete="off" /></label>}
    {form.provider === 'custom' && <>
      <label className="sa-field"><span>نشانی API (JSON)</span><input className="input" dir="ltr" value={form.customUrl} onChange={(e) => set({ customUrl: e.target.value })} placeholder="https://api.example.com/rates?token={key}" /></label>
      <label className="sa-field"><span>واحد نرخ‌ها در پاسخ</span><select className="select" value={form.customUnit} onChange={(e) => set({ customUnit: e.target.value as 'IRT' | 'IRR' })}><option value="IRT">تومان ایران (IRT)</option><option value="IRR">ریال ایران (IRR)</option></select></label>
      <div className="fx-map">
        <span className="sa-field-label">مسیر مقدار هر ارز در JSON (مثلاً <code dir="ltr">data.usd.sell</code> یا <code dir="ltr">items[0].price</code>)</span>
        {form.currencies.map((code) => <label key={code} className="fx-map-row"><span dir="ltr">{code}</span><input className="input" dir="ltr" value={form.customMap[code] || ''} onChange={(e) => set({ customMap: { ...form.customMap, [code]: e.target.value } })} placeholder={`${code.toLowerCase()}.value`} /></label>)}
      </div>
    </>}
    <fieldset className="fx-currencies"><legend>ارزهای فعال</legend>
      {data.catalog.map((row) => <label key={row.code} className={`fx-chip${form.currencies.includes(row.code) ? ' is-on' : ''}`}><input type="checkbox" checked={form.currencies.includes(row.code)} onChange={(e) => set({ currencies: e.target.checked ? [...form.currencies, row.code] : form.currencies.filter((code) => code !== row.code) })} /><span dir="ltr">{row.code}</span> {row.name}</label>)}
    </fieldset>
    <label className="sa-check"><input type="checkbox" checked={form.crossRates} onChange={(e) => set({ crossRates: e.target.checked })} /> <span>ارزهایی که منبع ندارد از نرخ دلار × نرخ جهانی (open.er-api.com) حساب شوند</span></label>
    <div className="sa-cols">
      <label className="sa-field"><span>هر چند دقیقه به‌روز شود</span><input className="input" type="number" min={5} max={1440} value={form.intervalMinutes} onChange={(e) => set({ intervalMinutes: Number(e.target.value) })} /></label>
      <label className="sa-field"><span>حداکثر جهش مجاز (٪)</span><input className="input" type="number" min={0} max={500} value={form.maxJumpPercent} onChange={(e) => set({ maxJumpPercent: Number(e.target.value) })} /><small className="sa-sub">تغییر بیشتر از این، تا تأیید شما اعمال نمی‌شود (۰ = بدون محدودیت)</small></label>
      <label className="sa-field"><span>گرد کردن قیمت‌ها به بالا (تومان)</span><select className="select" value={form.roundToman} onChange={(e) => set({ roundToman: Number(e.target.value) })}>{[1, 100, 500, 1000, 5000, 10000, 50000, 100000].map((step) => <option key={step} value={step}>{step === 1 ? 'بدون گرد کردن' : `${fa(step)} تومان`}</option>)}</select></label>
    </div>
    <label className="sa-check"><input type="checkbox" checked={form.syncGatewayRate} onChange={(e) => set({ syncGatewayRate: e.target.checked })} /> <span>نرخ دلار درگاه‌های پرداخت (تبدیل پلن‌ها و فاکتورهای دلاری) هم با همین نرخ یکی شود</span></label>
    {test && <div className="fx-test" role="status">
      <b>پاسخ منبع:</b>
      {Object.keys(test.rates).length ? <ul>{Object.entries(test.rates).map(([code, rate]) => <li key={code}><span dir="ltr">{code}</span> <b className="num">{toman(rate)}</b> تومان{test.crossed.includes(code) ? <small> (از نرخ جهانی)</small> : null}</li>)}</ul> : <span> هیچ نرخی برنگشت.</span>}
    </div>}
    <div className="fx-form-actions">
      <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? '…' : 'ذخیرهٔ تنظیمات'}</button>
      <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void tryIt()}>آزمایش منبع (بدون ذخیره)</button>
    </div>
  </form>
}

export default function CurrencyPage() {
  const { data, error, reload } = useJson<Overview>('/api/admin/fx')
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState('')
  const title = 'نرخ ارز و قیمت‌گذاری ارزی'
  if (error) return <StoreShell title={title}><Notice tone="error">{error}</Notice></StoreShell>
  if (!data) return <StoreShell title={title}><div className="sa-skeleton" aria-busy="true" /></StoreShell>
  const done = (text: string, ok = true) => { setNotice({ tone: ok ? 'ok' : 'error', text }); if (ok) void reload() }
  const pending = data.rates.filter((row) => row.pendingRate).length

  async function run(op: 'refresh' | 'reprice') {
    setBusy(op); setNotice(null)
    const result = await send<any>('/api/admin/fx', 'POST', { op })
    setBusy('')
    if (!result.ok) { done(result.error, false); return }
    if (op === 'reprice') { done(`${fa(result.data.count)} محصول با نرخ فعلی دوباره قیمت‌گذاری شد.`); return }
    const applied = Object.keys(result.data.applied).length
    const held = Object.keys(result.data.held).length
    done(`${fa(applied)} نرخ به‌روز شد${held ? `، ${fa(held)} نرخ به‌خاطر جهش زیاد منتظر تأیید است` : ''}؛ ${fa(result.data.repriced)} محصول قیمت تازه گرفت.`)
  }

  return <StoreShell title={title} actions={<>
    <button type="button" className="btn btn-ghost" disabled={!!busy} onClick={() => void run('reprice')}>{busy === 'reprice' ? '…' : 'محاسبهٔ دوبارهٔ قیمت‌ها'}</button>
    <button type="button" className="btn btn-primary" disabled={!!busy} onClick={() => void run('refresh')}>{busy === 'refresh' ? 'در حال دریافت…' : 'دریافت نرخ روز'}</button>
  </>}>
    <p className="sa-hint">برای کالاهایی که قیمتشان دلاری یا یورویی است (اکانت‌های پرمیوم، کالای وارداتی)، در صفحهٔ محصول «قیمت ارزی» را انتخاب کنید: قیمت ارزی + درصد سود + سود ثابت. قیمت تومانی با هر تغییر نرخ خودکار حساب و به‌روز می‌شود؛ سبدهای خرید هم همیشه قیمت روز را می‌بینند.</p>
    <div className="sa-kpis">
      <div className="sa-kpi"><small>منبع نرخ</small><b>{PROVIDERS.find((row) => row.id === data.config.provider)?.title || '—'}</b></div>
      <div className="sa-kpi"><small>آخرین دریافت</small><b>{ago(data.lastRun)}</b></div>
      <div className="sa-kpi"><small>محصولات با قیمت ارزی</small><b className="num">{fa(data.fxProducts)}</b></div>
      <div className={`sa-kpi${pending ? ' is-warn' : ''}`}><small>منتظر تأیید</small><b className="num">{fa(pending)}</b></div>
    </div>
    {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
    <section className="sa-card sa-table-wrap">
      <header className="sa-card-head"><h2>نرخ‌های امروز</h2><small className="sa-sub">تومان برای هر واحد</small></header>
      <table className="data sa-table fx-table"><thead><tr><th>ارز</th><th>نرخ</th><th>۲۴ ساعت</th><th>منبع</th><th><span className="sr-only">عملیات</span></th></tr></thead><tbody>
        {data.rates.map((row) => <RateRow key={`${row.code}:${row.rate}:${row.pendingRate}:${row.locked}`} row={row} onDone={done} />)}
      </tbody></table>
    </section>
    <div className="fx-grid">
      <SourceForm key={JSON.stringify(data.config)} data={data} onSaved={done} />
      <section className="sa-card sa-table-wrap">
        <header className="sa-card-head"><h2>تاریخچهٔ تغییر نرخ</h2></header>
        <ul className="fx-log">
          {data.log.map((row) => <li key={row.id}><span dir="ltr" className="fx-code is-small">{row.code}</span><b className="num">{toman(row.rate)}</b><small>{SOURCE_LABEL[row.source] || row.source}{row.products ? ` · ${fa(row.products)} محصول` : ''}</small><time dateTime={row.at}>{faDate(row.at, true)}</time></li>)}
          {!data.log.length && <li className="sa-empty">هنوز نرخی ثبت نشده است؛ «دریافت نرخ روز» را بزنید یا نرخ را دستی وارد کنید.</li>}
        </ul>
      </section>
    </div>
    <section className="sa-card sa-table-wrap">
      <header className="sa-card-head"><h2>محصولات با قیمت ارزی</h2><Link href="/admin/store/products" className="sa-link">همهٔ محصولات</Link></header>
      <table className="data sa-table"><thead><tr><th>محصول</th><th>قیمت ارزی</th><th>سود</th><th>قیمت فروش</th><th>آخرین به‌روزرسانی</th></tr></thead><tbody>
        {data.products.map((row) => <tr key={row.id}>
          <td><div className="sa-prod">{row.image ? <img src={row.image} alt="" width={40} height={40} /> : <span className="sa-prod-ph" />}<div><Link className="sa-link" href={`/admin/store/products/${row.id}`}>{row.name}</Link>{!row.active && <small className="muted"> (غیرفعال)</small>}</div></div></td>
          <td className="num" dir="ltr">{row.fxAmount} {row.fxCurrency}</td>
          <td>{Number(row.markupPercent) ? `${Number(row.markupPercent).toLocaleString('fa-IR')}٪` : '—'}{Number(row.markupFixed) ? ` + ${fa(Number(row.markupFixed))}` : ''}</td>
          <td className="num"><b>{fa(Number(row.price))}</b> {row.currency === 'IRR' ? 'ریال' : 'تومان'}</td>
          <td>{ago(row.repricedAt)}</td>
        </tr>)}
        {!data.products.length && <tr><td colSpan={5} className="sa-empty">هنوز محصولی قیمت ارزی ندارد. در ویرایش محصول، بخش «قیمت و تخفیف» حالت «قیمت ارزی» را انتخاب کنید.</td></tr>}
      </tbody></table>
    </section>
  </StoreShell>
}
