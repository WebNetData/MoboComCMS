'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from '@/components/AppLink'
import { formatCurrency } from '@/shared/money/client'
import './order-operations.css'

type ReorderLine = {
  sourceLineId: number; productId: number; variantId: number | null; slug: string; name: string; variantName: string
  quantity: number; currency: string; currentUnitPrice: number | null; priceChanged: boolean; availableQuantity: number; eligible: boolean
  needsReview: boolean; issue: string; productUrl: string
}
type Preview = { orderId: number; currency: string; lines: ReorderLine[] }
type AddResult = { added: number[]; skipped: { sourceLineId: number; reason: string }[]; cart: { count: number } }

const money = (amount: number | null, currency: string) => amount === null ? 'قیمت فعلی در دسترس نیست' : formatCurrency(amount, currency, 'fa-IR')

/** Customer-owned order preview; adding always goes through the live canonical cart. */
export function ReorderPanel({ orderId }: { orderId: number }) {
  const [preview, setPreview] = useState<Preview | null>(null)
  const [selected, setSelected] = useState<number[]>([])
  const [result, setResult] = useState<AddResult | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const submitted = useRef(false)

  const loadEpoch = useRef(0)
  const loadPreview = useCallback(async () => {
    const epoch = ++loadEpoch.current
    setLoading(true); setError(''); setResult(null); submitted.current = false
    try {
      const response = await fetch(`/api/store/orders/${orderId}/reorder`, { cache: 'no-store' })
      const data = await response.json().catch(() => null)
      if (!response.ok || !Array.isArray(data?.lines)) throw new Error(String(data?.error || 'پیش‌نمایش سفارش دریافت نشد'))
      if (epoch !== loadEpoch.current) return
      const next = data as Preview
      setPreview(next)
      setSelected(next.lines.filter(line => line.eligible).map(line => line.sourceLineId))
    } catch (cause) { if (epoch === loadEpoch.current) setError(cause instanceof Error ? cause.message : 'ارتباط برقرار نشد؛ دوباره تلاش کنید') }
    finally { if (epoch === loadEpoch.current) setLoading(false) }
  }, [orderId])

  useEffect(() => { void loadPreview(); return () => { loadEpoch.current++ } }, [loadPreview])

  function toggle(id: number) {
    setSelected(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id])
  }

  async function addSelected() {
    if (saving || submitted.current || !selected.length) return
    submitted.current = true
    setSaving(true); setError('')
    try {
      const response = await fetch(`/api/store/orders/${orderId}/reorder`, {
        method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceLineIds: selected }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok || !Array.isArray(data?.added)) throw new Error(String(data?.error || 'افزودن به سبد خرید انجام نشد'))
      setResult(data as AddResult)
      window.dispatchEvent(new CustomEvent('mc:cart', { detail: { count: Number(data?.cart?.count) || 0 } }))
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'وضعیت درخواست مشخص نیست؛ برای جلوگیری از افزودن تکراری، سفارش را تازه کنید') }
    finally { setSaving(false) }
  }

  return <section className="sx-my-card sx-reorder" aria-labelledby={`reorder-title-${orderId}`} dir="rtl">
    <div className="sx-panel-head">
      <div><h2 id={`reorder-title-${orderId}`}>سفارش دوباره</h2><p>قیمت و موجودی امروز بررسی می‌شود؛ پرداخت و تخفیف قبلی منتقل نمی‌شود.</p></div>
      {!loading && <button type="button" className="sx-btn" onClick={() => void loadPreview()} disabled={saving}>بررسی دوباره</button>}
    </div>
    {loading ? <p role="status">در حال بررسی قیمت و موجودی…</p> : error && !preview ? <div role="alert" className="sx-alert is-error">{error}</div> : null}
    {preview && <>
      <ul className="sx-reorder-lines">
        {preview.lines.map(line => <li key={`${line.sourceLineId}-${line.productId}`} className="sx-reorder-line">
          <div className="sx-reorder-choice">
            <input id={`reorder-${orderId}-${line.sourceLineId}`} type="checkbox" checked={selected.includes(line.sourceLineId)} disabled={!line.eligible || saving || !!result} onChange={() => toggle(line.sourceLineId)} />
            <label htmlFor={`reorder-${orderId}-${line.sourceLineId}`}>
              <span className="sx-reorder-name">{line.name}{line.variantName ? ` · ${line.variantName}` : ''}</span>
              <span className="sx-reorder-meta">تعداد {line.quantity.toLocaleString('fa-IR')} · قیمت فعلی هر عدد: {money(line.currentUnitPrice, line.currency)}</span>
              {line.priceChanged && <small>قیمت از زمان سفارش قبلی تغییر کرده است</small>}
            </label>
          </div>
          {line.issue ? <div className="sx-reorder-issue"><span>{line.issue}</span><Link href={line.productUrl}>رفتن به صفحهٔ کالا</Link></div> : line.availableQuantity < line.quantity ? <div className="sx-reorder-issue">موجودی فعلی: {line.availableQuantity.toLocaleString('fa-IR')}</div> : null}
        </li>)}
      </ul>
      {!preview.lines.length && <p>ردیفی برای سفارش مجدد در این سفارش پیدا نشد.</p>}
      {error && preview && <p role="alert" className="sx-alert is-error">{error}</p>}
      {result ? <div role="status" className="sx-reorder-result">
        <p>{result.added.length ? `${result.added.length.toLocaleString('fa-IR')} ردیف به سبد خرید اضافه شد.` : 'کالایی به سبد خرید اضافه نشد.'} سبد خرید با قیمت روز آمادهٔ بررسی است.</p>
        {result.skipped.map(item => <p key={item.sourceLineId}>ردیف سفارش {item.sourceLineId.toLocaleString('fa-IR')}: {item.reason}</p>)}
        <Link className="sx-btn is-primary" href="/cart">بررسی سبد خرید</Link>
      </div> : <button type="button" className="sx-btn is-primary" onClick={() => void addSelected()} disabled={saving || !selected.length}>
        {saving ? 'در حال افزودن…' : `افزودن ${selected.length.toLocaleString('fa-IR')} ردیف به سبد`}
      </button>}
    </>}
  </section>
}
