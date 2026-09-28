'use client'

import Link from '@/components/AppLink'
import { useRouter, useSearchParams } from '@/platform/routing/navigation'
import { Suspense, useEffect, useState } from 'react'
import { Money, Notice, Pager, StoreShell, fa, faDate, useJson } from '../shared'

type Row = { id: number; orderId: number; waybill: string; carrierName: string; trackingCode: string; trackingUrl: string; status: string; statusLabel: string; weightGrams: number; fee: number; cost: number; currency: string; receiver: Record<string, string>; createdAt: string }
type List = { page: number; pages: number; total: number; counts: Record<string, number>; carriers: { id: string; name: string }[]; rows: Row[] }

const TABS: [string, string][] = [['open', 'در جریان'], ['READY', 'آمادهٔ تحویل به مرسوله‌رسان'], ['IN_TRANSIT', 'در مسیر'], ['DELIVERED', 'تحویل‌شده'], ['RETURNED', 'برگشتی'], ['', 'همه']]
const TONE: Record<string, string> = { READY: 'is-warn', PICKED_UP: 'is-info', IN_TRANSIT: 'is-info', OUT_FOR_DELIVERY: 'is-info', DELIVERED: 'is-ok', RETURNED: 'is-bad', CANCELLED: '' }

function Shipments() {
  const router = useRouter()
  const params = useSearchParams()
  const status = params.get('status') ?? 'open'
  const carrier = params.get('carrier') || ''
  const q = params.get('q') || ''
  const page = Number(params.get('page')) || 1
  const [search, setSearch] = useState(q)
  const [selected, setSelected] = useState<number[]>([])
  useEffect(() => setSearch(q), [q])
  const { data, error, loading } = useJson<List>(`/api/admin/shipping/shipments?${new URLSearchParams({ status, carrier, q, page: String(page) })}`)
  const go = (patch: Record<string, string | number>) => {
    const next = new URLSearchParams({ status, ...(carrier ? { carrier } : {}), ...(q ? { q } : {}) })
    for (const [key, value] of Object.entries(patch)) next.set(key, String(value))
    if (!('page' in patch)) next.delete('page')
    setSelected([])
    router.push(`/admin/store/shipments?${next}`)
  }
  const count = (key: string) => key === 'open' ? ['READY', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'].reduce((sum, item) => sum + (data?.counts[item] || 0), 0) : key === 'IN_TRANSIT' ? (data?.counts.IN_TRANSIT || 0) + (data?.counts.PICKED_UP || 0) + (data?.counts.OUT_FOR_DELIVERY || 0) : key ? data?.counts[key] || 0 : 0
  const all = data?.rows.map((row) => row.id) || []

  return <StoreShell title="مرسوله‌ها و بارنامه‌ها" actions={<>
    <Link href="/admin/shipping-carriers" className="btn btn-ghost">شرکت‌های حمل و تعرفه‌ها</Link>
    <a href={selected.length ? `/admin/store/shipments/labels?ids=${selected.join(',')}` : undefined} target="_blank" rel="noreferrer" className={`btn btn-primary${selected.length ? '' : ' is-disabled'}`} aria-disabled={!selected.length}>چاپ برچسب ({fa(selected.length)})</a>
  </>}>
    <nav className="sa-subtabs" aria-label="وضعیت مرسوله">{TABS.map(([key, label]) => <button key={key || 'all'} type="button" className={key === status ? 'is-active' : ''} aria-pressed={key === status} onClick={() => go({ status: key })}>{label}{count(key) ? <span className="num">{fa(count(key))}</span> : null}</button>)}</nav>
    <form className="sa-toolbar" role="search" onSubmit={(event) => { event.preventDefault(); go({ q: search.trim() }) }}>
      <input className="input" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="شمارهٔ بارنامه، کد رهگیری یا شمارهٔ سفارش" aria-label="جست‌وجوی مرسوله" />
      <select className="select" value={carrier} onChange={(event) => go({ carrier: event.target.value })} aria-label="شرکت حمل"><option value="">همهٔ شرکت‌ها</option>{data?.carriers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      <button className="btn btn-primary" type="submit">جست‌وجو</button>
    </form>
    {error && <Notice tone="error">{error}</Notice>}
    <div className="sa-card sa-table-wrap" aria-busy={loading}>
      <table className="data sa-table">
        <thead><tr><th><input type="checkbox" aria-label="انتخاب همه" checked={!!all.length && selected.length === all.length} onChange={(event) => setSelected(event.target.checked ? all : [])} /></th><th>بارنامه</th><th>گیرنده</th><th>شرکت حمل</th><th>کد رهگیری</th><th>وضعیت</th><th>هزینه</th></tr></thead>
        <tbody>
          {data?.rows.map((row) => <tr key={row.id}>
            <td><input type="checkbox" aria-label={`انتخاب ${row.waybill}`} checked={selected.includes(row.id)} onChange={(event) => setSelected(event.target.checked ? [...selected, row.id] : selected.filter((id) => id !== row.id))} /></td>
            <td><Link href={`/admin/store/orders/${row.orderId}`} className="sa-link num" dir="ltr">{row.waybill}</Link><small className="sa-sub">سفارش {fa(row.orderId)} · {faDate(row.createdAt, true)}</small></td>
            <td><b>{row.receiver.name || '—'}</b><small className="sa-sub">{[row.receiver.province, row.receiver.city].filter(Boolean).join('، ')}</small></td>
            <td>{row.carrierName}<small className="sa-sub num">{fa(row.weightGrams)} گرم</small></td>
            <td dir="ltr">{row.trackingCode ? (row.trackingUrl ? <a className="sa-link" href={row.trackingUrl} target="_blank" rel="noreferrer">{row.trackingCode}</a> : row.trackingCode) : <small className="sa-sub">ثبت نشده</small>}</td>
            <td><span className={`sa-state ${TONE[row.status] || ''}`}>{row.statusLabel}</span></td>
            <td><Money value={row.fee} currency={row.currency} />{row.cost > 0 && <small className="sa-sub">هزینهٔ واقعی: <Money value={row.cost} currency={row.currency} /></small>}</td>
          </tr>)}
          {data && !data.rows.length && <tr><td colSpan={7} className="sa-empty">مرسوله‌ای در این بخش نیست. بارنامه از صفحهٔ هر سفارش صادر می‌شود.</td></tr>}
        </tbody>
      </table>
    </div>
    {data && <Pager page={data.page} pages={data.pages} onPage={(next) => go({ page: next })} />}
  </StoreShell>
}

export default function ShipmentsPage() {
  return <Suspense fallback={null}><Shipments /></Suspense>
}
