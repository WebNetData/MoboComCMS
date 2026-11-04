'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import Link from '@/components/AppLink'
import Icon from '@/components/site/Icon'
import { startCheckout, type CheckoutGatewayChoice } from '@/modules/checkout/ui/client'
import { HOSTING_CYCLES, HOURS_PER_MONTH, kindMeta, type PublicHostingProduct } from '@/modules/hosting/domain/catalog'

const nf = (value: number) => Math.round(value).toLocaleString('fa-IR')
const newKey = () => `web-hourly-${typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`

/**
 * The order sheet of one plan: term (hourly from the wallet, or a fixed term), domain or hostname, payment method.
 * A fixed term goes through checkout (wallet first, then gateway); hourly needs only enough wallet credit and is
 * charged as it runs. The server prices everything again.
 */
export default function HostingOrder({ product, cycle, gateways, signedIn, minHours, onClose }: { product: PublicHostingProduct; cycle: string; gateways: CheckoutGatewayChoice[]; signedIn: boolean; minHours: number; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const terms = product.prices
  const [term, setTerm] = useState(terms.some((price) => price.cycle === cycle) ? cycle : terms.find((price) => price.cycle === 'MONTH')?.cycle || terms[0]?.cycle || '')
  const [name, setName] = useState('')
  const [gatewayRef, setGatewayRef] = useState(gateways.find((gateway) => gateway.isDefault)?.ref || gateways[0]?.ref || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<{ text: string; wallet?: boolean } | null>(null)
  const lock = useRef(false)
  // One key per opened sheet: a double click or a retried request makes one hourly service.
  const hourlyKey = useRef(newKey())
  const web = kindMeta(product.kind)?.group === 'hosting'
  const price = terms.find((row) => row.cycle === term)
  const hourly = term === 'HOURLY'

  // Opened once; leaving the page removes the element, which closes it. Closing here as cleanup would fire `close`
  // and unmount the sheet straight after it opened (React runs effects twice in development).
  useEffect(() => { const node = dialog.current; if (node && !node.open) node.showModal() }, [])

  async function orderHourly() {
    const response = await fetch('/api/hosting/hourly', { method: 'POST', headers: { 'content-type': 'application/json', 'Idempotency-Key': hourlyKey.current }, body: JSON.stringify({ productId: product.id, hostingName: name.trim() }) })
    const data = await response.json().catch(() => null)
    if (response.ok && data?.serviceId) { window.location.assign(`/dashboard/services/${data.serviceId}`); return }
    setError({ text: String(data?.error || 'سفارش ثبت نشد'), wallet: data?.code === 'INSUFFICIENT_FUNDS' })
  }

  async function order(event: FormEvent) {
    event.preventDefault()
    if (lock.current || !price) return
    lock.current = true; setBusy(true); setError(null)
    try {
      if (hourly) { await orderHourly(); return }
      const result = await startCheckout({ hostingProductId: product.id, hostingCycle: term, hostingName: name.trim(), gatewayRef: gatewayRef || undefined })
      if (!result.ok) {
        if (result.code === 'GATEWAY_AMBIGUOUS' && result.invoiceUrl) { window.location.assign(result.invoiceUrl); return }
        setError({ text: result.code === 'NEED_LOGIN' ? 'برای سفارش ابتدا وارد حساب خود شوید.' : result.code === 'NO_GATEWAY' || result.code === 'INSUFFICIENT_FUNDS' ? 'موجودی کیف پول کافی نیست و درگاه پرداختی فعال نیست.' : result.message || 'سفارش ثبت نشد', wallet: result.code === 'INSUFFICIENT_FUNDS' })
        return
      }
      const destination = result.paid ? `/payment/result?invoice=${encodeURIComponent(result.invoiceNumber)}` : result.paymentUrl || result.invoiceUrl
      if (destination) window.location.assign(destination)
    } catch {
      setError({ text: 'ارتباط با سرور برقرار نشد؛ دوباره امتحان کنید.' })
    } finally {
      lock.current = false; setBusy(false)
    }
  }

  return <dialog ref={dialog} className="hx-order" aria-labelledby="hx-order-title" onClose={onClose} onClick={(event) => { if (event.target === dialog.current) dialog.current?.close() }}>
    <form method="dialog" className="hx-order-body" onSubmit={(event) => void order(event)}>
      <header className="hx-order-head">
        <span className="hx-plan-kind">{product.kindLabel}</span>
        <h2 id="hx-order-title">سفارش {product.name}</h2>
        <button type="button" className="hx-order-close" aria-label="بستن" onClick={() => dialog.current?.close()}><Icon name="close" size={18} /></button>
      </header>
      <fieldset className="hx-order-terms">
        <legend>دورهٔ پرداخت</legend>
        <div>{terms.map((row) => {
          const meta = HOSTING_CYCLES.find((item) => item.id === row.cycle)
          return <label key={row.cycle} className={`${term === row.cycle ? 'is-on' : ''}${row.cycle === 'HOURLY' ? ' is-hourly' : ''}`}>
            <input type="radio" name="term" checked={term === row.cycle} onChange={() => { setTerm(row.cycle); setError(null) }} />
            <b>{meta?.label}{row.cycle === 'HOURLY' && <Icon name="bolt" size={13} />}</b>
            <span className="num">{nf(row.amount)} تومان{row.cycle === 'HOURLY' ? ' / ساعت' : ''}</span>
            {row.cycle === 'HOURLY' ? <em>بدون پیش‌پرداخت</em> : row.saving > 0 && <em>{nf(row.saving)}٪ صرفه‌جویی</em>}
          </label>
        })}</div>
      </fieldset>
      <label className="hx-order-field"><span>{web ? 'دامنهٔ سایت *' : 'نام میزبان (اختیاری)'}</span>
        <input className="input" dir="ltr" required={web} value={name} maxLength={253} inputMode="url" autoComplete="off" spellCheck={false} placeholder={web ? 'example.ir' : 'server1.example.ir'} onChange={(event) => setName(event.target.value)} />
        <small>{web ? 'دامنه‌ای که روی این هاست راه‌اندازی می‌شود؛ اگر هنوز دامنه ندارید، دامنهٔ موردنظرتان را بنویسید.' : 'اگر خالی بماند، شمارهٔ سرویس استفاده می‌شود.'}</small>
      </label>
      {signedIn && !hourly && gateways.length > 1 && <label className="hx-order-field"><span>درگاه پرداخت</span><select className="input" value={gatewayRef} onChange={(event) => setGatewayRef(event.target.value)}>{gateways.map((gateway) => <option key={gateway.ref} value={gateway.ref}>{gateway.label}</option>)}</select></label>}
      {price && (hourly
        ? <div className="hx-order-total is-hourly">
          <span>هزینهٔ ساعتی</span>
          <b className="num">{nf(price.amount)} تومان</b>
          <small>اگر تمام ماه روشن بماند حدود {nf(price.amount * HOURS_PER_MONTH)} تومان. هر ساعت پس از اجرا از کیف پول کم می‌شود و با حذف سرویس متوقف می‌شود.</small>
          <small>برای شروع، موجودی کیف پول باید دست‌کم هزینهٔ {nf(minHours)} ساعت ({nf(price.amount * minHours)} تومان) باشد.</small>
        </div>
        : <div className="hx-order-total">
          <span>مبلغ قابل پرداخت</span>
          <b className="num">{nf(price.amount + price.setup)} تومان</b>
          {price.setup > 0 && <small>شامل {nf(price.setup)} تومان هزینهٔ راه‌اندازی یک‌باره</small>}
          <small>ابتدا از موجودی کیف پول استفاده می‌شود و باقی مبلغ با درگاه پرداخت می‌شود.</small>
        </div>)}
      {error && <p className="hx-order-error" role="alert">{error.text}{error.wallet && <> <Link href="/dashboard/wallet">شارژ کیف پول</Link></>}</p>}
      {signedIn
        ? <button type="submit" className="btn btn-primary hx-order-pay" disabled={busy || !price}>{busy ? 'در حال ثبت…' : hourly ? 'ساخت سرویس ساعتی' : 'پرداخت و سفارش'}</button>
        : <Link className="btn btn-primary hx-order-pay" href={`/login?next=${encodeURIComponent(web ? '/hosting' : '/servers')}`}>ورود برای سفارش</Link>}
    </form>
  </dialog>
}
