'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import Link from '@/components/AppLink'
import Icon from '@/components/site/Icon'
import { startCheckout, type CheckoutGatewayChoice } from '@/modules/checkout/ui/client'
import { HOSTING_CYCLES, kindMeta, type PublicHostingProduct } from '@/modules/hosting/domain/catalog'

const nf = (value: number) => Math.round(value).toLocaleString('fa-IR')

/**
 * The order sheet of one plan: term, domain or hostname, payment method. Checkout prices it again on the server and
 * pays from the wallet first, then the gateway; the customer lands on the payment or the result page.
 */
export default function HostingOrder({ product, cycle, gateways, signedIn, onClose }: { product: PublicHostingProduct; cycle: string; gateways: CheckoutGatewayChoice[]; signedIn: boolean; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const terms = product.prices.filter((price) => price.cycle !== 'HOURLY')
  const [term, setTerm] = useState(terms.some((price) => price.cycle === cycle) ? cycle : terms[0]?.cycle || '')
  const [name, setName] = useState('')
  const [gatewayRef, setGatewayRef] = useState(gateways.find((gateway) => gateway.isDefault)?.ref || gateways[0]?.ref || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const lock = useRef(false)
  const web = kindMeta(product.kind)?.group === 'hosting'
  const price = terms.find((row) => row.cycle === term)

  // Opened once; leaving the page removes the element, which closes it. Closing here as cleanup would fire `close`
  // and unmount the sheet straight after it opened (React runs effects twice in development).
  useEffect(() => { const node = dialog.current; if (node && !node.open) node.showModal() }, [])

  async function order(event: FormEvent) {
    event.preventDefault()
    if (lock.current || !price) return
    lock.current = true; setBusy(true); setError('')
    try {
      const result = await startCheckout({ hostingProductId: product.id, hostingCycle: term, hostingName: name.trim(), gatewayRef: gatewayRef || undefined })
      if (!result.ok) {
        if (result.code === 'GATEWAY_AMBIGUOUS' && result.invoiceUrl) { window.location.assign(result.invoiceUrl); return }
        setError(result.code === 'NEED_LOGIN' ? 'برای سفارش ابتدا وارد حساب خود شوید.' : result.code === 'NO_GATEWAY' || result.code === 'INSUFFICIENT_FUNDS' ? 'موجودی کیف پول کافی نیست و درگاه پرداختی فعال نیست.' : result.message || 'سفارش ثبت نشد')
        return
      }
      const destination = result.paid ? `/payment/result?invoice=${encodeURIComponent(result.invoiceNumber)}` : result.paymentUrl || result.invoiceUrl
      if (destination) window.location.assign(destination)
    } catch {
      setError('ارتباط با سرور برقرار نشد؛ دوباره امتحان کنید.')
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
          return <label key={row.cycle} className={term === row.cycle ? 'is-on' : ''}>
            <input type="radio" name="term" checked={term === row.cycle} onChange={() => setTerm(row.cycle)} />
            <b>{meta?.label}</b><span className="num">{nf(row.amount)} تومان</span>{row.saving > 0 && <em>{nf(row.saving)}٪ صرفه‌جویی</em>}
          </label>
        })}</div>
      </fieldset>
      <label className="hx-order-field"><span>{web ? 'دامنهٔ سایت *' : 'نام میزبان (اختیاری)'}</span>
        <input className="input" dir="ltr" required={web} value={name} maxLength={253} inputMode="url" autoComplete="off" spellCheck={false} placeholder={web ? 'example.ir' : 'server1.example.ir'} onChange={(event) => setName(event.target.value)} />
        <small>{web ? 'دامنه‌ای که روی این هاست راه‌اندازی می‌شود؛ اگر هنوز دامنه ندارید، دامنهٔ موردنظرتان را بنویسید.' : 'اگر خالی بماند، شمارهٔ سرویس استفاده می‌شود.'}</small>
      </label>
      {signedIn && gateways.length > 1 && <label className="hx-order-field"><span>درگاه پرداخت</span><select className="input" value={gatewayRef} onChange={(event) => setGatewayRef(event.target.value)}>{gateways.map((gateway) => <option key={gateway.ref} value={gateway.ref}>{gateway.label}</option>)}</select></label>}
      {price && <div className="hx-order-total">
        <span>مبلغ قابل پرداخت</span>
        <b className="num">{nf(price.amount + price.setup)} تومان</b>
        {price.setup > 0 && <small>شامل {nf(price.setup)} تومان هزینهٔ راه‌اندازی یک‌باره</small>}
        <small>ابتدا از موجودی کیف پول استفاده می‌شود و باقی مبلغ با درگاه پرداخت می‌شود.</small>
      </div>}
      {error && <p className="hx-order-error" role="alert">{error}</p>}
      {signedIn
        ? <button type="submit" className="btn btn-primary hx-order-pay" disabled={busy || !price}>{busy ? 'در حال ثبت…' : 'پرداخت و سفارش'}</button>
        : <Link className="btn btn-primary hx-order-pay" href={`/login?next=${encodeURIComponent(web ? '/hosting' : '/servers')}`}>ورود برای سفارش</Link>}
    </form>
  </dialog>
}
