'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from '@/components/AppLink'

type Pkg = { id: number; name: string; description: string; days: number; impressions: number; clicks: number; price: string; priceLabel: string; placements: { key: string; name: string; width: number; height: number }[] }
type Creative = { id: number; kind: string; title: string; imageUrl: string; linkUrl: string; text: string; alt: string; cta: string }
type Campaign = { id: number; name: string; status: string; startsAt: string | null; endsAt: string | null; placements: string[]; impressions: number; clicks: number; ctr: number; maxImpressions: number; paid: string; rejectReason: string; creatives: Creative[]; series: { day: string; impressions: number; clicks: number }[] }
type Portal = { advertiser: { name: string; company: string; status: string } | null; campaigns: Campaign[]; packages: Pkg[]; balance: number; selfServe: boolean }

const fa = (value: number) => value.toLocaleString('fa-IR')
const date = (value: string | null) => (value ? new Date(value).toLocaleDateString('fa-IR', { year: 'numeric', month: 'short', day: 'numeric' }) : '—')
const STATUS: Record<string, [string, string]> = { DRAFT: ['پیش‌نویس', ''], PENDING: ['منتظر بررسی', 'is-warn'], ACTIVE: ['فعال', 'is-ok'], PAUSED: ['متوقف', 'is-info'], ENDED: ['پایان‌یافته', ''], REJECTED: ['ردشده', 'is-bad'] }
const newRequestId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().replace(/-/g, '') : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`)

async function call<T>(url: string, method: 'GET' | 'POST' | 'PATCH', body?: unknown): Promise<{ ok: true; data: T } | { ok: false; error: string; status: number; meta: Record<string, unknown> }> {
  const response = await fetch(url, { method, cache: 'no-store', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined }).catch(() => null)
  if (!response) return { ok: false, error: 'ارتباط با سرور برقرار نشد', status: 0, meta: {} }
  const data = await response.json().catch(() => null)
  return response.ok ? { ok: true, data: data as T } : { ok: false, error: String(data?.error || 'انجام نشد'), status: response.status, meta: data || {} }
}

export function PackageCards({ packages, action }: { packages: Pkg[]; action: (pkg: Pkg) => React.ReactNode }) {
  if (!packages.length) return <p className="pr-empty">فعلاً بستهٔ تبلیغاتی برای فروش تعریف نشده است.</p>
  return <div className="pr-packages">{packages.map((pkg) => <article key={pkg.id} className="pr-package">
    <h3>{pkg.name}</h3>
    <p className="pr-price">{pkg.priceLabel}</p>
    {pkg.description && <p className="pr-desc">{pkg.description}</p>}
    <ul>
      <li>مدت: <b>{fa(pkg.days)} روز</b></li>
      <li>نمایش: <b>{pkg.impressions ? `${fa(pkg.impressions)} بار` : 'نامحدود در دوره'}</b></li>
      {pkg.clicks > 0 && <li>سقف کلیک: <b>{fa(pkg.clicks)}</b></li>}
      <li>جایگاه‌ها: {pkg.placements.map((p) => `${p.name}${p.width && p.height ? ` (${fa(p.width)}×${fa(p.height)})` : ''}`).join('، ')}</li>
    </ul>
    {action(pkg)}
  </article>)}</div>
}

/** Public sales page: the packages, and where to buy one. */
export function AdvertisePage() {
  const [data, setData] = useState<{ selfServe: boolean; packages: Pkg[] } | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { void call<{ selfServe: boolean; packages: Pkg[] }>('/api/promo/packages', 'GET').then((r) => (r.ok ? setData(r.data) : setError(r.error))) }, [])
  return <main className="pr-page" dir="rtl">
    <header className="pr-hero"><h1>تبلیغ در سایت</h1><p>بنر خود را در جایگاه‌هایی که مخاطب شما در آن‌هاست نمایش دهید. آمار نمایش و کلیک را زنده ببینید و هر وقت خواستید کمپین را متوقف کنید.</p></header>
    {error && <p className="pr-error" role="alert">{error}</p>}
    {!data && !error && <div className="pr-skeleton" aria-busy="true" />}
    {data && <PackageCards packages={data.packages} action={(pkg) => data.selfServe
      ? <Link className="btn btn-primary" href={`/dashboard/ads?package=${pkg.id}`}>خرید این بسته</Link>
      : <span className="pr-desc">برای خرید با پشتیبانی تماس بگیرید.</span>} />}
    <p className="pr-note">پرداخت از کیف پول شما انجام می‌شود و بنر پس از بررسی تیم سایت فعال می‌شود. اگر تبلیغ تأیید نشود، مبلغ کامل به کیف پول شما برمی‌گردد.</p>
  </main>
}

function Spark({ series }: { series: Campaign['series'] }) {
  const max = Math.max(1, ...series.map((row) => row.impressions))
  const W = 160, H = 36
  const points = series.map((row, i) => `${((i / Math.max(1, series.length - 1)) * W).toFixed(1)},${(H - (row.impressions / max) * (H - 4) - 2).toFixed(1)}`).join(' ')
  return <svg className="pr-spark" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`نمایش ${fa(series.length)} روز اخیر`}><polyline points={points} fill="none" /></svg>
}

function BuyForm({ pkg, portal, onDone, onCancel }: { pkg: Pkg; portal: Portal; onDone: (message: string) => void; onCancel: () => void }) {
  const [requestId] = useState(newRequestId)
  const [form, setForm] = useState({ company: portal.advertiser?.company || '', title: '', linkUrl: '', imageUrl: '', alt: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<{ text: string; shortfall?: number } | null>(null)
  const set = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }))
  const short = Number(pkg.price) > portal.balance

  async function upload(file: File | undefined) {
    if (!file) return
    setBusy(true); setError(null)
    const body = new FormData(); body.append('file', file, file.name)
    const response = await fetch('/api/promo/media', { method: 'POST', body }).catch(() => null)
    const data = await response?.json().catch(() => null)
    setBusy(false)
    if (!response?.ok) { setError({ text: data?.error || 'بارگذاری تصویر انجام نشد' }); return }
    set('imageUrl', data.url)
  }
  async function buy() {
    setBusy(true); setError(null)
    const result = await call('/api/promo/buy', 'POST', { packageId: pkg.id, requestId, advertiser: { company: form.company }, creative: { kind: 'IMAGE', title: form.title, alt: form.alt || form.title, imageUrl: form.imageUrl, linkUrl: form.linkUrl } })
    setBusy(false)
    if (result.ok) { onDone('خرید انجام شد. کمپین شما پس از بررسی فعال می‌شود.'); return }
    setError({ text: result.error, shortfall: typeof result.meta.shortfall === 'number' ? result.meta.shortfall : undefined })
  }

  return <section className="dash-card pr-buy" aria-label={`خرید بستهٔ ${pkg.name}`}>
    <div className="dash-card-head"><div><h2>خرید «{pkg.name}»</h2><p>{pkg.priceLabel} · {fa(pkg.days)} روز · موجودی کیف پول شما {fa(portal.balance)} تومان</p></div></div>
    <div className="pr-fields">
      <label className="pr-field"><span>نام برند / شرکت</span><input className="input" value={form.company} onChange={(e) => set('company', e.target.value)} maxLength={100} /></label>
      <label className="pr-field"><span>عنوان تبلیغ</span><input className="input" value={form.title} onChange={(e) => set('title', e.target.value)} maxLength={120} /></label>
      <label className="pr-field"><span>نشانی مقصد (وقتی روی بنر کلیک شد)</span><input className="input" dir="ltr" value={form.linkUrl} onChange={(e) => set('linkUrl', e.target.value)} placeholder="https://example.com" /></label>
      <div className="pr-field"><span>تصویر بنر{pkg.placements[0]?.width ? ` (پیشنهادی ${fa(pkg.placements[0].width)}×${fa(pkg.placements[0].height)})` : ''}</span>
        {form.imageUrl && <img className="pr-preview" src={form.imageUrl} alt="پیش‌نمایش بنر" />}
        <label className="btn btn-ghost btn-sm">{form.imageUrl ? 'تعویض تصویر' : 'بارگذاری تصویر'}<input type="file" hidden accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = '' }} /></label>
      </div>
    </div>
    {error && <p className="pr-error" role="alert">{error.text}{error.shortfall ? <> — <Link href="/dashboard/wallet" className="sa-link">افزایش موجودی ({fa(error.shortfall)} تومان کم دارید)</Link></> : null}</p>}
    {short && !error && <p className="pr-note">موجودی کیف پول کافی نیست. <Link href="/dashboard/wallet" className="sa-link">شارژ کیف پول</Link></p>}
    <div className="pr-actions"><button type="button" className="btn btn-primary" disabled={busy || !form.imageUrl || !form.linkUrl || !form.title} onClick={() => void buy()}>{busy ? 'کمی صبر کنید…' : `پرداخت ${pkg.priceLabel}`}</button><button type="button" className="btn btn-ghost" onClick={onCancel}>انصراف</button></div>
  </section>
}

/** Advertiser area of the account dashboard. */
export default function AdvertiserPortal() {
  const [portal, setPortal] = useState<Portal | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [buying, setBuying] = useState<number | null>(() => {
    if (typeof window === 'undefined') return null
    const id = Number(new URLSearchParams(window.location.search).get('package'))
    return id > 0 ? id : null
  })
  const load = useCallback(async () => {
    const result = await call<Portal>('/api/promo/mine', 'GET')
    if (result.ok) setPortal(result.data); else setError(result.error)
  }, [])
  useEffect(() => { void load() }, [load])
  const pkg = useMemo(() => portal?.packages.find((p) => p.id === buying) || null, [portal, buying])

  async function act(campaignId: number, action: 'pause' | 'resume') {
    const result = await call('/api/promo/mine', 'PATCH', { campaignId, action })
    setNotice(result.ok ? (action === 'pause' ? 'کمپین متوقف شد.' : 'کمپین دوباره فعال شد.') : result.error)
    void load()
  }
  async function replaceImage(campaign: Campaign, file: File | undefined) {
    const creative = campaign.creatives[0]
    if (!file || !creative) return
    const body = new FormData(); body.append('file', file, file.name)
    const response = await fetch('/api/promo/media', { method: 'POST', body }).catch(() => null)
    const data = await response?.json().catch(() => null)
    if (!response?.ok) { setNotice(data?.error || 'بارگذاری تصویر انجام نشد'); return }
    const result = await call('/api/promo/mine', 'PATCH', { campaignId: campaign.id, action: 'creative', creative: { ...creative, imageUrl: data.url } })
    setNotice(result.ok ? 'بنر تازه ثبت شد و پس از بررسی نمایش داده می‌شود.' : result.error)
    void load()
  }

  if (error) return <div className="dash-card" role="alert">{error}</div>
  if (!portal) return <div className="dash-card" aria-busy="true">در حال بارگذاری…</div>
  return <div className="pr-portal" dir="rtl">
    <header className="pr-head"><div><h1>تبلیغات من</h1><p>کمپین‌ها و آمار نمایش و کلیک بنرهای شما</p></div><div className="pr-balance"><small>موجودی کیف پول</small><b className="num">{fa(portal.balance)} تومان</b></div></header>
    {notice && <p className="pr-note" role="status">{notice}</p>}
    {pkg && <BuyForm pkg={pkg} portal={portal} onCancel={() => setBuying(null)} onDone={(message) => { setBuying(null); setNotice(message); void load() }} />}

    <section className="dash-card">
      <div className="dash-card-head"><div><h2>کمپین‌ها</h2></div></div>
      {!portal.campaigns.length && <p className="pr-empty">هنوز کمپینی ندارید. از بخش «خرید بسته» یکی را انتخاب کنید.</p>}
      <ul className="pr-campaigns">{portal.campaigns.map((c) => {
        const [label, tone] = STATUS[c.status] || [c.status, '']
        return <li key={c.id} className="pr-campaign">
          <div className="pr-campaign-main">
            {c.creatives[0]?.imageUrl && <img className="pr-thumb" src={c.creatives[0].imageUrl} alt="" />}
            <div><b>{c.name}</b> <span className={`sa-state ${tone}`}>{label}</span>
              <small className="pr-desc">{date(c.startsAt)} تا {date(c.endsAt)} · پرداخت‌شده {c.paid}</small>
              {c.status === 'REJECTED' && c.rejectReason && <small className="pr-error">دلیل رد: {c.rejectReason}</small>}
            </div>
          </div>
          <dl className="pr-stats"><div><dt>نمایش</dt><dd className="num">{fa(c.impressions)}{c.maxImpressions ? <small> / {fa(c.maxImpressions)}</small> : null}</dd></div><div><dt>کلیک</dt><dd className="num">{fa(c.clicks)}</dd></div><div><dt>نرخ کلیک</dt><dd className="num">{c.ctr.toLocaleString('fa-IR')}٪</dd></div></dl>
          <Spark series={c.series} />
          <div className="pr-actions">
            {c.status === 'ACTIVE' && <button type="button" className="btn btn-ghost btn-sm" onClick={() => void act(c.id, 'pause')}>توقف</button>}
            {c.status === 'PAUSED' && <button type="button" className="btn btn-ghost btn-sm" onClick={() => void act(c.id, 'resume')}>ادامه</button>}
            {c.creatives[0]?.kind === 'IMAGE' && c.status !== 'ENDED' && c.status !== 'REJECTED' && <label className="btn btn-ghost btn-sm">تعویض بنر<input type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={(e) => { void replaceImage(c, e.target.files?.[0]); e.target.value = '' }} /></label>}
          </div>
        </li>
      })}</ul>
    </section>

    {portal.selfServe && <section className="dash-card">
      <div className="dash-card-head"><div><h2>خرید بستهٔ تبلیغاتی</h2><p>پرداخت از کیف پول؛ بنر پس از تأیید تیم سایت فعال می‌شود.</p></div></div>
      <PackageCards packages={portal.packages} action={(p) => <button type="button" className="btn btn-primary" onClick={() => { setBuying(p.id); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>انتخاب</button>} />
    </section>}
  </div>
}
