'use client'

import { useState } from 'react'
import Link from '@/components/AppLink'
import { startCheckout } from '@/modules/checkout/ui/client'

export type BuyView = { key: string; open: boolean; price: string; listPrice: string; vipFree: boolean; vipPrice: string; memberPrice: boolean; title: string }

/**
 * Buy box for a paid article or download: price, what VIP members pay, and one
 * button that charges the wallet first and sends the rest to the payment gateway.
 */
export default function BuyContent({ view, loggedIn, next, noun = 'فایل' }: { view: BuyView; loggedIn: boolean; next: string; noun?: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function buy() {
    setBusy(true); setError('')
    try {
      const result = await startCheckout({ contentKey: view.key })
      if (result.ok && result.paid) { window.location.reload(); return }
      if (result.ok && result.paymentUrl) { window.location.href = result.paymentUrl; return }
      if (result.code === 'ALREADY_OPEN') { window.location.reload(); return }
      setError(result.message || 'پرداخت آغاز نشد؛ دوباره تلاش کنید.')
    } catch {
      setError('ارتباط برقرار نشد؛ دوباره تلاش کنید.')
    }
    setBusy(false)
  }

  return (
    <section className="pw-box" id="buy" aria-labelledby="pw-title">
      <div className="pw-main">
        <span className="pw-eyebrow">{noun} پولی</span>
        <h2 id="pw-title">دریافت «{view.title}»</h2>
        <ul className="pw-points">
          <li>یک‌بار خرید، دسترسی همیشگی</li>
          <li>پرداخت از کیف پول یا درگاه بانکی</li>
          <li>همیشه در «خریدهای من» در دسترس است</li>
        </ul>
      </div>
      <div className="pw-side">
        <div className="pw-price">
          {view.memberPrice && <s>{view.listPrice}</s>}
          <b>{view.price}</b>
          {view.memberPrice && <small className="pw-vip-note">♛ قیمت ویژهٔ اعضای VIP</small>}
        </div>
        {loggedIn
          ? <button type="button" className="btn btn-primary pw-buy" onClick={() => void buy()} disabled={busy}>{busy ? 'در حال انتقال…' : `خرید و دریافت`}</button>
          : <Link href={`/login?next=${encodeURIComponent(next)}`} className="btn btn-primary pw-buy">ورود و خرید</Link>}
        {error && <p className="pw-error" role="alert">{error}</p>}
        {view.vipFree && <p className="pw-vip">♛ اعضای ویژه این {noun} را <b>رایگان</b> دریافت می‌کنند. <Link href="/vip">عضویت ویژه</Link></p>}
        {!view.vipFree && view.vipPrice && !view.memberPrice && <p className="pw-vip">♛ برای اعضای ویژه فقط <b>{view.vipPrice}</b>. <Link href="/vip">عضویت ویژه</Link></p>}
      </div>
    </section>
  )
}
