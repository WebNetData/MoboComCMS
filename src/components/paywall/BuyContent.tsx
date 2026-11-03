'use client'

import { useId, useState } from 'react'
import Link from '@/components/AppLink'
import Icon from '@/components/site/Icon'
import { startCheckout } from '@/modules/checkout/ui/client'

export type BuyView = { key: string; open: boolean; price: string; listPrice: string; vipFree: boolean; vipPrice: string; memberPrice: boolean; groupPrice?: boolean; quote?: { amountMinor: string; currency: string }; title: string }

/**
 * Buy box for a paid article or download: price, what VIP members pay, and one
 * button that charges the wallet first and sends the rest to the payment gateway.
 */
export default function BuyContent({ view, loggedIn, next, noun = 'فایل' }: { view: BuyView; loggedIn: boolean; next: string; noun?: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const titleId = useId()

  async function buy() {
    setBusy(true); setError('')
    try {
      const result = await startCheckout({ contentKey: view.key, expectedQuote: view.quote })
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
    <section className="pw-box pw-premium" id="buy" aria-labelledby={titleId} dir="rtl">
      <div className="pw-main">
        <span className="pw-eyebrow"><Icon name="lock" size={14} />دسترسی اختصاصی به {noun}</span>
        <h2 id={titleId}>دریافت «{view.title}»</h2>
        <ul className="pw-points">
          <li><Icon name="check" size={15} />خرید یک‌باره و دسترسی از حساب شما</li>
          <li><Icon name="wallet" size={15} />پرداخت از کیف پول یا درگاه بانکی</li>
          <li><Icon name="layers" size={15} />ثبت در کتابخانه و خریدهای من</li>
        </ul>
      </div>
      <div className="pw-side">
        <div className="pw-price">
          {(view.memberPrice || view.groupPrice) && <s>{view.listPrice}</s>}
          <b>{view.price}</b>
          {(view.memberPrice || view.groupPrice) && <small className="pw-vip-note">{view.groupPrice ? 'قیمت اختصاصی گروه کاربری شما' : 'قیمت ویژهٔ اعضای VIP'}</small>}
        </div>
        {loggedIn
          ? <button type="button" className="btn btn-primary pw-buy" onClick={() => void buy()} disabled={busy}>{busy ? 'در حال انتقال…' : <>خرید و دریافت<Icon name="arrow" size={17} /></>}</button>
          : <Link href={`/login?next=${encodeURIComponent(next)}`} className="btn btn-primary pw-buy">ورود و خرید</Link>}
        {error && <p className="pw-error" role="alert">{error}</p>}
        {view.vipFree && <p className="pw-vip">اعضای ویژه این {noun} را <b>رایگان</b> دریافت می‌کنند. <Link href="/vip">عضویت ویژه</Link></p>}
        {!view.vipFree && view.vipPrice && !view.memberPrice && <p className="pw-vip">برای اعضای ویژه فقط <b>{view.vipPrice}</b>. <Link href="/vip">عضویت ویژه</Link></p>}
      </div>
    </section>
  )
}
