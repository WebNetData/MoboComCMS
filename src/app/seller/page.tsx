'use client'

import { useEffect, useState } from 'react'
import Link from '@/components/AppLink'
import { faDate, faNum, toman, useSeller } from './SellerContext'
import { RatingChip, RatingMeter } from '@/components/engage/RatingMeter'

type Dashboard = {
  money: { balance: number; available: number; pending: number }
  sales30: number; items30: number; orders30: number
  chart: { day: string; total: number }[]
  openLines: number; products: number; pendingProducts: number
  lowStock: { id: number; name: string; stock: number }[]
  rating: { average: number; count: number }
  performance: { label: string; tone: string }
  reviews: { id: number; rating: number; body: string; createdAt: string }[]
}

const faDay = (day: string) => new Intl.DateTimeFormat('fa-IR-u-ca-persian', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`))

function SalesBars({ points }: { points: Dashboard['chart'] }) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(1, ...points.map((point) => point.total))
  const shown = hover !== null ? points[hover] : null
  return <div className="sl-bars">
    <p className="sl-bars-tip" aria-live="polite">{shown ? <><b>{faDay(shown.day)}</b> · {toman(shown.total)}</> : 'روی ستون‌ها بروید'}</p>
    <div className="sl-bars-row" role="img" aria-label="فروش روزانهٔ ۳۰ روز اخیر">
      {points.map((point, index) => <span key={point.day} className={`sl-bar${hover === index ? ' is-hover' : ''}`} style={{ height: `${point.total ? Math.max(4, (point.total / max) * 100) : 1}%` }} onMouseEnter={() => setHover(index)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(index)} onBlur={() => setHover(null)} tabIndex={0} aria-label={`${faDay(point.day)}: ${toman(point.total)}`} />)}
    </div>
    <div className="sl-bars-axis"><small>{faDay(points[0]?.day || '')}</small><small>امروز</small></div>
  </div>
}

export default function SellerHome() {
  const { seller } = useSeller()
  const [data, setData] = useState<Dashboard | null>(null)
  useEffect(() => { fetch('/api/seller', { cache: 'no-store' }).then((r) => r.json()).then((body) => setData(body.dashboard)).catch(() => undefined) }, [])
  if (!data) return <div className="sa-skeleton" aria-busy="true" />
  return <div className="sa sl-home">
    <header className="sa-head"><div><h1>سلام، {seller.shopName}</h1><p className="sa-hint">خلاصهٔ فروش و کارهای امروز فروشگاه شما</p></div><div className="sa-head-actions"><Link href="/seller/products/new" className="btn btn-primary">+ افزودن محصول</Link></div></header>

    {(data.openLines > 0 || data.pendingProducts > 0 || !seller.iban) && <div className="sl-todo">
      {data.openLines > 0 && <Link href="/seller/orders" className="sl-todo-item is-urgent"><b>{faNum(data.openLines)}</b> سفارش منتظر تأیید و ارسال</Link>}
      {data.pendingProducts > 0 && <Link href="/seller/products?status=pending" className="sl-todo-item"><b>{faNum(data.pendingProducts)}</b> محصول در صف بررسی مدیر</Link>}
      {!seller.iban && <Link href="/seller/profile" className="sl-todo-item">شمارهٔ شبا را برای تسویه ثبت کنید</Link>}
    </div>}

    <div className="sa-kpis">
      <div className="sa-kpi"><small>فروش ۳۰ روز</small><b>{toman(data.sales30)}</b><span className="sa-sub">{faNum(data.items30)} کالا در {faNum(data.orders30)} ردیف سفارش</span></div>
      <div className="sa-kpi"><small>قابل برداشت</small><b>{toman(data.money.available)}</b><Link href="/seller/finance" className="sa-link">درخواست تسویه</Link></div>
      <div className="sa-kpi"><small>در دورهٔ مرجوعی</small><b>{toman(data.money.pending)}</b><span className="sa-sub">پس از پایان مهلت قابل برداشت می‌شود</span></div>
      <div className="sa-kpi"><small>امتیاز خریداران</small><b>{data.rating.count ? `${data.rating.average.toLocaleString('fa-IR')} از ۵` : '—'}</b><span className={`sl-perf is-${data.performance.tone}`}>{data.performance.label}</span></div>
    </div>

    <div className="sa-cols sl-home-cols">
      <section className="sa-card"><header className="sa-card-head"><h2>فروش روزانه</h2></header><SalesBars points={data.chart} /></section>
      <section className="sa-card">
        <header className="sa-card-head"><h2>موجودی رو به اتمام</h2><Link href="/seller/products?status=out" className="sa-link">همه</Link></header>
        {data.lowStock.length ? <ul className="sl-list">{data.lowStock.map((row) => <li key={row.id}><Link href={`/seller/products/${row.id}`}>{row.name}</Link><span className={`sa-state ${row.stock === 0 ? 'is-bad' : 'is-warn'}`}>{row.stock === 0 ? 'ناموجود' : `${faNum(row.stock)} عدد`}</span></li>)}</ul> : <p className="sa-empty">موجودی همهٔ محصولات کافی است.</p>}
        <p className="sa-hint">{faNum(data.products)} محصول فعال در فروشگاه</p>
      </section>
    </div>

    <section className="sa-card">
      <header className="sa-card-head"><h2>آخرین نظر خریداران</h2><Link href="/seller/reviews" className="sa-link">همهٔ نظرها</Link></header>
      {data.reviews.length ? <ul className="sl-reviews">{data.reviews.map((row) => <li key={row.id}><span className="sl-stars"><RatingChip value={row.rating} /><RatingMeter size="sm" value={row.rating} label={`${row.rating} از ۵`} /></span><p>{row.body || 'بدون توضیح'}</p><small>{faDate(row.createdAt)}</small></li>)}</ul> : <p className="sa-empty">هنوز امتیازی ثبت نشده است. پس از تحویل سفارش‌ها، خریداران به فروشگاه شما امتیاز می‌دهند.</p>}
    </section>
  </div>
}
