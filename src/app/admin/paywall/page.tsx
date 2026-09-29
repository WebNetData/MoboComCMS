'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import Link from '@/components/AppLink'
import { Notice, fa, faDate } from '../store/shared'

type Owner = { id: number; title: string; path: string; image: string; status: string } | null
type Item = { id: number; ownerType: string; ownerId: number; key: string; price: string; memberPrice: string; priceLabel: string; memberPriceLabel: string; currency: string; vipAccess: string; active: boolean; sales: number; revenue: string; owner: Owner }
type Purchase = { id: number; userId: number; user: string; source: string; revoked: boolean; paid: string; createdAt: string; orderId: number | null; owner: Owner; ownerType: string }
type Overview = { enabled: boolean; kpis: { items: number; sales30: number; revenue30: string; buyers: number }; items: Item[]; recent: Purchase[] }
type Tone = { tone: 'ok' | 'error'; text: string } | null

const TYPE: Record<string, string> = { post: 'مقاله', software: 'نرم‌افزار', game: 'بازی', title: 'فیلم و سریال', album: 'آلبوم', track: 'آهنگ', link: 'لینک جداگانه' }
const VIP: Record<string, string> = { FREE: 'رایگان برای VIP', DISCOUNT: 'تخفیف VIP', NONE: 'VIP هم می‌خرد' }
const editorOf = (item: { ownerType: string; ownerId: number }) => ({ post: '/admin/posts', software: '/admin/software/titles', game: `/admin/games/${item.ownerId}`, title: '/admin/cinema/titles', album: '/admin/music/library', track: '/admin/music/library' } as Record<string, string>)[item.ownerType] || '/admin'

export default function PaywallAdmin() {
  const [type, setType] = useState('')
  const [query, setQuery] = useState('')
  const [data, setData] = useState<Overview | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState<Tone>(null)
  const [grant, setGrant] = useState({ user: '', key: '', note: '' })
  const [busy, setBusy] = useState(false)

  const reload = useCallback(async () => {
    const response = await fetch(`/api/admin/paywall?type=${type}&q=${encodeURIComponent(query)}`, { cache: 'no-store' }).catch(() => null)
    const body = await response?.json().catch(() => null)
    if (response?.ok) { setData(body); setError('') } else setError(body?.error || 'بارگذاری نشد')
  }, [type, query])
  useEffect(() => { const timer = setTimeout(() => void reload(), 250); return () => clearTimeout(timer) }, [reload])

  async function send(method: string, url: string, body?: Record<string, unknown>) {
    setBusy(true); setNotice(null)
    const response = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined }).catch(() => null)
    const result = await response?.json().catch(() => null)
    setBusy(false)
    if (!response?.ok) { setNotice({ tone: 'error', text: result?.error || 'انجام نشد' }); return false }
    await reload()
    return true
  }

  const toggle = (item: Item) => send('PUT', '/api/admin/paywall', { ownerType: item.ownerType, ownerId: item.ownerId, price: item.price, memberPrice: item.memberPrice, currency: item.currency, vipAccess: item.vipAccess, active: !item.active })
  const remove = async (item: Item) => { if (window.confirm(`فروش «${item.owner?.title || item.key}» برداشته شود؟`)) await send('DELETE', `/api/admin/paywall?ownerType=${item.ownerType}&ownerId=${item.ownerId}`) }
  const revoke = async (row: Purchase) => { if (window.confirm(`دسترسی ${row.user} به «${row.owner?.title || ''}» گرفته شود؟`)) await send('POST', '/api/admin/paywall', { op: 'revoke', id: row.id }) }
  async function submitGrant(event: FormEvent) {
    event.preventDefault()
    if (await send('POST', '/api/admin/paywall', { op: 'grant', ...grant })) { setGrant({ user: '', key: grant.key, note: '' }); setNotice({ tone: 'ok', text: 'دسترسی داده شد و در «خریدهای من» کاربر نمایش داده می‌شود.' }) }
  }

  return <div className="sa" dir="rtl">
    <header className="sa-head"><h1>فروش فایل و مقاله</h1></header>
    <p className="sa-hint">برای فروشی کردن هر مورد، در ویرایشگر همان بخش (مقاله، نرم‌افزار، بازی، فیلم، آلبوم یا آهنگ) بخش «💰 فروش» را روشن کنید و قیمت بگذارید. اعضای ویژه طبق انتخاب شما رایگان، با تخفیف یا مثل بقیه دریافت می‌کنند؛ خریدار برای همیشه دسترسی دارد.</p>
    {error && <Notice tone="error">{error}</Notice>}
    {data && !data.enabled && <Notice tone="error">ماژول «فروش محتوا» خاموش است؛ تا روشن نشود همهٔ موارد رایگان (یا طبق دسترسی VIP) نمایش داده می‌شوند.</Notice>}
    {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
    {!data ? <div className="sa-skeleton" /> : <>
      <div className="sa-kpis">
        <div className="sa-kpi"><small>موارد فروشی فعال</small><b className="num">{fa(data.kpis.items)}</b></div>
        <div className="sa-kpi"><small>فروش ۳۰ روز اخیر</small><b className="num">{fa(data.kpis.sales30)}</b></div>
        <div className="sa-kpi"><small>درآمد ۳۰ روز اخیر</small><b>{data.kpis.revenue30}</b></div>
        <div className="sa-kpi"><small>خریداران</small><b className="num">{fa(data.kpis.buyers)}</b></div>
      </div>

      <section className="sa-card sa-table-wrap">
        <header className="sa-card-head">
          <h2>موارد فروشی</h2>
          <div className="sa-head-actions">
            <select className="select" value={type} onChange={(e) => setType(e.target.value)} aria-label="نوع"><option value="">همهٔ بخش‌ها</option>{Object.entries(TYPE).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            <input className="input" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="جست‌وجوی عنوان…" aria-label="جست‌وجو" />
          </div>
        </header>
        <table className="data sa-table" style={{ minWidth: 760 }}><thead><tr><th>مورد</th><th>قیمت</th><th>اعضای ویژه</th><th>فروش</th><th>درآمد</th><th>وضعیت</th><th /></tr></thead><tbody>
          {data.items.map((item) => <tr key={item.id}>
            <td><div className="sa-prod">{item.owner?.image ? <img src={item.owner.image} alt="" width={40} height={40} /> : <span className="sa-prod-ph" />}<div>{item.owner ? <a className="sa-link" href={item.owner.path} target="_blank" rel="noreferrer">{item.owner.title}</a> : <span className="muted">حذف شده</span>}<small className="sa-sub">{TYPE[item.ownerType] || item.ownerType}{item.owner && item.owner.status !== 'PUBLISHED' ? ' · پیش‌نویس' : ''}</small></div></div></td>
            <td className="num">{item.priceLabel}</td>
            <td>{VIP[item.vipAccess] || item.vipAccess}{item.memberPriceLabel && <small className="sa-sub">{item.memberPriceLabel}</small>}</td>
            <td className="num">{fa(item.sales)}</td>
            <td className="num">{item.revenue}</td>
            <td><button type="button" className={`sa-state ${item.active ? 'is-ok' : 'is-warn'}`} onClick={() => void toggle(item)} disabled={busy} title="تغییر وضعیت">{item.active ? 'در حال فروش' : 'متوقف (رایگان)'}</button></td>
            <td><div className="sa-row-actions"><Link className="sa-link" href={editorOf(item)}>ویرایش</Link><button type="button" className="sa-link is-danger" onClick={() => void remove(item)} disabled={busy}>برداشتن</button></div></td>
          </tr>)}
          {!data.items.length && <tr><td colSpan={7} className="sa-empty">هنوز موردی فروشی نشده است. از ویرایشگر هر بخش شروع کنید.</td></tr>}
        </tbody></table>
      </section>

      <section className="sa-card sa-table-wrap">
        <header className="sa-card-head"><h2>خریدهای اخیر</h2></header>
        <table className="data sa-table" style={{ minWidth: 640 }}><thead><tr><th>کاربر</th><th>مورد</th><th>مبلغ</th><th>زمان</th><th /></tr></thead><tbody>
          {data.recent.map((row) => <tr key={row.id} className={row.revoked ? 'is-muted' : ''}>
            <td><Link className="sa-link" href={`/admin/users/${row.userId}`}>{row.user}</Link></td>
            <td>{row.owner?.title || '—'}<small className="sa-sub">{TYPE[row.ownerType]}</small></td>
            <td className="num">{row.paid}{row.orderId && <small className="sa-sub">سفارش #{fa(row.orderId)}</small>}</td>
            <td>{faDate(row.createdAt)}</td>
            <td>{row.revoked ? <span className="sa-state is-bad">گرفته شد</span> : <button type="button" className="sa-link is-danger" onClick={() => void revoke(row)} disabled={busy}>گرفتن دسترسی</button>}</td>
          </tr>)}
          {!data.recent.length && <tr><td colSpan={5} className="sa-empty">هنوز خریدی ثبت نشده است.</td></tr>}
        </tbody></table>
      </section>
      <form className="sa-card sa-form" onSubmit={submitGrant}>
        <header className="sa-card-head"><h2>دادن دسترسی به کاربر</h2></header>
        <p className="sa-hint">برای هدیه یا جبران پرداخت خارج از سایت. در «خریدهای من» کاربر نمایش داده می‌شود.</p>
        <div className="sa-cols">
          <label className="sa-field"><span>کاربر (شناسه، ایمیل یا موبایل)</span><input className="input" dir="ltr" value={grant.user} onChange={(e) => setGrant({ ...grant, user: e.target.value })} required /></label>
          <label className="sa-field"><span>مورد</span><select className="select" value={grant.key} onChange={(e) => setGrant({ ...grant, key: e.target.value })} required><option value="">انتخاب کنید…</option>{data.items.map((item) => <option key={item.key} value={item.key}>{TYPE[item.ownerType]} — {item.owner?.title || item.key}</option>)}</select></label>
          <label className="sa-field"><span>یادداشت (اختیاری)</span><input className="input" value={grant.note} onChange={(e) => setGrant({ ...grant, note: e.target.value })} maxLength={300} /></label>
        </div>
        <button type="submit" className="btn btn-primary" disabled={busy || !grant.user || !grant.key}>دادن دسترسی</button>
      </form>
    </>}
  </div>
}
