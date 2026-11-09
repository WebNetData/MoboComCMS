'use client'
import { useEffect, useState } from 'react'
import Link from '@/components/AppLink'
import Icon from '@/components/site/Icon'
import { formatMoney } from '@/shared/money'
import type { CampaignDraft, CampaignResult } from '@/modules/ai/domain/sales'
import styles from './page.module.css'

type Money = { currency: string; minor: string }[]
type Product = { id: number; name: string; slug: string; image: string }
type Report = {
  access: { crm: boolean; orders: boolean; customers: boolean }
  results: { days: number; attributionDays: number; baseline: { members: number; rate: number }; campaigns: CampaignResult[]; carts: { sent: number; customers: number; recovered: number; recoveredValue: Money } } | null
  opportunities: { categoryId: number; name: string; interested: number; reachable: number; ready: number; products: Product[] }[] | null
  incomplete: { count: number; value: Money; orders: { id: number; userId: number; customer: string; marketingOptIn: boolean; total: string; currency: string; createdAt: string; items: string[]; boughtSince: boolean }[] } | null
}
type Suggestions = { purchased: number; marketingOptIn: boolean; recommendationOptIn: boolean; items: (Product & { reason: string })[] }

const n = (v: number) => v.toLocaleString('fa-IR')
const pct = (v: number) => `${(Math.round(v * 1000) / 10).toLocaleString('fa-IR')}٪`
const money = (rows: Money) => rows.length ? rows.map(r => formatMoney(r.minor, r.currency, 'fa-IR')).join(' · ') : '—'
const ago = (iso: string) => { const h = Math.round((Date.now() - Date.parse(iso)) / 3_600_000); return h < 24 ? `${n(h)} ساعت پیش` : `${n(Math.round(h / 24))} روز پیش` }

export default function SmartSalesPage() {
  const [days, setDays] = useState('30'), [data, setData] = useState<Report | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(true)
  const [customer, setCustomer] = useState(''), [suggest, setSuggest] = useState<Suggestions | null>(null), [suggestError, setSuggestError] = useState('')
  const [drafts, setDrafts] = useState<Record<number, CampaignDraft | string>>({}), [offer, setOffer] = useState<Record<number, string>>({}), [busy, setBusy] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError('')
    fetch(`/api/admin/ai/sales?days=${days}`, { cache: 'no-store', signal: controller.signal })
      .then(async r => { const body = await r.json(); if (!r.ok) throw Error(body?.error || 'گزارش دریافت نشد'); setData(body) })
      .catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'گزارش دریافت نشد') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [days])

  async function lookup(id = customer) {
    setSuggest(null); setSuggestError(''); setCustomer(id)
    const r = await fetch(`/api/admin/ai/sales?customer=${encodeURIComponent(id)}`, { cache: 'no-store' }).catch(() => null), body = await r?.json().catch(() => null)
    if (!r?.ok) { setSuggestError(body?.error || 'پیشنهادی دریافت نشد'); return }
    setSuggest(body.suggestions)
  }
  async function draft(categoryId: number) {
    setBusy(categoryId)
    const r = await fetch('/api/admin/ai/sales', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'draft', categoryId, offer: offer[categoryId] || '' }) }).catch(() => null), body = await r?.json().catch(() => null)
    setDrafts(d => ({ ...d, [categoryId]: r?.ok ? body.draft : body?.error || 'متن ساخته نشد' })); setBusy(0)
  }

  const results = data?.results
  return <div className={styles.page} aria-busy={loading}>
    <header className={styles.hero}>
      <span className={styles.mark} aria-hidden="true"><Icon name="chart" size={26} /></span>
      <div><p className={styles.eyebrow}>هوش مصنوعی · فروش</p><h1>فروش و CRM هوشمند</h1><p>نتیجهٔ واقعی کمپین‌ها، فرصت کمپین برای علاقه‌مندان هر دسته، سفارش‌های نیمه‌تمام و پیشنهاد کالای مرتبط. این صفحه چیزی ارسال نمی‌کند؛ ارسال از «ارتباط با مشتری» و با رضایت و ترجیح خود کاربر انجام می‌شود.</p></div>
      <label className={styles.range}><span>بازهٔ گزارش</span><select className="input" value={days} onChange={e => setDays(e.target.value)}>{[7, 30, 90].map(d => <option key={d} value={d}>{n(d)} روز گذشته</option>)}</select></label>
    </header>
    {error && <div className="card" role="alert"><p>{error}</p></div>}
    {loading && !data && <div className={styles.skeleton} role="status" aria-label="در حال دریافت گزارش">{[0, 1, 2].map(i => <span key={i} />)}</div>}

    {results && <section className={styles.section} aria-labelledby="sales-results">
      <header><h2 id="sales-results">نتیجهٔ کمپین‌ها</h2><Link href="/admin/crm/engagement" className="btn btn-ghost btn-sm">مدیریت ارتباط‌ها</Link></header>
      <p className={styles.note}>خرید پرداخت‌شده تا {n(results.attributionDays)} روز پس از آخرین پیام به همان پیام نسبت داده می‌شود. «اثر» نرخ خرید گیرندگان را با مشترکانی می‌سنجد که در این بازه پیامی نگرفتند ({n(results.baseline.members)} نفر، نرخ تخمینی {pct(results.baseline.rate)})؛ این هم‌زمانی است، نه اثبات علت.</p>
      <div className={styles.kpis}>
        <div><span>پیام ارسال‌شده</span><b>{n(results.campaigns.reduce((s, c) => s + c.sent, 0))}</b></div>
        <div><span>خریدار پس از پیام</span><b>{n(results.campaigns.reduce((s, c) => s + c.buyers, 0))}</b></div>
        <div><span>یادآوری سبد</span><b>{n(results.carts.sent)}</b></div>
        <div><span>سبد بازگشته</span><b>{n(results.carts.recovered)}</b><small>{money(results.carts.recoveredValue)}</small></div>
      </div>
      {results.campaigns.length ? <div className={styles.tableWrap}><table className={styles.table}>
        <thead><tr><th scope="col">ارتباط</th><th scope="col">گیرنده</th><th scope="col">خوانده‌شده</th><th scope="col">خریدار</th><th scope="col">نرخ خرید</th><th scope="col">اثر</th><th scope="col">فروش</th></tr></thead>
        <tbody>{results.campaigns.map(c => <tr key={c.source}>
          <th scope="row">{c.name}</th><td>{n(c.recipients)}</td><td>{c.sent ? pct(c.read / c.sent) : '—'}</td><td>{n(c.buyers)}</td><td>{pct(c.conversion)}</td>
          <td>{c.lift === null ? '—' : <span className={c.lift >= 0 ? styles.up : styles.down}>{c.lift >= 0 ? '+' : ''}{pct(c.lift)}</span>}</td><td>{money(c.revenue)}</td>
        </tr>)}</tbody>
      </table></div> : <p className={styles.empty}>در این بازه پیام تبلیغاتی‌ای از «ارتباط با مشتری» ارسال نشده است.</p>}
    </section>}

    {data?.opportunities && <section className={styles.section} aria-labelledby="sales-opps">
      <header><h2 id="sales-opps">فرصت کمپین برای علاقه‌مندان هر دسته</h2></header>
      <p className={styles.note}>علاقه از خرید یک سال اخیر یا دنبال‌کردن کالای همان دسته می‌آید. «آمادهٔ پیام» یعنی رضایت پیام تبلیغاتی داده و در ۳۰ روز اخیر از آن دسته نخریده. فقط تعداد نشان داده می‌شود.</p>
      {data.opportunities.length ? <ul className={styles.cards}>{data.opportunities.map(o => { const d = drafts[o.categoryId]; return <li key={o.categoryId} className={styles.card}>
        <div className={styles.cardHead}><b>{o.name}</b><span className={styles.ready}>{n(o.ready)} آمادهٔ پیام</span></div>
        <p className={styles.meta}>{n(o.interested)} علاقه‌مند · {n(o.reachable)} با رضایت پیام</p>
        {o.products.length > 0 && <p className={styles.meta}>پرفروش‌ها: {o.products.map(p => p.name).join('، ')}</p>}
        <label className={styles.offer}><span>پیشنهاد واقعی شما (اختیاری)</span><input className="input" maxLength={200} placeholder="مثلاً ارسال رایگان تا پایان هفته" value={offer[o.categoryId] || ''} onChange={e => setOffer(v => ({ ...v, [o.categoryId]: e.target.value }))} /></label>
        <div className={styles.row}><button type="button" className="btn btn-primary btn-sm" disabled={!!busy || !o.ready} onClick={() => void draft(o.categoryId)}>{busy === o.categoryId ? 'در حال نوشتن…' : 'پیش‌نویس متن کمپین'}</button><Link className="btn btn-ghost btn-sm" href="/admin/crm/engagement">ساخت ارتباط</Link></div>
        {typeof d === 'string' && <p role="alert" className="error-text">{d}</p>}
        {d && typeof d === 'object' && <dl className={styles.draft} aria-live="polite">
          <div><dt>عنوان اعلان</dt><dd>{d.title}</dd></div><div><dt>متن اعلان</dt><dd>{d.body}</dd></div><div><dt>پیامک</dt><dd>{d.sms}</dd></div><div><dt>موضوع ایمیل</dt><dd>{d.subject}</dd></div>
          <p>پیش‌نویس است؛ آن را در ارتباط جدید بازبینی و ذخیره کنید. چیزی ارسال نشده است.</p>
        </dl>}
      </li> })}</ul> : <p className={styles.empty}>هنوز دسته‌ای با مشتری علاقه‌مند پیدا نشد.</p>}
    </section>}

    {data?.incomplete && <section className={styles.section} aria-labelledby="sales-pending">
      <header><h2 id="sales-pending">سفارش‌های نیمه‌تمام</h2><Link href="/admin/orders?status=PENDING" className="btn btn-ghost btn-sm">همهٔ سفارش‌های معلق</Link></header>
      <p className={styles.note}>{n(data.incomplete.count)} سفارش پرداخت‌نشده در ۷ روز اخیر (بیش از یک ساعت مانده) · {money(data.incomplete.value)}. پیگیری را خودتان انجام دهید؛ پیام تبلیغاتی فقط برای کسانی که رضایت داده‌اند. یادآوری خودکار سبد خرید از تنظیمات بازاریابی فروشگاه انجام می‌شود.</p>
      {data.incomplete.orders.length ? <ul className={styles.orders}>{data.incomplete.orders.map(o => <li key={o.id}>
        <div><b>#{n(o.id)} · {o.customer}</b><span>{o.items.join('، ')}</span></div>
        <span className={styles.meta}>{formatMoney(o.total, o.currency, 'fa-IR')} · {ago(o.createdAt)}</span>
        {o.boughtSince ? <span className={styles.done}>بعداً خرید کرد</span> : <span className={o.marketingOptIn ? styles.ready : styles.muted}>{o.marketingOptIn ? 'رضایت پیام دارد' : 'بدون رضایت پیام تبلیغاتی'}</span>}
        <div className={styles.row}><Link className="btn btn-ghost btn-sm" href={`/admin/orders?q=${o.id}`}>سفارش</Link><Link className="btn btn-ghost btn-sm" href={`/admin/crm/${o.userId}`}>پروندهٔ مشتری</Link>{data.access.customers && <button type="button" className="btn btn-ghost btn-sm" onClick={() => void lookup(String(o.userId))}>کالای مرتبط</button>}</div>
      </li>)}</ul> : <p className={styles.empty}>سفارش نیمه‌تمامی در این بازه نیست.</p>}
    </section>}

    {data?.access.customers && <section className={styles.section} aria-labelledby="sales-suggest" id="suggestions">
      <header><h2 id="sales-suggest">پیشنهاد کالای مرتبط برای یک مشتری</h2></header>
      <form className={styles.row} onSubmit={e => { e.preventDefault(); void lookup() }}><label className={styles.offer}><span>شمارهٔ کاربر</span><input className="input" inputMode="numeric" dir="ltr" value={customer} onChange={e => setCustomer(e.target.value.replace(/\D/g, ''))} required /></label><button className="btn btn-primary btn-sm" disabled={!customer}>نمایش پیشنهاد</button></form>
      {suggestError && <p role="alert" className="error-text">{suggestError}</p>}
      {suggest && <>
        <p className={styles.note}>{n(suggest.purchased)} کالای خریده‌شده در یک سال اخیر · {suggest.marketingOptIn ? 'رضایت پیام تبلیغاتی دارد' : 'رضایت پیام تبلیغاتی ندارد؛ فقط در گفت‌وگوی پشتیبانی یا خرید بعدی پیشنهاد دهید'}</p>
        {suggest.items.length ? <ul className={styles.products}>{suggest.items.map(p => <li key={p.id}><Link href={`/products/${p.slug}`} target="_blank">{p.image ? <img src={p.image} alt="" /> : <span aria-hidden="true"><Icon name="box" size={22} /></span>}<b>{p.name}</b><small>{p.reason}</small></Link></li>)}</ul> : <p className={styles.empty}>سابقهٔ خرید کافی برای پیشنهاد نیست.</p>}
      </>}
    </section>}
  </div>
}
