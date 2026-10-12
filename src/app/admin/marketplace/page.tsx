'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from '@/components/AppLink'
import { Notice, fa, faDate } from '../store/shared'

type Tone = { tone: 'ok' | 'error'; text: string } | null
type Overview = { sellers: number; pendingSellers: number; pendingProducts: number; payoutsCount: number; payoutsTotal: number; gmv30: number; commission30: number }
type Seller = {
  id: number; slug: string; shopName: string; logo: string; city: string; status: string; statusNote: string; legalName: string; kind: string; nationalId: string; phone: string; email: string
  iban: string; ibanOwner: string; address: string; about: string; commissionPercent: number | null; balance: number; products: number; salesCount: number; createdAt: string
  rating: { average: number; count: number }; performance: { label: string; tone: string }
}
type Pending = { id: number; name: string; slug: string; image: string; price: number; stock: number; category: string; seller: string; sellerSlug: string; updatedAt: string }
type Payout = { id: number; sellerId: number; seller: string; amount: number; status: string; iban: string; ibanOwner: string; reference: string; note: string; createdAt: string; processedAt: string | null }
type Settings = { signupOpen: boolean; autoApproveSellers: boolean; autoApproveProducts: boolean; sellerShipsDirectly: boolean; defaultCommission: number; categoryCommission: Record<string, number>; holdDays: number; minPayoutToman: number; terms: string }

const toman = (value: number) => `${Math.round(value).toLocaleString('fa-IR')} تومان`
const STATUS: Record<string, [string, string]> = { PENDING: ['در انتظار بررسی', 'is-warn'], ACTIVE: ['فعال', 'is-ok'], SUSPENDED: ['تعلیق', 'is-bad'], REJECTED: ['ردشده', 'is-bad'] }
const PAYOUT: Record<string, [string, string]> = { REQUESTED: ['منتظر واریز', 'is-warn'], PAID: ['واریز شد', 'is-ok'], REJECTED: ['رد شد', 'is-bad'] }

async function post(body: Record<string, unknown>, method: 'POST' | 'PUT' = 'POST') {
  const response = await fetch('/api/admin/marketplace', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null)
  const data = await response?.json().catch(() => null)
  return response?.ok ? { ok: true as const, data } : { ok: false as const, error: String(data?.error || 'انجام نشد') }
}

function useView<T>(url: string) {
  const [data, setData] = useState<T | null>(null)
  const reload = useCallback(async () => { const r = await fetch(url, { cache: 'no-store' }).catch(() => null); if (r?.ok) setData(await r.json()) }, [url])
  useEffect(() => { void reload() }, [reload])
  return { data, reload }
}

function SellerRow({ row, onNotice, onChanged }: { row: Seller; onNotice: (tone: Tone) => void; onChanged: () => void }) {
  const [open, setOpen] = useState(false)
  const [commission, setCommission] = useState(row.commissionPercent == null ? '' : String(row.commissionPercent))
  const [adjust, setAdjust] = useState({ amount: '', note: '' })
  const act = async (action: string, extra: Record<string, unknown> = {}) => {
    const note = action === 'reject' || action === 'suspend' ? window.prompt(action === 'reject' ? 'دلیل رد (برای فروشنده نمایش داده می‌شود):' : 'دلیل تعلیق:') : ''
    if (note === null) return
    const result = await post({ op: 'seller', id: row.id, action, note, ...extra })
    onNotice(result.ok ? { tone: 'ok', text: `«${row.shopName}» به‌روز شد` } : { tone: 'error', text: result.error })
    onChanged()
  }
  return <>
    <tr>
      <td><div className="sa-prod">{row.logo ? <img src={row.logo} alt="" width={40} height={40} /> : <span className="sa-prod-ph" />}<div><button type="button" className="sa-link" onClick={() => setOpen(!open)} aria-expanded={open}>{row.shopName}</button><small className="sa-sub">{row.legalName} · {row.city || '—'}</small></div></div></td>
      <td><span className={`sa-state ${(STATUS[row.status] || ['', ''])[1]}`}>{(STATUS[row.status] || [row.status])[0]}</span></td>
      <td className="num">{fa(row.products)}</td>
      <td className="num">{fa(row.salesCount)}</td>
      <td>{row.rating.count ? `${row.rating.average.toLocaleString('fa-IR')} از ۵ (${fa(row.rating.count)})` : '—'}</td>
      <td className="num">{toman(row.balance)}</td>
      <td><div className="sa-row-actions">
        {row.status === 'PENDING' && <><button type="button" className="sa-link" onClick={() => void act('approve')}>تأیید</button><button type="button" className="sa-link is-danger" onClick={() => void act('reject')}>رد</button></>}
        {row.status === 'ACTIVE' && <button type="button" className="sa-link is-danger" onClick={() => void act('suspend')}>تعلیق</button>}
        {(row.status === 'SUSPENDED' || row.status === 'REJECTED') && <button type="button" className="sa-link" onClick={() => void act('reactivate')}>فعال‌سازی</button>}
        {row.status === 'ACTIVE' && <a className="sa-link" href={`/shop/${row.slug}`} target="_blank" rel="noreferrer">فروشگاه</a>}
      </div></td>
    </tr>
    {open && <tr className="mk-admin-detail"><td colSpan={7}>
      <div className="sa-cols">
        <dl className="mk-dl">
          <div><dt>نوع</dt><dd>{row.kind === 'COMPANY' ? 'حقوقی' : 'حقیقی'}</dd></div>
          <div><dt>{row.kind === 'COMPANY' ? 'شناسهٔ ملی' : 'کد ملی'}</dt><dd dir="ltr">{row.nationalId || '—'}</dd></div>
          <div><dt>تماس</dt><dd dir="ltr">{row.phone} {row.email}</dd></div>
          <div><dt>شبا</dt><dd dir="ltr">{row.iban || '—'} {row.ibanOwner && <small>({row.ibanOwner})</small>}</dd></div>
          <div><dt>نشانی</dt><dd>{row.address || '—'}</dd></div>
          <div><dt>عضویت</dt><dd>{faDate(row.createdAt)}</dd></div>
          {row.statusNote && <div><dt>یادداشت وضعیت</dt><dd>{row.statusNote}</dd></div>}
          {row.about && <div><dt>معرفی</dt><dd>{row.about}</dd></div>}
        </dl>
        <div className="sa-stack">
          <div className="sa-field"><span>کارمزد اختصاصی (٪) — خالی = طبق دسته/پیش‌فرض</span><div className="sa-row"><input className="input" dir="ltr" inputMode="decimal" value={commission} onChange={(e) => setCommission(e.target.value)} style={{ maxWidth: 120 }} /><button type="button" className="btn btn-ghost btn-sm" onClick={() => void act('commission', { commissionPercent: commission })}>ثبت کارمزد</button></div></div>
          <div className="sa-field"><span>اصلاح حساب (مثبت = پاداش، منفی = جریمه، تومان)</span><div className="sa-row"><input className="input" dir="ltr" value={adjust.amount} onChange={(e) => setAdjust({ ...adjust, amount: e.target.value })} placeholder="-50000" style={{ maxWidth: 140 }} /><input className="input" value={adjust.note} onChange={(e) => setAdjust({ ...adjust, note: e.target.value })} placeholder="علت" /><button type="button" className="btn btn-ghost btn-sm" onClick={async () => { const result = await post({ op: 'adjust', sellerId: row.id, ...adjust }); onNotice(result.ok ? { tone: 'ok', text: 'حساب فروشنده اصلاح شد' } : { tone: 'error', text: result.error }); if (result.ok) { setAdjust({ amount: '', note: '' }); onChanged() } }}>ثبت</button></div></div>
        </div>
      </div>
    </td></tr>}
  </>
}

function Sellers({ onNotice }: { onNotice: (tone: Tone) => void }) {
  const [status, setStatus] = useState('')
  useEffect(() => { setStatus(new URLSearchParams(window.location.search).get('status') || '') }, [])
  const [q, setQ] = useState('')
  const { data, reload } = useView<{ counts: Record<string, number>; rows: Seller[] }>(`/api/admin/marketplace?view=sellers&status=${status}&q=${encodeURIComponent(q)}`)
  return <section className="sa-card sa-table-wrap">
    <header className="sa-card-head">
      <nav className="sa-subtabs" aria-label="وضعیت فروشنده">{[['', 'همه'], ['PENDING', 'در انتظار'], ['ACTIVE', 'فعال'], ['SUSPENDED', 'تعلیق'], ['REJECTED', 'ردشده']].map(([value, label]) => <button key={value} type="button" className={status === value ? 'is-active' : ''} aria-pressed={status === value} onClick={() => setStatus(value)}>{label}{value && data?.counts[value] ? ` (${fa(data.counts[value])})` : ''}</button>)}</nav>
      <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="نام فروشگاه، موبایل…" aria-label="جست‌وجو" />
    </header>
    {!data ? <div className="sa-skeleton" /> : <table className="data sa-table" style={{ minWidth: 860 }}><thead><tr><th>فروشگاه</th><th>وضعیت</th><th>محصول</th><th>فروش</th><th>امتیاز</th><th>مانده حساب</th><th /></tr></thead><tbody>
      {data.rows.map((row) => <SellerRow key={row.id} row={row} onNotice={onNotice} onChanged={() => void reload()} />)}
      {!data.rows.length && <tr><td colSpan={7} className="sa-empty">فروشنده‌ای نیست.</td></tr>}
    </tbody></table>}
  </section>
}

function Products({ onNotice }: { onNotice: (tone: Tone) => void }) {
  const { data, reload } = useView<{ rows: Pending[] }>('/api/admin/marketplace?view=products')
  const act = async (row: Pending, action: string) => {
    const note = action === 'reject' ? window.prompt('دلیل رد (برای فروشنده نمایش داده می‌شود):') : ''
    if (note === null) return
    const result = await post({ op: 'product', id: row.id, action, note })
    onNotice(result.ok ? { tone: 'ok', text: `«${row.name}» ${action === 'approve' ? 'تأیید و منتشر شد' : 'رد شد'}` } : { tone: 'error', text: result.error })
    void reload()
  }
  return <section className="sa-card sa-table-wrap">
    <header className="sa-card-head"><h2>محصولات در انتظار تأیید</h2></header>
    {!data ? <div className="sa-skeleton" /> : <table className="data sa-table" style={{ minWidth: 760 }}><thead><tr><th>محصول</th><th>فروشنده</th><th>قیمت</th><th>موجودی</th><th>ارسال</th><th /></tr></thead><tbody>
      {data.rows.map((row) => <tr key={row.id}>
        <td><div className="sa-prod">{row.image ? <img src={row.image} alt="" width={40} height={40} /> : <span className="sa-prod-ph" />}<div><Link className="sa-link" href={`/admin/store/products/${row.id}`}>{row.name}</Link><small className="sa-sub">{row.category || 'بدون دسته'}</small></div></div></td>
        <td>{row.seller}</td><td className="num">{toman(row.price)}</td><td className="num">{row.stock < 0 ? 'نامحدود' : fa(row.stock)}</td><td>{faDate(row.updatedAt)}</td>
        <td><div className="sa-row-actions"><button type="button" className="sa-link" onClick={() => void act(row, 'approve')}>تأیید و انتشار</button><button type="button" className="sa-link is-danger" onClick={() => void act(row, 'reject')}>رد</button></div></td>
      </tr>)}
      {!data.rows.length && <tr><td colSpan={6} className="sa-empty">محصولی در انتظار بررسی نیست.</td></tr>}
    </tbody></table>}
  </section>
}

function Payouts({ onNotice }: { onNotice: (tone: Tone) => void }) {
  const [status, setStatus] = useState('REQUESTED')
  const { data, reload } = useView<{ rows: Payout[] }>(`/api/admin/marketplace?view=payouts&status=${status}`)
  const act = async (row: Payout, action: string) => {
    const reference = action === 'paid' ? window.prompt(`شمارهٔ پیگیری واریز ${toman(row.amount)} به ${row.iban}:`) : ''
    if (reference === null) return
    const note = action === 'reject' ? window.prompt('دلیل رد:') : ''
    if (note === null) return
    const result = await post({ op: 'payout', id: row.id, action, reference, note })
    onNotice(result.ok ? { tone: 'ok', text: action === 'paid' ? 'واریز ثبت شد و به فروشنده اطلاع داده شد' : 'درخواست رد شد و مبلغ به موجودی فروشنده برگشت' } : { tone: 'error', text: result.error })
    void reload()
  }
  return <section className="sa-card sa-table-wrap">
    <header className="sa-card-head"><nav className="sa-subtabs" aria-label="وضعیت">{[['REQUESTED', 'منتظر واریز'], ['PAID', 'واریزشده'], ['REJECTED', 'ردشده'], ['all', 'همه']].map(([value, label]) => <button key={value} type="button" className={status === value ? 'is-active' : ''} aria-pressed={status === value} onClick={() => setStatus(value)}>{label}</button>)}</nav></header>
    {!data ? <div className="sa-skeleton" /> : <table className="data sa-table" style={{ minWidth: 760 }}><thead><tr><th>فروشنده</th><th>مبلغ</th><th>شبا</th><th>درخواست</th><th>وضعیت</th><th /></tr></thead><tbody>
      {data.rows.map((row) => <tr key={row.id}>
        <td>{row.seller}</td><td className="num">{toman(row.amount)}</td><td dir="ltr">{row.iban}<small className="sa-sub">{row.ibanOwner}</small></td><td>{faDate(row.createdAt)}</td>
        <td><span className={`sa-state ${(PAYOUT[row.status] || ['', ''])[1]}`}>{(PAYOUT[row.status] || [row.status])[0]}</span>{row.reference && <small className="sa-sub" dir="ltr">{row.reference}</small>}</td>
        <td>{row.status === 'REQUESTED' && <div className="sa-row-actions"><button type="button" className="sa-link" onClick={() => void act(row, 'paid')}>ثبت واریز</button><button type="button" className="sa-link is-danger" onClick={() => void act(row, 'reject')}>رد</button></div>}</td>
      </tr>)}
      {!data.rows.length && <tr><td colSpan={6} className="sa-empty">درخواستی نیست.</td></tr>}
    </tbody></table>}
  </section>
}

function SettingsTab({ onNotice }: { onNotice: (tone: Tone) => void }) {
  const { data } = useView<{ settings: Settings; categories: { id: number; name: string; parentId: number | null }[] }>('/api/admin/marketplace?view=settings')
  const [form, setForm] = useState<Settings | null>(null)
  useEffect(() => { if (data) setForm(data.settings) }, [data])
  if (!form || !data) return <div className="sa-skeleton" />
  const set = (patch: Partial<Settings>) => setForm({ ...form, ...patch })
  return <form className="sa-card sa-form" onSubmit={async (event) => { event.preventDefault(); const result = await post({ settings: form }, 'PUT'); onNotice(result.ok ? { tone: 'ok', text: 'تنظیمات ذخیره شد' } : { tone: 'error', text: result.error }) }}>
    <header className="sa-card-head"><h2>قوانین بازار</h2></header>
    <label className="sa-check"><input type="checkbox" checked={form.signupOpen} onChange={(e) => set({ signupOpen: e.target.checked })} /> ثبت‌نام فروشندهٔ تازه باز است</label>
    <label className="sa-check"><input type="checkbox" checked={form.autoApproveSellers} onChange={(e) => set({ autoApproveSellers: e.target.checked })} /> فروشنده‌ها بدون بررسی فعال شوند</label>
    <label className="sa-check"><input type="checkbox" checked={form.autoApproveProducts} onChange={(e) => set({ autoApproveProducts: e.target.checked })} /> محصولات فروشنده‌ها بدون بررسی منتشر شوند</label>
    <label className="sa-check"><input type="checkbox" checked={form.sellerShipsDirectly} onChange={(e) => set({ sellerShipsDirectly: e.target.checked })} /> فروشنده خودش به مشتری ارسال می‌کند (نشانی و تلفن گیرنده به فروشنده نمایش داده می‌شود)</label>
    <div className="sa-cols">
      <label className="sa-field"><span>کارمزد پیش‌فرض (٪)</span><input className="input" dir="ltr" inputMode="decimal" value={form.defaultCommission} onChange={(e) => set({ defaultCommission: Number(e.target.value) || 0 })} /></label>
      <label className="sa-field"><span>دورهٔ نگه‌داشت پول (روز، مهلت مرجوعی)</span><input className="input" dir="ltr" inputMode="numeric" value={form.holdDays} onChange={(e) => set({ holdDays: Number(e.target.value) || 0 })} /></label>
      <label className="sa-field"><span>حداقل برداشت (تومان)</span><input className="input" dir="ltr" inputMode="numeric" value={form.minPayoutToman} onChange={(e) => set({ minPayoutToman: Number(e.target.value) || 0 })} /></label>
    </div>
    <div className="sa-field"><span>کارمزد هر دسته (٪) — خالی = پیش‌فرض؛ زیردسته‌ها از والد ارث می‌برند</span>
      <div className="mk-commissions">{data.categories.map((category) => <label key={category.id}><span>{category.parentId ? '— ' : ''}{category.name}</span><input className="input" dir="ltr" inputMode="decimal" value={form.categoryCommission[String(category.id)] ?? ''} onChange={(e) => { const next = { ...form.categoryCommission }; if (e.target.value === '') delete next[String(category.id)]; else next[String(category.id)] = Number(e.target.value) || 0; set({ categoryCommission: next }) }} placeholder={String(form.defaultCommission)} /></label>)}</div>
    </div>
    <label className="sa-field"><span>قوانین فروشندگی (به متقاضی نمایش داده می‌شود)</span><textarea className="textarea" rows={6} value={form.terms} onChange={(e) => set({ terms: e.target.value })} /></label>
    <button type="submit" className="btn btn-primary">ذخیرهٔ تنظیمات</button>
  </form>
}

export default function MarketplaceAdmin() {
  const [tab, setTab] = useState('sellers')
  useEffect(() => { const q = new URLSearchParams(window.location.search); setTab(q.get('tab') || 'sellers') }, [])
  const [notice, setNotice] = useState<Tone>(null)
  const { data } = useView<Overview>('/api/admin/marketplace')
  return <div className="sa" dir="rtl">
    <header className="sa-head"><div><h1>بازار فروشندگان</h1><p className="sa-hint">فروشندگان در فروشگاه شما غرفه دارند؛ مشتری به سایت پرداخت می‌کند و سهم فروشنده پس از کسر کارمزد و پایان مهلت مرجوعی قابل تسویه است.</p></div><div className="sa-head-actions"><a className="btn btn-ghost" href="/seller" target="_blank" rel="noreferrer">صفحهٔ «فروشنده شوید»</a></div></header>
    {data && <div className="sa-kpis">
      <div className="sa-kpi"><small>فروشندگان فعال</small><b className="num">{fa(data.sellers)}</b>{data.pendingSellers > 0 && <span className="sa-sub">{fa(data.pendingSellers)} در انتظار بررسی</span>}</div>
      <div className="sa-kpi"><small>فروش فروشندگان (۳۰ روز)</small><b>{toman(data.gmv30)}</b></div>
      <div className="sa-kpi"><small>درآمد کارمزد (۳۰ روز)</small><b>{toman(data.commission30)}</b></div>
      <div className="sa-kpi"><small>درخواست‌های تسویه</small><b>{toman(data.payoutsTotal)}</b><span className="sa-sub">{fa(data.payoutsCount)} درخواست</span></div>
    </div>}
    <nav className="sa-subtabs" aria-label="بخش‌ها">{([['sellers', 'فروشندگان'], ['products', `بررسی محصولات${data?.pendingProducts ? ` (${fa(data.pendingProducts)})` : ''}`], ['payouts', `تسویه${data?.payoutsCount ? ` (${fa(data.payoutsCount)})` : ''}`], ['settings', 'کارمزد و تنظیمات']] as const).map(([id, label]) => <button key={id} type="button" className={tab === id ? 'is-active' : ''} aria-pressed={tab === id} onClick={() => setTab(id)}>{label}</button>)}</nav>
    {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
    {tab === 'sellers' && <Sellers onNotice={setNotice} />}
    {tab === 'products' && <Products onNotice={setNotice} />}
    {tab === 'payouts' && <Payouts onNotice={setNotice} />}
    {tab === 'settings' && <SettingsTab onNotice={setNotice} />}
  </div>
}
