'use client'

import Link from '@/components/AppLink'
import { useState } from 'react'
import { useRouter } from '@/platform/routing/navigation'
import { useSession } from 'next-auth/react'
import { StoreIcon } from '@/components/store/StoreIcons'
import { emptyCart, setLineQuantity, type Cart } from '@/modules/store/ui/cart-client'
import { iranianUnit } from '@/shared/money/format'

const fa = (value: number) => value.toLocaleString('fa-IR')

export function Amount({ value, currency }: { value: number; currency: string }) {
  const unit = iranianUnit(currency, 'fa-IR')
  return <span className="sx-money"><b className="num">{unit ? Math.round(value).toLocaleString('fa-IR') : new Intl.NumberFormat('fa-IR', { style: 'currency', currency }).format(value)}</b>{unit && <small>{unit}</small>}</span>
}

/** The shopping cart: lines with quantity steppers and the order summary. */
export default function CartPage({ initial, note }: { initial: Cart; note: string }) {
  const router = useRouter()
  const { status } = useSession()
  const [cart, setCart] = useState(initial)
  const [busy, setBusy] = useState<number | 'all' | null>(null)
  const [error, setError] = useState('')

  async function change(lineId: number, quantity: number) {
    setBusy(lineId); setError('')
    const result = await setLineQuantity(lineId, quantity)
    setBusy(null)
    if (result.ok) setCart(result.cart)
    else setError(result.error)
  }

  async function clear() {
    if (!window.confirm('همهٔ کالاها از سبد حذف شوند؟')) return
    setBusy('all')
    const result = await emptyCart()
    setBusy(null)
    if (result.ok) setCart(result.cart)
  }

  function proceed() {
    router.push(status === 'authenticated' ? '/checkout/cart' : `/login?next=${encodeURIComponent('/checkout/cart')}`)
  }

  if (!cart.lines.length) return <div className="sx-cart-empty">
    <StoreIcon name="cart" size={56} />
    <h1>سبد خرید شما خالی است!</h1>
    <p>می‌توانید برای مشاهدهٔ کالاها به صفحهٔ فروشگاه بروید یا پیشنهادهای شگفت‌انگیز را ببینید.</p>
    <div><Link href="/products" className="sx-btn is-primary">رفتن به فروشگاه</Link><Link href="/products?discounted=1&sort=discount" className="sx-btn">شگفت‌انگیزها</Link></div>
  </div>

  return <div className="sx-cart">
    <section className="sx-cart-main" aria-labelledby="sx-cart-title">
      <header className="sx-cart-head">
        <div><h1 id="sx-cart-title">سبد خرید</h1><small className="num">{fa(cart.count)} کالا</small></div>
        <button type="button" className="sx-link is-danger" onClick={() => void clear()} disabled={busy !== null}><StoreIcon name="trash" size={16} />حذف همه</button>
      </header>
      {error && <p className="sx-alert" role="alert">{error}</p>}
      <ul className="sx-cart-lines">
        {cart.lines.map((line) => <li key={line.id} className={line.issue ? 'has-issue' : ''} aria-busy={busy === line.id}>
          <Link href={`/products/${line.slug}`} className="sx-cart-art">{line.image ? <img src={line.image} alt="" loading="lazy" /> : <StoreIcon name="box" size={34} />}</Link>
          <div className="sx-cart-info">
            <Link href={`/products/${line.slug}`} className="sx-cart-name">{line.name}</Link>
            <ul className="sx-cart-attrs">
              {Object.entries(line.attributes).map(([key, value]) => <li key={key}>{value}</li>)}
              {!Object.keys(line.attributes).length && line.variantName && <li>{line.variantName}</li>}
              {line.brand && <li><StoreIcon name="store" size={14} />{line.brand}</li>}
              <li>{line.kind === 'PHYSICAL' ? <><StoreIcon name="truck" size={14} />ارسال فروشگاه</> : <><StoreIcon name="bolt" size={14} />تحویل آنی</>}</li>
            </ul>
            {line.issue && <p className="sx-cart-issue" role="status">{line.issue}</p>}
          </div>
          <div className="sx-cart-side">
            <div className="sx-qty" role="group" aria-label={`تعداد ${line.name}`}>
              <button type="button" onClick={() => void change(line.id, line.quantity + 1)} disabled={busy !== null || line.quantity >= line.maxQuantity} aria-label="افزایش تعداد"><StoreIcon name="plus" size={16} /></button>
              <output className="num" aria-live="polite">{fa(line.quantity)}</output>
              <button type="button" onClick={() => void change(line.id, line.quantity - 1)} disabled={busy !== null} aria-label={line.quantity > 1 ? 'کاهش تعداد' : 'حذف از سبد'}><StoreIcon name={line.quantity > 1 ? 'minus' : 'trash'} size={16} /></button>
            </div>
            <div className="sx-cart-price">
              {line.listPrice > line.unitPrice && <small className="sx-cart-save">{Math.round((line.listPrice - line.unitPrice) * line.quantity).toLocaleString('fa-IR')} تخفیف</small>}
              <Amount value={line.lineTotal} currency={line.currency} />
            </div>
          </div>
        </li>)}
      </ul>
    </section>

    <aside className="sx-cart-summary" aria-label="خلاصهٔ سبد">
      <dl>
        <div><dt>قیمت کالاها <span className="num">({fa(cart.count)})</span></dt><dd><Amount value={cart.listTotal} currency={cart.currency} /></dd></div>
        {cart.saving > 0 && <div className="is-save"><dt>سود شما از خرید</dt><dd><Amount value={cart.saving} currency={cart.currency} /></dd></div>}
        <div className="is-total"><dt>جمع سبد خرید</dt><dd><Amount value={cart.itemsTotal} currency={cart.currency} /></dd></div>
      </dl>
      {cart.hasPhysical && <p className="sx-cart-hint"><StoreIcon name="truck" size={16} />{cart.shippingByAddress ? 'هزینهٔ ارسال بر اساس شهر، وزن و روش ارسال (پست، تیپاکس، پیک…) در مرحلهٔ بعد محاسبه می‌شود' : cart.shipping > 0 ? <>هزینهٔ ارسال: <Amount value={cart.shipping} currency={cart.currency} /> (در مرحلهٔ بعد محاسبه می‌شود)</> : 'ارسال این سفارش رایگان است'}</p>}
      <button type="button" className="sx-btn is-primary is-block is-large" onClick={proceed} disabled={cart.blocked || busy !== null}>تأیید و تکمیل سفارش</button>
      {cart.blocked && <p className="sx-cart-hint is-warn">برای ادامه، کالاهای دارای هشدار را حذف یا اصلاح کنید.</p>}
      {note && <p className="sx-cart-hint">{note}</p>}
      <p className="sx-cart-fine">کالاهای سبد رزرو نشده‌اند؛ برای ثبت سفارش، مراحل خرید را تکمیل کنید.</p>
    </aside>

    <div className="sx-cart-sticky" aria-hidden={false}>
      <div><small>جمع سبد خرید</small><Amount value={cart.itemsTotal} currency={cart.currency} /></div>
      <button type="button" className="sx-btn is-primary" onClick={proceed} disabled={cart.blocked || busy !== null}>تکمیل سفارش</button>
    </div>
  </div>
}
