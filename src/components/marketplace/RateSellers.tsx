'use client'

import { useEffect, useState } from 'react'
import Link from '@/components/AppLink'
import RatingTiles from '@/components/engage/RatingTiles'

type Seller = { id: number; shopName: string; slug: string; logo: string; reviewed: number | null }
const CRITERIA = [['onTime', 'ارسال به‌موقع'], ['asDescribed', 'مطابقت با توضیحات'], ['packaging', 'بسته‌بندی']] as const

function Stars({ value, onChange, label }: { value: number; onChange: (value: number) => void; label: string }) {
  return <RatingTiles value={value} onChange={onChange} label={label} size="sm" />
}

function RateOne({ orderId, seller, onDone }: { orderId: number; seller: Seller; onDone: () => void }) {
  const [rating, setRating] = useState(0)
  const [criteria, setCriteria] = useState<Record<string, number>>({})
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit() {
    setBusy(true); setError('')
    const response = await fetch('/api/store/seller-review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId, sellerId: seller.id, rating, criteria, body }) }).catch(() => null)
    const data = await response?.json().catch(() => null)
    setBusy(false)
    if (response?.ok) onDone(); else setError(data?.error || 'ثبت نشد')
  }
  return <div className="mk-rate-card">
    <div className="mk-rate-head"><Link href={`/shop/${seller.slug}`}><b>{seller.shopName}</b></Link><Stars value={rating} onChange={setRating} label={`امتیاز کلی به ${seller.shopName}`} /></div>
    {rating > 0 && <>
      <div className="mk-rate-criteria">{CRITERIA.map(([key, label]) => <label key={key}><span>{label}</span><Stars value={criteria[key] || 0} onChange={(value) => setCriteria({ ...criteria, [key]: value })} label={label} /></label>)}</div>
      <textarea className="textarea" rows={2} value={body} onChange={(e) => setBody(e.target.value)} maxLength={1000} placeholder="تجربهٔ خرید از این فروشنده (اختیاری)" aria-label="توضیح" />
      <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void submit()}>{busy ? '…' : 'ثبت امتیاز'}</button>
    </>}
    {error && <p className="error-text" role="alert">{error}</p>}
  </div>
}

/** After delivery, the buyer rates each marketplace seller of the order once. */
export default function RateSellers({ orderId }: { orderId: number }) {
  const [sellers, setSellers] = useState<Seller[]>([])
  const load = () => fetch(`/api/store/seller-review?orderId=${orderId}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : { sellers: [] })).then((data) => setSellers(data.sellers || [])).catch(() => undefined)
  useEffect(() => { void load() }, [orderId]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!sellers.length) return null
  return <section className="sx-my-card mk-rate-box">
    <h2>امتیاز به فروشنده</h2>
    {sellers.map((seller) => seller.reviewed ? <p key={seller.id} className="mk-rate-done">✓ به {seller.shopName} امتیاز {seller.reviewed.toLocaleString('fa-IR')} دادید. سپاس!</p> : <RateOne key={seller.id} orderId={orderId} seller={seller} onDone={() => void load()} />)}
  </section>
}
