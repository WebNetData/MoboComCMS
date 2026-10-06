'use client'

import { useState } from 'react'
import Link from '@/components/AppLink'
import { Notice, fa, faDate, send, useJson } from '../../shared'

type Pool = {
  kind: string; mode: 'MANUAL' | 'CODES'; stock: number; available: number; delivered: number
  variants: { id: number; name: string; stock: number }[]
  shelf: { id: number; variant: string; code: string; createdAt: string }[]
  recent: { id: number; variant: string; code: string; orderId: number; deliveredAt: string }[]
}

/**
 * The code pool of a virtual product: gift cards, licence keys and the like. With the pool on, a paid
 * order receives its code by itself and the product can only be sold while a code is on the shelf.
 */
export default function ProductCodes({ productId, onStock }: { productId: number; onStock?: (stock: number) => void }) {
  const url = `/api/admin/store/products/${productId}/codes`
  const { data, error, reload } = useJson<Pool>(url)
  const [text, setText] = useState('')
  const [variantId, setVariantId] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  async function act(body: Record<string, unknown>, done: (result: Record<string, unknown>) => string) {
    setBusy(true); setMessage(null)
    const result = await send<Record<string, unknown>>(url, 'POST', body)
    setBusy(false)
    if (!result.ok) { setMessage({ tone: 'error', text: result.error }); return false }
    setMessage({ tone: 'ok', text: done(result.data) })
    if (typeof result.data.stock === 'number') onStock?.(result.data.stock)
    await reload()
    return true
  }

  const add = () => act({ action: 'add', text, variantId: variantId || null }, (result) => {
    setText('')
    const parts = [`${fa(Number(result.added) || 0)} کد اضافه شد`]
    if (Number(result.existing)) parts.push(`${fa(Number(result.existing))} کد از قبل ثبت بود`)
    if (Number(result.repeated)) parts.push(`${fa(Number(result.repeated))} خط تکراری بود`)
    if (Number(result.deliveredWaiting)) parts.push(`${fa(Number(result.deliveredWaiting))} سفارشِ منتظر، همین حالا تحویل شد`)
    return `${parts.join('؛ ')}.`
  })

  if (error) return <section id="sa-codes" className="sa-card"><header className="sa-card-head"><h2>تحویل خودکار کد</h2></header><Notice tone="error">{error}</Notice></section>
  if (!data) return null
  if (data.kind !== 'VIRTUAL') return null
  const on = data.mode === 'CODES'
  const lines = text.split(/\r?\n/).filter((line) => line.trim()).length

  return <section id="sa-codes" className="sa-card">
    <header className="sa-card-head">
      <h2>تحویل خودکار کد</h2>
      <span className={`sa-state ${on ? (data.available ? 'is-ok' : 'is-bad') : ''}`}>{on ? (data.available ? `${fa(data.available)} کد روی قفسه` : 'قفسه خالی است') : 'تحویل دستی'}</span>
    </header>
    <p className="sa-sub">{on
      ? 'با پرداخت هر سفارش، کد از همین قفسه برداشته و به خریدار تحویل می‌شود. موجودی محصول همان تعداد کدهای روی قفسه است و دستی تغییر نمی‌کند.'
      : 'الان هر سفارش این محصول را باید کارمند فروشگاه دستی تحویل دهد. اگر کالا کد، لایسنس یا گیفت‌کارت است، قفسهٔ کد را روشن کنید تا تحویل، آنی و خودکار شود.'}</p>
    {message && <Notice tone={message.tone}>{message.text}</Notice>}
    <div className="sa-head-actions">
      <button type="button" className={`btn btn-sm ${on ? 'btn-ghost' : 'btn-primary'}`} disabled={busy} onClick={() => {
        if (on && !window.confirm('تحویل خودکار خاموش شود؟ کدهای روی قفسه می‌مانند و محصول دوباره با تحویل دستی و بدون محدودیت موجودی فروخته می‌شود.')) return
        void act({ action: 'mode', mode: on ? 'MANUAL' : 'CODES' }, () => on ? 'تحویل خودکار خاموش شد.' : 'تحویل خودکار روشن شد. تا وقتی کدی اضافه نکنید، محصول ناموجود است.')
      }}>{on ? 'خاموش کردن تحویل خودکار' : 'روشن کردن تحویل خودکار'}</button>
      <small className="sa-sub">تحویل‌شده تا امروز: {fa(data.delivered)}</small>
    </div>

    {on && <>
      {/* Not a <form>: this section sits inside the product form, and a form cannot hold another. */}
      <div className="mq-item">
        <label className="sa-field"><span>افزودن کد (هر خط یک کد)</span>
          <textarea className="input" dir="ltr" rows={5} value={text} onChange={(event) => setText(event.target.value)} placeholder={'XXXX-XXXX-XXXX\nYYYY-YYYY-YYYY'} spellCheck={false} autoComplete="off" />
        </label>
        <div className="mq-foot">
          {data.variants.length > 0 ? <label className="sa-field"><span>این کدها برای کدام تنوع است؟</span>
            <select className="select" value={variantId} onChange={(event) => setVariantId(event.target.value)}>
              <option value="">انتخاب تنوع…</option>
              {data.variants.map((variant) => <option key={variant.id} value={variant.id}>{variant.name} ({fa(Math.max(0, variant.stock))} کد)</option>)}
            </select>
          </label> : <small className="sa-sub">کدها رمزنگاری‌شده ذخیره می‌شوند و فقط به خریدار همان سفارش نشان داده می‌شوند.</small>}
          <button type="button" className="btn btn-primary btn-sm" disabled={busy || !lines || (data.variants.length > 0 && !variantId)} onClick={() => void add()}>{lines ? `افزودن ${fa(lines)} کد` : 'افزودن'}</button>
        </div>
      </div>

      {data.shelf.length > 0 && <div className="sa-table-wrap"><table className="data sa-table" style={{ minWidth: 0 }}>
        <thead><tr><th>کد روی قفسه</th>{data.variants.length > 0 && <th>تنوع</th>}<th>ثبت</th><th /></tr></thead>
        <tbody>{data.shelf.map((row) => <tr key={row.id}>
          <td dir="ltr" className="num">{row.code}</td>
          {data.variants.length > 0 && <td>{row.variant || '—'}</td>}
          <td>{faDate(row.createdAt)}</td>
          <td><button type="button" className="sa-link is-danger" disabled={busy} onClick={() => { if (window.confirm('این کد از قفسه برداشته شود؟')) void act({ action: 'remove', codeId: row.id }, () => 'کد از قفسه برداشته شد.') }}>حذف</button></td>
        </tr>)}</tbody>
      </table>{data.available > data.shelf.length && <p className="sa-sub">و {fa(data.available - data.shelf.length)} کد دیگر</p>}</div>}

      {data.recent.length > 0 && <details><summary className="sa-link">آخرین تحویل‌ها</summary>
        <ul className="sa-rows">{data.recent.map((row) => <li key={row.id}><Link href={`/admin/store/orders/${row.orderId}`}><span className="sa-grow"><b dir="ltr">{row.code}</b><small>سفارش {fa(row.orderId)}{row.variant ? ` · ${row.variant}` : ''}</small></span><small className="sa-sub">{row.deliveredAt ? faDate(row.deliveredAt, true) : ''}</small></Link></li>)}</ul>
      </details>}
    </>}
  </section>
}
