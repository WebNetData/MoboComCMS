'use client'

import { useSearchParams } from '@/platform/routing/navigation'
import { Suspense, useEffect, useState } from 'react'
import { code128 } from '@/modules/shipping/domain/carriers'

type Label = { id: number; orderId: number; waybill: string; carrierName: string; trackingCode: string; weightGrams: number; parcels: number; note: string; createdAt: string; sender: Record<string, string>; receiver: Record<string, string> }
const fa = (value: number) => value.toLocaleString('fa-IR')

function Barcode({ value }: { value: string }) {
  const widths = code128(value)
  const total = widths.reduce((sum, width) => sum + width, 0) + 20
  let x = 10
  return <svg className="lb-barcode" viewBox={`0 0 ${total} 60`} preserveAspectRatio="none" role="img" aria-label={`بارکد ${value}`}>
    <rect width={total} height="60" fill="#fff" />
    {widths.map((width, index) => { const bar = index % 2 === 0 ? <rect key={index} x={x} y="0" width={width} height="60" fill="#000" /> : null; x += width; return bar })}
  </svg>
}

function Labels() {
  const ids = useSearchParams().get('ids') || ''
  const [rows, setRows] = useState<Label[] | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    fetch(`/api/admin/shipping/shipments?ids=${encodeURIComponent(ids)}`, { cache: 'no-store' }).then((r) => r.json().then((data) => ({ ok: r.ok, data }))).then(({ ok, data }) => {
      if (!ok) { setError(data?.error || 'بارگذاری انجام نشد'); return }
      setRows(data.rows)
    }).catch(() => setError('ارتباط برقرار نشد'))
  }, [ids])
  if (error) return <p className="lb-error">{error}</p>
  if (!rows) return <p className="lb-error">در حال بارگذاری…</p>
  return <div className="lb-page" dir="rtl">
    <div className="lb-toolbar"><b>{fa(rows.length)} برچسب</b><span>اندازهٔ هر برچسب A6 (۱۰×۱۵ سانتی‌متر)</span><button type="button" onClick={() => window.print()}>چاپ</button></div>
    <div className="lb-sheet">
      {rows.map((row) => <article key={row.id} className="lb-label">
        <header><b>{row.carrierName}</b><span>سفارش {fa(row.orderId)}</span></header>
        <div className="lb-code"><Barcode value={row.waybill} /><span dir="ltr">{row.waybill}</span></div>
        <section className="lb-to">
          <h3>گیرنده</h3>
          <p className="lb-name">{row.receiver.name}</p>
          <p>{[row.receiver.province, row.receiver.city].filter(Boolean).join('، ')}</p>
          <p>{row.receiver.address}</p>
          <p className="lb-meta"><span>کد پستی: <b dir="ltr">{row.receiver.postalCode || '—'}</b></span><span>تلفن: <b dir="ltr">{row.receiver.phone || '—'}</b></span></p>
        </section>
        <section className="lb-from">
          <h3>فرستنده</h3>
          <p>{row.sender.name} · <span dir="ltr">{row.sender.phone}</span></p>
          <p>{[row.sender.province, row.sender.city, row.sender.address].filter(Boolean).join('، ')}{row.sender.postalCode && ` · کد پستی ${row.sender.postalCode}`}</p>
        </section>
        <footer><span>وزن: <b>{fa(row.weightGrams / 1000)}</b> کیلوگرم</span><span>بسته: <b>{fa(row.parcels)}</b></span>{row.trackingCode && <span dir="ltr">{row.trackingCode}</span>}</footer>
      </article>)}
    </div>
  </div>
}

export default function LabelsPage() {
  return <Suspense fallback={null}><Labels /></Suspense>
}
