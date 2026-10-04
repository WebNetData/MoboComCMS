'use client'

import { useEffect, useState } from 'react'
import { formatMoney } from '@/shared/money'
import type { ProductPriceHistory as History } from '@/modules/catalog/server/price-history-read'

export default function ProductPriceHistory({ slug, variants, fa }: { slug: string; variants: { id: number; name: string }[]; fa: boolean }) {
  const [variantId, setVariantId] = useState(0)
  const [history, setHistory] = useState<History | null>(null)
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setHistory(null); setError(false)
    void fetch(`/api/products/${encodeURIComponent(slug)}/tabs?tab=price-history&variantId=${variantId}`, { signal: controller.signal, cache: 'no-store' })
      .then(async response => { if (!response.ok) throw Error('history unavailable'); return response.json() as Promise<History> })
      .then(data => { if (!controller.signal.aborted) setHistory(data) })
      .catch(() => { if (!controller.signal.aborted) setError(true) })
    return () => controller.abort()
  }, [slug, variantId, retry])
  const locale = fa ? 'fa-IR' : 'en-US'
  const date = (value: string) => new Date(value).toLocaleString(locale, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  const points = history?.items || []
  const amounts = points.map(point => BigInt(point.amountMinor))
  const min = amounts.reduce((a, b) => a < b ? a : b, amounts[0] || 0n)
  const max = amounts.reduce((a, b) => a > b ? a : b, amounts[0] || 0n)
  // Only relative chart coordinates become numbers; exact prices remain strings/BigInt.
  const line = amounts.map((value, index) => `${20 + (points.length > 1 ? index * 560 / (points.length - 1) : 280)},${max === min ? 90 : 160 - Number((value - min) * 140n / (max - min))}`).join(' ')
  return <div className="store-price-history">
    <p className="store-history-note">{fa ? 'قیمت عادیِ عرضه‌شده از زمان شروع ثبت؛ قیمت ویژهٔ اعضا و تغییرات منتشرنشده در این نمودار نیست.' : 'Regular public prices since recording began. Member prices and unpublished changes are excluded.'}</p>
    {variants.length > 0 && <label className="store-history-select">{fa ? 'مدل محصول' : 'Product variant'}<select className="input" value={variantId} onChange={event => setVariantId(Number(event.target.value))}>
      <option value={0}>{fa ? 'قیمت پایهٔ محصول' : 'Base product price'}</option>
      {variants.map(variant => <option key={variant.id} value={variant.id}>{variant.name}</option>)}
    </select></label>}
    <div aria-live="polite" aria-busy={!history && !error}>
      {error ? <p role="alert" className="store-form-message">{fa ? 'تاریخچه بارگذاری نشد.' : 'History could not load.'} <button type="button" className="btn btn-ghost" onClick={() => setRetry(value => value + 1)}>{fa ? 'تلاش دوباره' : 'Retry'}</button></p>
        : !history ? <p role="status">{fa ? 'در حال بارگذاری…' : 'Loading…'}</p>
          : !points.length ? <p className="store-panel-empty">{fa ? 'هنوز قیمتی در این بازه ثبت نشده است.' : 'No price observations in this period yet.'}</p>
            : <>
              <p>{fa ? `آخرین ${history.days.toLocaleString(locale)} روز` : `Last ${history.days.toLocaleString(locale)} days`}{history.truncated && (fa ? '؛ فقط ۱۲۰ تغییر آخر نمایش داده می‌شود.' : '; showing only the latest 120 changes.')}</p>
              <svg className="store-history-chart" viewBox="0 0 600 180" role="img" aria-label={fa ? 'روند قیمت از قدیمی به جدید؛ مقادیر دقیق در جدول زیر' : 'Prices from oldest to newest; exact values in the table below'}>
                <path d="M20 20V160H580" fill="none" stroke="currentColor" opacity=".3" />
                {points.length > 1 ? <polyline points={line} fill="none" stroke="currentColor" strokeWidth="3" /> : <circle cx="300" cy="90" r="5" fill="currentColor" />}
              </svg>
              <div className="store-history-table" role="region" aria-label={fa ? 'قیمت‌های ثبت‌شده' : 'Recorded prices'} tabIndex={0}>
                <table><caption>{fa ? 'تاریخچهٔ قیمت، از قدیمی به جدید' : 'Price history, oldest to newest'}</caption><thead><tr><th scope="col">{fa ? 'زمان ثبت' : 'Recorded at'}</th><th scope="col">{fa ? 'قیمت' : 'Price'}</th></tr></thead><tbody>
                  {points.map(point => <tr key={point.id}><td><time dateTime={point.recordedAt}>{date(point.recordedAt)}</time></td><td className="num">{formatMoney(point.amountMinor, history.currency, locale)}</td></tr>)}
                </tbody></table>
              </div>
            </>}
    </div>
  </div>
}
