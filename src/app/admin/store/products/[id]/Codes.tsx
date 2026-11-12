'use client'

import { useState } from 'react'
import Link from '@/components/AppLink'
import { Notice, fa, faDate, send, useJson } from '../../shared'

type Pool = {
  kind: string; mode: 'MANUAL' | 'CODES'; whenEmpty: 'STOP' | 'STAFF'; stock: number; available: number; delivered: number; returned: number
  variants: { id: number; name: string; stock: number }[]
  shelf: { id: number; variant: string; code: string; createdAt: string }[]
  recent: { id: number; variant: string; code: string; orderId: number; deliveredAt: string; returnedAt: string | null; note: string }[]
}

/**
 * The code pool of a virtual product: gift cards, licence keys and the like. With the pool on, a paid
 * order receives its code by itself and the product can only be sold while a code is on the shelf.
 */
export default function ProductCodes({ productId, onStock }: { productId: number; onStock?: (stock: number, mode: 'MANUAL' | 'CODES') => void }) {
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
    if (typeof result.data.stock === 'number') onStock?.(result.data.stock, result.data.mode === 'CODES' || result.data.mode === 'MANUAL' ? result.data.mode : data?.mode ?? 'MANUAL')
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
  const on = data.mode === 'CODES', staff = data.whenEmpty === 'STAFF'
  const lines = text.split(/\r?\n/).filter((line) => line.trim()).length

  return <section id="sa-codes" className="sa-card">
    <header className="sa-card-head">
      <h2>تحویل خودکار کد</h2>
      <span className={`sa-state ${on ? (data.available ? 'is-ok' : staff ? '' : 'is-bad') : ''}`}>{on ? (data.available ? `${fa(data.available)} کد روی قفسه` : staff ? 'قفسه خالی؛ تحویل با کارشناس' : 'قفسه خالی است') : 'تحویل دستی'}</span>
    </header>
    <p className="sa-sub">{on
      ? staff
        ? 'با پرداخت هر سفارش، اگر کدی روی قفسه باشد خودکار تحویل می‌شود؛ اگر نباشد، سفارش در صف سفارش‌ها می‌ماند تا کارشناس آن را بردارد، آماده کند و تحویل دهد. فروش محدود به تعداد کدها نیست.'
        : 'با پرداخت هر سفارش، کد از همین قفسه برداشته و به خریدار تحویل می‌شود. موجودی محصول همان تعداد کدهای روی قفسه است و دستی تغییر نمی‌کند.'
      : 'الان هر سفارش این محصول را باید کارمند فروشگاه دستی تحویل دهد. اگر کالا کد، لایسنس یا گیفت‌کارت است، قفسهٔ کد را روشن کنید تا تحویل، آنی و خودکار شود.'}</p>
    {message && <Notice tone={message.tone}>{message.text}</Notice>}
    <div className="sa-head-actions">
      <button type="button" className={`btn btn-sm ${on ? 'btn-ghost' : 'btn-primary'}`} disabled={busy} onClick={() => {
        if (on && !window.confirm('تحویل خودکار خاموش شود؟ کدهای روی قفسه می‌مانند و محصول دوباره با تحویل دستی و بدون محدودیت موجودی فروخته می‌شود.')) return
        void act({ action: 'mode', mode: on ? 'MANUAL' : 'CODES' }, () => on ? 'تحویل خودکار خاموش شد.' : 'تحویل خودکار روشن شد. تا وقتی کدی اضافه نکنید، محصول ناموجود است.')
      }}>{on ? 'خاموش کردن تحویل خودکار' : 'روشن کردن تحویل خودکار'}</button>
      {on && <label className="sa-field"><span>وقتی کد آماده تمام شد</span>
        <select className="select" value={data.whenEmpty} disabled={busy} onChange={(event) => void act({ action: 'empty', value: event.target.value }, (result) => result.codesWhenEmpty === 'STAFF' ? 'فروش ادامه دارد؛ سفارش بدون کد به کارشناس سپرده می‌شود.' : 'فروش به تعداد کدهای روی قفسه محدود شد.')}>
          <option value="STOP">فروش متوقف شود (موجودی = تعداد کدها)</option>
          <option value="STAFF">فروش ادامه یابد و کارشناس تحویل دهد</option>
        </select>
      </label>}
      <small className="sa-sub">دستِ خریداران: {fa(data.delivered)}{data.returned > 0 ? ` · پس‌گرفته‌شده: ${fa(data.returned)}` : ''}</small>
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
        <p className="sa-sub">کدی که برای خریدار کار نکرده را می‌توانید جایگزین کنید: کد قبلی باطل می‌شود و یک کد از قفسه به همان سفارش می‌رسد. برگشتِ پول از بخش مرجوعی‌ها انجام می‌شود.</p>
        <ul className="sa-rows">{data.recent.map((row) => <li key={row.id} className="sa-code-row">
          <Link href={`/admin/store/orders/${row.orderId}`}><span className="sa-grow"><b dir="ltr">{row.code}</b><small>سفارش {fa(row.orderId)}{row.variant ? ` · ${row.variant}` : ''}{row.returnedAt ? ` · پس گرفته شد${row.note ? ` (${row.note})` : ''}` : ''}</small></span><small className="sa-sub">{row.deliveredAt ? faDate(row.deliveredAt, true) : ''}</small></Link>
          {!row.returnedAt && <button type="button" className="sa-link" disabled={busy || !data.available} title={data.available ? '' : 'کدی روی قفسه نیست'} onClick={() => {
            const note = window.prompt('این کد باطل و یک کد تازه از قفسه به همین سفارش داده شود؟ دلیل (اختیاری):', '')
            if (note !== null) void act({ action: 'replace', codeId: row.id, note }, () => 'کد جایگزین شد و به خریدار خبر داده شد.')
          }}>جایگزینی</button>}
        </li>)}</ul>
      </details>}
    </>}
  </section>
}
