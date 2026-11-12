'use client'
import { useEffect, useState } from 'react'
import { StoreShell, Notice, useJson } from '../shared'
import Barcode from '@/components/store/Barcode'
import './labels.css'

type Label = { id: string; name: string; barcode: string; sku: string; price: string; url: string; qr: string }

/** Shelf labels: name, retail price, barcode for the scanner and a QR to the product page. Printing never changes stock. */
export default function Labels() {
  const [query, setQuery] = useState('')
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [product, setProduct] = useState('')
  const [withQr, setWithQr] = useState(true)
  useEffect(() => { setProduct(new URLSearchParams(window.location.search).get('product') || '') }, [])
  const { data, error, loading } = useJson<{ labels: Label[] }>(`/api/admin/store/counter?labels=1&q=${encodeURIComponent(query)}${product ? `&product=${encodeURIComponent(product)}` : ''}`)
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0)
  return <StoreShell title="برچسب قفسه و بارکد" actions={<button className="btn btn-primary" type="button" disabled={!total} onClick={() => window.print()}>{total ? `چاپ ${total.toLocaleString('fa-IR')} برچسب` : 'چاپ برچسب'}</button>}>
    <div className="sa-card lb-tools sa-noprint">
      <label className="sa-field"><span>جست‌وجوی نام یا کد کالا</span><input className="input" type="search" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <label className="lb-check"><input type="checkbox" checked={withQr} onChange={(event) => setWithQr(event.target.checked)} />QR صفحهٔ محصول روی برچسب (نظرها، مشخصات و موجودی آنلاین)</label>
      <p className="sa-hint">هر گونه بارکد مستقل دارد. تعداد برچسب هر ردیف را بنویسید؛ چاپ برچسب موجودی را تغییر نمی‌دهد.</p>
    </div>
    {error && <Notice tone="error">{error}</Notice>}
    {loading && !data && <p className="sa-hint" role="status">در حال دریافت…</p>}
    <div className="lb-picks sa-noprint">{data?.labels.map((row) => <label className="lb-pick" key={row.id}>
      <span><b>{row.name}</b><small>{row.price || 'بدون قیمت'}{row.sku && <> · <bdi dir="ltr">{row.sku}</bdi></>}</small></span>
      <input className="input" type="number" inputMode="numeric" min={0} max={50} aria-label={`تعداد برچسب ${row.name}`} value={counts[row.id] || 0} onChange={(event) => setCounts({ ...counts, [row.id]: Math.min(50, Math.max(0, Math.floor(Number(event.target.value) || 0))) })} />
    </label>)}</div>
    {total > 0 && <h2 className="lb-preview-title sa-noprint">پیش‌نمایش چاپ</h2>}
    <div className="store-label-sheet">{data?.labels.flatMap((row) => Array.from({ length: counts[row.id] || 0 }, (_, index) => <section className={`store-shelf-label${withQr ? '' : ' is-plain'}`} key={`${row.id}:${index}`} aria-label={row.name}>
      <div className="ssl-main">
        <b className="ssl-name">{row.name}</b>
        {row.price && <strong className="ssl-price">{row.price}</strong>}
        <div className="ssl-code"><Barcode value={row.barcode} /><bdi dir="ltr">{row.barcode}</bdi></div>
      </div>
      {withQr && <div className="ssl-qr"><img src={row.qr} alt="" width={72} height={72} /><small>اسکن برای مشخصات</small></div>}
    </section>))}</div>
  </StoreShell>
}
