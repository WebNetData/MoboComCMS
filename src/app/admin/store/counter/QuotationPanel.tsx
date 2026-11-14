'use client'
import { useEffect, useRef, useState } from 'react'
import Link from '@/components/AppLink'
import type { CounterCustomer, CounterProduct, CounterLine } from '@/modules/store/domain/counter-sales'
import { formatMoney } from '@/shared/money'

export type QuotationContext = { id: number; fingerprint: string; customer: CounterCustomer; items: (CounterLine & { product: CounterProduct; variantName: string })[] }
export default function QuotationPanel({ id, onLoaded }: { id: number; onLoaded: (value: QuotationContext) => void }) {
  const [error, setError] = useState(''), [summary, setSummary] = useState<{ title: string; currency: string; discountMinor: string; changed: boolean } | null>(null), [attempt, setAttempt] = useState(0)
  const callback = useRef(onLoaded)
  useEffect(() => { callback.current = onLoaded }, [onLoaded])
  useEffect(() => {
    const controller = new AbortController(); setError(''); setSummary(null)
    void (async () => {
      try {
        const response = await fetch(`/api/admin/store/quotations?id=${id}`, { cache: 'no-store', signal: controller.signal }), data = await response.json()
        if (!response.ok || !data?.preview?.available || !data.preview.cart) throw Error(data?.error || data?.preview?.reason || 'پیشنهاد قابل فروش نیست')
        if (controller.signal.aborted) return
        const products = data.products as CounterProduct[]
        const items = data.preview.cart.lines.map((line: { productId: number; variantId: number | null; quantity: number; unitMinor: string; variantName: string }) => {
          const product = products.find(row => row.id === line.productId)
          if (!product) throw Error('کالاهای پیشنهاد تغییر کرده‌اند')
          return { product, productId: line.productId, variantId: line.variantId, variantName: line.variantName, quantity: line.quantity, expectedUnitMinor: line.unitMinor, inputs: {} }
        })
        setSummary(data.preview); callback.current({ id, fingerprint: data.preview.fingerprint, customer: data.customer, items })
      } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'پیشنهاد دریافت نشد') }
    })()
    return () => controller.abort()
  }, [id, attempt])
  return <section className="sa-card" aria-label="فروش از پیش‌فاکتور"><h2>فروش از پیش‌فاکتور</h2>{error ? <p role="alert">{error} <button type="button" className="btn" onClick={() => setAttempt(n => n + 1)}>بررسی دوباره</button></p> : !summary ? <p role="status">در حال بررسی پیشنهاد…</p> : <><p>{summary.title} · تخفیف فروشنده: {formatMoney(BigInt(summary.discountMinor), summary.currency, 'fa-IR')}</p>{summary.changed && <p>قیمت از زمان تهیهٔ پیشنهاد تغییر کرده است؛ مبلغ فعلی را پیش از دریافت وجه کنترل کنید.</p>}<p>برای تغییر مشتری یا کالاهای این پیشنهاد، پیشنهاد تازه بسازید. کنترل سریال و دریافت مبلغ کامل فاکتور لازم است.</p></>}<Link href="/admin/store/quotations">پیش‌فاکتورهای فروش</Link></section>
}
