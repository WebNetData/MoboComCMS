'use client'

import Link from '@/components/AppLink'
import { useRouter, useSearchParams } from '@/platform/routing/navigation'
import { Suspense, useEffect, useState } from 'react'
import { Money, Notice, Pager, StoreShell, STATE_TONE, fa, faDate, useJson } from '../shared'
import JalaliDateInput from '@/components/date/JalaliDateInput'

type Row = {
  id: number; createdAt: string; assigneeName: string; customer: { id: number | null; name: string; email: string; phone: string }; state: { label: string; tone: string }
  fulfilment: string; schedule: string; trackingCode: string; invoiceNumber: string; total: number; currency: string; items: number; physical: boolean
  preview: { name: string; image: string; quantity: number }[]
}
type List = { tab: string; page: number; pages: number; total: number; work: string; overdueHours: number; counts: Record<string, number>; workCounts: Record<string, number>; orders: Row[] }

const TABS = [['all', 'همه'], ['new', 'جدید'], ['processing', 'در حال آماده‌سازی'], ['shipped', 'ارسال‌شده'], ['delivered', 'تحویل‌شده'], ['unpaid', 'پرداخت‌نشده'], ['closed', 'لغو و مرجوعی']]

function Orders() {
  const router = useRouter()
  const params = useSearchParams()
  const tab = params.get('tab') || 'all'
  const page = Number(params.get('page')) || 1
  const q = params.get('q') || ''
  const date = params.get('date') || ''
  const work = params.get('work') || ''
  const [search, setSearch] = useState(q)
  useEffect(() => setSearch(q), [q])
  const query = new URLSearchParams({ tab, page: String(page), ...(q ? { q } : {}), ...(date ? { date } : {}), ...(work ? { work } : {}) })
  const { data, error, loading } = useJson<List>(`/api/admin/store/orders?${query}`)
  const go = (patch: Record<string, string | number>) => {
    const next = new URLSearchParams({ tab, ...(q ? { q } : {}), ...(date ? { date } : {}), ...(work ? { work } : {}) })
    for (const [key, value] of Object.entries(patch)) if (value) next.set(key, String(value)); else next.delete(key)
    if (!('page' in patch)) next.delete('page')
    router.push(`/admin/store/orders?${next}`)
  }
  const workFilters = [['', 'همهٔ کارها'], ['pending', 'نیازمند اقدام'], ['mine', 'کارهای من'], ['unassigned', 'بدون مسئول'], ['overdue', data?.overdueHours ? `بیش از ${data.overdueHours.toLocaleString('fa-IR')} ساعت از پرداخت` : 'دیرکرد (مهلت تنظیم نشده)']] as const
  const age = (createdAt: string) => {
    const hours = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 3_600_000))
    return hours < 24 ? `${fa(hours)} ساعت پیش` : `${fa(Math.floor(hours / 24))} روز پیش`
  }
  return <StoreShell title="سفارش‌های فروشگاه">
    <nav className="sa-subtabs" aria-label="فیلترهای کار سفارش" role="group">{workFilters.map(([key, label]) => <button key={key || 'all'} type="button" className={key === work ? 'is-active' : ''} aria-pressed={key === work} onClick={() => go({ work: key })}>{label}<span className="num">{fa(data?.workCounts?.[key || 'all'] ?? 0)}</span></button>)}</nav>
    <nav className="sa-subtabs" aria-label="وضعیت سفارش">{TABS.map(([key, label]) => <button key={key} type="button" className={key === tab ? 'is-active' : ''} aria-pressed={key === tab} onClick={() => go({ tab: key })}>{label}{data?.counts[key] ? <span className="num">{fa(data.counts[key])}</span> : null}</button>)}</nav>
    <form className="sa-toolbar" role="search" onSubmit={(event) => { event.preventDefault(); go({ q: search.trim() }) }}>
      <input className="input" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="شمارهٔ سفارش، نام، ایمیل، موبایل، کالا یا کد رهگیری" aria-label="جست‌وجوی سفارش" />
      <label className="sa-inline"><span>روز ارسال</span><JalaliDateInput className="input" value={date} onChange={(value) => go({ date: value })} /></label>
      <button className="btn btn-primary" type="submit">جست‌وجو</button>
    </form>
    {error && <Notice tone="error">{error}</Notice>}
    <div className="sa-card sa-table-wrap" aria-busy={loading}>
      <table className="data sa-table sa-cards">
        <thead><tr><th>سفارش</th><th>مشتری</th><th>کالاها</th><th>وضعیت</th><th>ارسال</th><th>مبلغ</th></tr></thead>
        <tbody>
          {data?.orders.map((order) => <tr key={order.id} onClick={() => router.push(`/admin/store/orders/${order.id}`)} className="is-link">
            <td><Link href={`/admin/store/orders/${order.id}`} className="sa-link num" onClick={(event) => event.stopPropagation()}>#{fa(order.id)}</Link><small className="sa-sub">{faDate(order.createdAt, true)}</small><small className="sa-sub">{age(order.createdAt)}</small></td>
            <td className="sa-card-main"><b>{order.customer.name || '—'}</b><small className="sa-sub" dir="ltr">{order.customer.phone || order.customer.email}</small></td>
            <td data-label="کالاها"><span className="sa-thumbs">{order.preview.map((item, index) => item.image ? <img key={index} src={item.image} alt={item.name} title={item.name} /> : <span key={index} className="sa-ph" title={item.name} />)}</span><small className="sa-sub num">{fa(order.items)} کالا</small></td>
            <td data-label="وضعیت"><span className={`sa-state ${STATE_TONE[order.state.tone] || ''}`}>{order.state.label}</span><small className="sa-sub">{order.assigneeName || 'بدون مسئول'}</small></td>
            <td data-label="ارسال">{order.physical ? <>{order.schedule ? <small>{order.schedule}</small> : <small className="sa-sub">—</small>}{order.trackingCode && <small className="sa-sub" dir="ltr">{order.trackingCode}</small>}</> : <small className="sa-sub">دیجیتال</small>}</td>
            <td data-label="مبلغ"><Money value={order.total} currency={order.currency} /></td>
          </tr>)}
          {data && !data.orders.length && <tr><td colSpan={7} className="sa-empty">سفارشی با این شرایط پیدا نشد.</td></tr>}
        </tbody>
      </table>
    </div>
    {data && <Pager page={data.page} pages={data.pages} onPage={(next) => go({ page: next })} />}
  </StoreShell>
}

export default function StoreOrdersPage() {
  return <Suspense fallback={null}><Orders /></Suspense>
}
