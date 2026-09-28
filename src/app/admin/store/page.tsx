'use client'

import Link from '@/components/AppLink'
import { useState } from 'react'
import { Money, Notice, StoreShell, STATE_TONE, fa, faDate, faDay, useJson } from './shared'

type Dashboard = {
  currency: string
  kpis: { revenueToday: number; revenue30: number; revenuePrev30: number; orders30: number; ordersPrev30: number; averageOrder: number; activeProducts: number; outOfStock: number; activeCarts: number; pendingReviews: number; pendingQuestions: number }
  queue: Record<string, number>
  series: { day: string; revenue: number; orders: number }[]
  recent: { id: number; createdAt: string; customer: { name: string; email: string }; state: { label: string; tone: string }; total: number; currency: string; items: number }[]
  topProducts: { id: number; name: string; image: string; quantity: number; revenue: number }[]
  lowStock: { id: number; name: string; image: string; stock: number; sku: string }[]
}

function Delta({ now, before }: { now: number; before: number }) {
  if (!before) return now ? <small className="sa-delta is-up">جدید</small> : null
  const change = Math.round(((now - before) / before) * 100)
  return <small className={`sa-delta ${change >= 0 ? 'is-up' : 'is-down'}`}>{change >= 0 ? '▲' : '▼'} {fa(Math.abs(change))}٪ نسبت به ۳۰ روز قبل</small>
}

/** 30-day revenue bars (single series: one hue, hover tooltip, table view). */
function RevenueChart({ series, currency }: { series: Dashboard['series']; currency: string }) {
  const [hover, setHover] = useState<number | null>(null)
  const [table, setTable] = useState(false)
  const max = Math.max(1, ...series.map((point) => point.revenue))
  const width = 720
  const height = 200
  const gap = 2
  const bar = (width - gap * (series.length - 1)) / series.length
  const ticks = [0, 0.5, 1].map((ratio) => ({ y: height - ratio * height, value: max * ratio }))
  const shown = hover !== null ? series[hover] : null
  return <section className="sa-card sa-chart">
    <header className="sa-card-head">
      <h2>فروش ۳۰ روز اخیر</h2>
      <button type="button" className="btn btn-ghost btn-sm" aria-pressed={table} onClick={() => setTable((open) => !open)}>{table ? 'نمایش نمودار' : 'نمایش جدول'}</button>
    </header>
    {table ? <div className="sa-table-wrap"><table className="data"><thead><tr><th>روز</th><th>سفارش</th><th>فروش</th></tr></thead><tbody>{[...series].reverse().map((point) => <tr key={point.day}><td>{faDay(point.day)}</td><td className="num">{fa(point.orders)}</td><td><Money value={point.revenue} currency={currency} /></td></tr>)}</tbody></table></div>
      : <div className="sa-chart-body">
        <div className="sa-chart-tip" aria-live="polite">{shown ? <><b>{faDay(shown.day)}</b><Money value={shown.revenue} currency={currency} /><small>{fa(shown.orders)} سفارش</small></> : <small>برای دیدن جزئیات، روی ستون‌ها بروید</small>}</div>
        <svg viewBox={`0 0 ${width} ${height + 24}`} role="img" aria-label="نمودار فروش روزانه در ۳۰ روز اخیر" preserveAspectRatio="none">
          {ticks.map((tick) => <line key={tick.y} x1={0} x2={width} y1={tick.y} y2={tick.y} className="sa-gridline" />)}
          {series.map((point, index) => {
            const h = point.revenue ? Math.max(3, (point.revenue / max) * height) : 0
            // RTL: the newest day sits on the left end, like the Persian reading order ends there.
            const x = width - (index + 1) * bar - index * gap
            return <g key={point.day} onMouseEnter={() => setHover(index)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(index)} onBlur={() => setHover(null)} tabIndex={0} role="img" aria-label={`${faDay(point.day)}: ${fa(Math.round(point.revenue))}`}>
              <rect x={x} y={0} width={bar} height={height} className="sa-hit" />
              {h > 0 && <path className={`sa-bar${hover === index ? ' is-hover' : ''}`} d={`M${x},${height} v${-(h - 4)} q0,-4 4,-4 h${bar - 8} q4,0 4,4 v${h - 4} z`} />}
            </g>
          })}
          <line x1={0} x2={width} y1={height} y2={height} className="sa-axis" />
          {[0, 14, series.length - 1].filter((index, i, list) => series[index] && list.indexOf(index) === i).map((index) => <text key={index} x={index === 0 ? width : index === series.length - 1 ? 0 : width - (index + 0.5) * (bar + gap)} y={height + 18} textAnchor={index === 0 ? 'end' : index === series.length - 1 ? 'start' : 'middle'} className="sa-tick">{faDay(series[index].day)}</text>)}
        </svg>
        <div className="sa-chart-scale"><small>بیشینه: <Money value={max} currency={currency} /></small></div>
      </div>}
  </section>
}

export default function StoreDashboardPage() {
  const { data, error } = useJson<Dashboard>('/api/admin/store/dashboard')
  const k = data?.kpis
  return <StoreShell title="داشبورد فروشگاه" actions={<><Link href="/admin/store/products/new" className="btn btn-primary">+ محصول جدید</Link><Link href="/products" className="btn btn-ghost" target="_blank">مشاهدهٔ فروشگاه</Link></>}>
    {error && <Notice tone="error">{error}</Notice>}
    {!data ? <div className="sa-skeleton" aria-busy="true" /> : <>
      <div className="sa-kpis">
        <div className="sa-kpi"><span>فروش ۳۰ روز</span><Money value={k!.revenue30} currency={data.currency} /><Delta now={k!.revenue30} before={k!.revenuePrev30} /></div>
        <div className="sa-kpi"><span>سفارش‌های پرداخت‌شده</span><b className="num">{fa(k!.orders30)}</b><Delta now={k!.orders30} before={k!.ordersPrev30} /></div>
        <div className="sa-kpi"><span>میانگین هر سفارش</span><Money value={k!.averageOrder} currency={data.currency} /></div>
        <div className="sa-kpi"><span>فروش امروز</span><Money value={k!.revenueToday} currency={data.currency} /></div>
      </div>
      <div className="sa-queue">
        {[['new', 'سفارش جدید برای پردازش'], ['processing', 'در حال آماده‌سازی'], ['shipped', 'در راه مشتری'], ['unpaid', 'در انتظار پرداخت']].map(([key, label]) => <Link key={key} href={`/admin/store/orders?tab=${key}`} className={`sa-queue-item${key === 'new' && data.queue.new ? ' is-hot' : ''}`}><b className="num">{fa(data.queue[key] || 0)}</b><span>{label}</span></Link>)}
        <Link href="/admin/store/inventory?filter=out" className={`sa-queue-item${k!.outOfStock ? ' is-warn' : ''}`}><b className="num">{fa(k!.outOfStock)}</b><span>کالای ناموجود</span></Link>
        <Link href="/admin/product-feedback" className="sa-queue-item"><b className="num">{fa(k!.pendingReviews + k!.pendingQuestions)}</b><span>دیدگاه و پرسش در انتظار</span></Link>
      </div>
      <RevenueChart series={data.series} currency={data.currency} />
      <div className="sa-cols">
        <section className="sa-card">
          <header className="sa-card-head"><h2>آخرین سفارش‌ها</h2><Link href="/admin/store/orders" className="sa-link">همهٔ سفارش‌ها</Link></header>
          {data.recent.length ? <ul className="sa-rows">{data.recent.map((order) => <li key={order.id}><Link href={`/admin/store/orders/${order.id}`}>
            <span className="num sa-id">#{fa(order.id)}</span>
            <span className="sa-grow"><b>{order.customer.name || order.customer.email}</b><small>{faDate(order.createdAt, true)} · {fa(order.items)} کالا</small></span>
            <span className={`sa-state ${STATE_TONE[order.state.tone] || ''}`}>{order.state.label}</span>
            <Money value={order.total} currency={order.currency} />
          </Link></li>)}</ul> : <p className="sa-empty">هنوز سفارشی ثبت نشده است.</p>}
        </section>
        <div className="sa-stack">
          <section className="sa-card">
            <header className="sa-card-head"><h2>پرفروش‌ترین‌های ۳۰ روز</h2></header>
            {data.topProducts.length ? <ol className="sa-rank">{data.topProducts.map((product) => <li key={product.id}>{product.image ? <img src={product.image} alt="" /> : <span className="sa-ph" />}<span className="sa-grow"><b>{product.name}</b><small className="num">{fa(product.quantity)} عدد</small></span><Money value={product.revenue} currency={data.currency} /></li>)}</ol> : <p className="sa-empty">در ۳۰ روز اخیر فروشی ثبت نشده است.</p>}
          </section>
          <section className="sa-card">
            <header className="sa-card-head"><h2>رو به اتمام</h2><Link href="/admin/store/inventory?filter=low" className="sa-link">انبار</Link></header>
            {data.lowStock.length ? <ul className="sa-rank">{data.lowStock.map((product) => <li key={product.id}>{product.image ? <img src={product.image} alt="" /> : <span className="sa-ph" />}<span className="sa-grow"><Link href={`/admin/store/products/${product.id}`}><b>{product.name}</b></Link>{product.sku && <small dir="ltr">{product.sku}</small>}</span><span className={`sa-stock${product.stock === 0 ? ' is-out' : ' is-low'}`}>{product.stock === 0 ? 'ناموجود' : `${fa(product.stock)} عدد`}</span></li>)}</ul> : <p className="sa-empty">موجودی همهٔ کالاها کافی است.</p>}
          </section>
          <section className="sa-card sa-mini">
            <span>سبدهای خرید فعال (۷ روز)</span><b className="num">{fa(k!.activeCarts)}</b>
            <span>محصولات فعال</span><b className="num">{fa(k!.activeProducts)}</b>
          </section>
        </div>
      </div>
    </>}
  </StoreShell>
}
