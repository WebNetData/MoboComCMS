'use client'

import Link from '@/components/AppLink'
import { colorSwatch } from '@/modules/store/domain/colors'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from '@/platform/routing/navigation'
import { useSession } from 'next-auth/react'
import CheckoutError from '@/components/CheckoutError'
import Countdown from '@/components/store/Countdown'
import { StoreIcon } from '@/components/store/StoreIcons'
import { addToCart } from '@/modules/store/ui/cart-client'
import { fetchCheckoutGateways, startCheckout } from '@/modules/checkout/ui/client'
import { iranianUnit } from '@/shared/money/format'
import { variantOption } from '@/modules/store/domain/store'
import { useSite } from '@/components/site/SiteProvider'
import { fieldsFor, type OrderField } from '@/modules/store/domain/order-inputs'

export type BuyVariant = { id: number; name: string; attributes: Record<string, string>; price: number; listPrice: number; memberPrice: number; stock: number; limit: number; image?: string }

/** Tells the product gallery which picture the chosen variant has (ProductGallery listens for it). */
export const VARIANT_IMAGE_EVENT = 'store:variant-image'
export type BuyBoxProps = {
  /** Marketplace seller of this product; the site itself when absent. */
  seller?: { name: string; label: string; href: string } | null
  productId: number
  slug: string
  kind: string
  /** The product hands over its code by itself on payment. */
  instant?: boolean
  currency: string
  price: number
  listPrice: number
  memberPrice: number
  limit: number
  inStock: boolean
  lowStockAt: number
  saleEndsAt: string | null
  variants: BuyVariant[]
  /** Attribute keys that define the variants, with labels and whether they are colours. */
  axes: { key: string; label: string; color: boolean }[]
  vip: { enabled: boolean; member: boolean; access: string; giftDays: number }
  warranty: string
  badges: string[]
  shipping: string
  /** Active installment gateways ("خرید اقساطی") and their shown number of parts. */
  installments?: { label: string; count: number }[]
  /** Customer club earning rule (points per spent Toman), when the club is on. */
  club?: { earnPoints: number; earnStepToman: number } | null
  /** What this product asks its buyer (a login, a note…), per option. */
  orderFields?: OrderField[]
  /** The buyer types the foreign amount themselves ("pay a foreign site"): allowed currencies and limits. */
  open?: { currencies: string[]; min: string; max: string } | null
}

const fa = (value: number) => value.toLocaleString('fa-IR')
const swatch = colorSwatch

function Amount({ value, currency, className }: { value: number; currency: string; className?: string }) {
  const unit = iranianUnit(currency, 'fa-IR')
  return <span className={`sx-money ${className || ''}`}><b className="num">{unit ? Math.round(value).toLocaleString('fa-IR') : new Intl.NumberFormat('fa-IR', { style: 'currency', currency }).format(value)}</b>{unit && <small>{unit}</small>}</span>
}

/** "Let me know when it's back" for an out-of-stock product or variant. */
function StockAlert({ productId, variantId, slug }: { productId: number; variantId: number | null; slug: string }) {
  const router = useRouter()
  const { status } = useSession()
  const [subscribed, setSubscribed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const query = `productId=${productId}&variantId=${variantId || 0}`
  useEffect(() => {
    if (status !== 'authenticated') return
    let live = true
    void fetch(`/api/store/stock-alerts?${query}`).then((r) => r.json()).then((data) => { if (live) setSubscribed(!!data?.subscribed) }).catch(() => undefined)
    return () => { live = false }
  }, [status, query])
  async function toggle() {
    if (status !== 'authenticated') { router.push(`/login?next=${encodeURIComponent(`/products/${slug}`)}`); return }
    setBusy(true); setNote('')
    const response = await fetch(subscribed ? `/api/store/stock-alerts?${query}` : '/api/store/stock-alerts', subscribed ? { method: 'DELETE' } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productId, variantId }) }).catch(() => null)
    const data = await response?.json().catch(() => null)
    setBusy(false)
    if (!response?.ok) { setNote(data?.error || 'انجام نشد'); return }
    setSubscribed(!!data?.subscribed)
    setNote(data?.subscribed ? 'به محض موجود شدن با پیامک، ایمیل و اعلان خبرتان می‌کنیم.' : 'اطلاع‌رسانی لغو شد.')
  }
  return <div className="sx-stock-alert">
    <button type="button" className={`sx-btn is-block${subscribed ? '' : ' is-primary'}`} disabled={busy} aria-pressed={subscribed} onClick={() => void toggle()}>
      <StoreIcon name="bell" size={17} />{busy ? 'لطفاً صبر کنید…' : subscribed ? 'منتظر موجود شدن هستید (لغو)' : 'موجود شد خبرم کن'}
    </button>
    {note && <p className="sx-stock-note" role="status">{note}</p>}
  </div>
}

/**
 * Product buy box: variant picker (colour swatches for colour attributes),
 * price with discount and offer countdown, stock note, quantity, add to cart
 * and — for digital products — instant purchase.
 */
export default function BuyBox(props: BuyBoxProps) {
  const site = useSite()
  const router = useRouter()
  const { status } = useSession()
  // Preselect the first in-stock variant, like Digikala.
  const [variantId, setVariantId] = useState<number | null>(() => props.variants.find((variant) => variant.limit > 0)?.id ?? null)
  const [quantity, setQuantity] = useState(1)
  const [busy, setBusy] = useState<'' | 'cart' | 'buy'>('')
  const [added, setAdded] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState<{ code: string; message: string; needed: number; currency?: string } | null>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [shown, setShown] = useState<Record<string, boolean>>({})
  const [openAmount, setOpenAmount] = useState('')
  const [openCurrency, setOpenCurrency] = useState(props.open?.currencies[0] || '')
  const [quote, setQuote] = useState<{ price: number; conversion: number; fee: number; rate: number } | null>(null)
  const [quoteNote, setQuoteNote] = useState('')

  const variant = props.variants.find((row) => row.id === variantId) || null
  const variantImage = variant?.image || ''
  useEffect(() => {
    window.dispatchEvent(new CustomEvent(VARIANT_IMAGE_EVENT, { detail: { productId: props.productId, image: variantImage } }))
  }, [props.productId, variantImage])
  const price = variant ? variant.price : props.price
  const listPrice = variant ? variant.listPrice : props.listPrice
  const memberPrice = variant ? variant.memberPrice : props.memberPrice
  const limit = variant ? variant.limit : props.limit
  const available = props.inStock && limit > 0 && (!props.variants.length || !!variant)
  const discount = listPrice > price ? Math.floor(((listPrice - price) / listPrice) * 100) : 0
  const vipPrice = props.vip.enabled && memberPrice > 0 && memberPrice < price ? memberPrice : 0
  const membersOnly = props.vip.enabled && props.vip.access === 'MEMBERS' && !props.vip.member
  const stockLeft = variant ? variant.stock : -1
  const toman = props.currency === 'IRR' ? price / 10 : props.currency === 'IRT' || props.currency === 'TMN' ? price : 0
  const clubPoints = props.club && toman > 0 ? Math.floor(Math.floor(toman / props.club.earnStepToman) * props.club.earnPoints) : 0
  const installmentsNote = toman > 0 ? (props.installments || []).filter((row) => row.count >= 2).map((row) => ({ ...row, each: Math.ceil(toman / row.count) })) : []

  const open = props.open || null
  const fields = useMemo(() => fieldsFor(props.orderFields || [], variant?.name || ''), [props.orderFields, variant?.name])
  // A typed amount is priced by the server a moment after the buyer stops typing.
  useEffect(() => {
    if (!open) return
    setQuote(null); setQuoteNote('')
    if (!openAmount.trim()) return
    let live = true
    const timer = window.setTimeout(() => {
      void fetch('/api/cart/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productId: props.productId, amount: openAmount, currency: openCurrency }) })
        .then(async (response) => ({ ok: response.ok, data: await response.json().catch(() => null) }))
        .then(({ ok, data }) => { if (!live) return; if (ok && data?.price > 0) setQuote(data); else setQuoteNote(String(data?.error || 'قیمت محاسبه نشد')) })
        .catch(() => { if (live) setQuoteNote('ارتباط برقرار نشد؛ دوباره تلاش کنید') })
    }, 450)
    return () => { live = false; window.clearTimeout(timer) }
  }, [open, openAmount, openCurrency, props.productId])

  // Values per axis, so each attribute becomes its own row of options.
  const axes = useMemo(() => props.axes.map((axis) => ({ ...axis, values: [...new Set(props.variants.map((row) => row.attributes[axis.key]).filter(Boolean))] })).filter((axis) => axis.values.length), [props.axes, props.variants])
  const pick = (key: string, value: string) => {
    const next = variantOption(props.variants, variant, key, value).selected
    if (next) { setVariantId(next.id); setQuantity(1); setAdded(false) }
  }

  async function addCart() {
    setBusy('cart'); setMessage(''); setError(null)
    const missing = fields.find((field) => field.required && !(answers[field.key] || '').trim())
    if (missing) { setBusy(''); setMessage(`«${missing.label}» را وارد کنید`); return }
    if (open && !quote) { setBusy(''); setMessage(quoteNote || 'مبلغ را وارد کنید'); return }
    const extra = fields.length || open ? { inputs: Object.fromEntries(fields.map((field) => [field.key, answers[field.key] || ''])), ...(open ? { openAmount: { amount: openAmount, currency: openCurrency } } : {}) } : undefined
    const result = await addToCart(props.productId, variant?.id ?? null, open ? 1 : quantity, extra)
    setBusy('')
    if (!result.ok) { setMessage(result.error); return }
    setAdded(true)
    setMessage(result.limited ? 'به اندازهٔ موجودی به سبد اضافه شد' : '')
  }

  async function buyNow() {
    if (status !== 'authenticated') { router.push(`/login?next=${encodeURIComponent(`/products/${props.slug}`)}`); return }
    setBusy('buy'); setError(null)
    try {
      const gateways = await fetchCheckoutGateways(props.currency)
      const gateway = gateways.find((row) => row.isDefault) || gateways[0]
      const result = await startCheckout({ productId: props.productId, variantId: variant?.id, gatewayRef: gateway?.ref })
      if (result.ok) {
        if (result.paid || result.invoiceUrl) router.push(`/payment/result?invoice=${result.invoiceNumber}`)
        else if (result.paymentUrl) window.location.href = result.paymentUrl
        return
      }
      setError({ code: result.code, message: result.message, needed: result.needed, currency: result.currency })
    } catch {
      setError({ code: 'NETWORK_ERROR', message: 'ارتباط برقرار نشد. وضعیت سفارش‌ها را بررسی و دوباره تلاش کنید.', needed: 0 })
    } finally { setBusy('') }
  }

  return <div className="sx-buy">
    {axes.map((axis) => {
      const current = variant?.attributes[axis.key] || ''
      return <fieldset key={axis.key} className="sx-axis">
        <legend>{axis.label}: <b>{current || 'انتخاب کنید'}</b></legend>
        <div className={axis.color ? 'sx-swatches' : 'sx-options'}>
          {axis.values.map((value) => {
            const { inStock, changesOtherOptions } = variantOption(props.variants, variant, axis.key, value)
            const color = axis.color ? swatch(value) : ''
            const label = `${axis.label}: ${value}${!inStock ? '، ناموجود برای انتخاب فعلی' : changesOtherOptions ? '، گزینه‌های دیگر تغییر می‌کنند' : ''}`
            return <button key={value} type="button" aria-label={label} aria-pressed={current === value} className={`${axis.color ? 'sx-swatch' : 'sx-option'}${current === value ? ' is-selected' : ''}${inStock ? '' : ' is-out'}`} onClick={() => pick(axis.key, value)} title={label}>
              {axis.color ? <><span style={{ background: color || 'var(--sx-subtle)' }} />{!color && value}<span className="sx-sr">{value}</span></> : value}
            </button>
          })}
        </div>
      </fieldset>
    })}
    {!axes.length && props.variants.length > 0 && <fieldset className="sx-axis">
      <legend>نوع کالا: <b>{variant?.name || 'انتخاب کنید'}</b></legend>
      <div className="sx-options">{props.variants.map((row) => <button key={row.id} type="button" aria-pressed={row.id === variantId} className={`sx-option${row.id === variantId ? ' is-selected' : ''}${row.limit > 0 ? '' : ' is-out'}`} onClick={() => { setVariantId(row.id); setQuantity(1); setAdded(false) }}>{row.name}</button>)}</div>
    </fieldset>}

    <div className="sx-buy-card">
      <ul className="sx-buy-facts">
        <li><StoreIcon name="store" size={18} /><span>{props.seller ? <Link href={props.seller.href}><b>{props.seller.name}</b></Link> : <b>فروشگاه {site.brand}</b>}<small>{props.seller ? props.seller.label : 'فروشندهٔ رسمی'}</small></span></li>
        {props.warranty && <li><StoreIcon name="shield" size={18} /><span>{props.warranty}</span></li>}
        <li>{props.kind === 'PHYSICAL' ? <StoreIcon name="truck" size={18} /> : <StoreIcon name="bolt" size={18} />}<span>{props.kind === 'PHYSICAL' ? props.shipping : props.instant ? 'تحویل آنی پس از پرداخت در حساب کاربری' : 'تحویل دیجیتال در حساب کاربری پس از تأیید سفارش'}</span></li>
      </ul>

      {available && open && <div className="sx-open">
        <label className="sx-open-amount"><span>مبلغی که باید پرداخت شود</span>
          <span className="sx-open-row">
            <input className="num" inputMode="decimal" dir="ltr" autoComplete="off" placeholder="49.99" value={openAmount} onChange={(event) => { setOpenAmount(event.target.value); setAdded(false) }} aria-describedby="sx-open-hint" />
            {open.currencies.length > 1
              ? <select value={openCurrency} onChange={(event) => { setOpenCurrency(event.target.value); setAdded(false) }} aria-label="واحد پول">{open.currencies.map((code) => <option key={code} value={code}>{code}</option>)}</select>
              : <b>{openCurrency}</b>}
          </span>
        </label>
        {(open.min || open.max) && <small id="sx-open-hint">{open.min && <>حداقل <b className="num" dir="ltr">{open.min}</b></>}{open.min && open.max && ' · '}{open.max && <>حداکثر <b className="num" dir="ltr">{open.max}</b></>} {openCurrency}</small>}
        <div className="sx-open-quote" role="status" aria-live="polite">
          {quote ? <>
            <span>هزینهٔ سفارش شما</span>
            <Amount value={quote.price} currency={props.currency} className="is-large" />
            <small>نرخ هر {openCurrency}: <b className="num">{Math.round(quote.rate).toLocaleString('fa-IR')}</b> تومان · کارمزد و خدمات: <b className="num">{Math.round(quote.fee).toLocaleString('fa-IR')}</b></small>
            <small>قیمت نهایی هنگام پرداخت با نرخ همان لحظه حساب می‌شود.</small>
          </> : <span className="is-muted">{quoteNote || (openAmount.trim() ? 'در حال محاسبه…' : 'مبلغ را وارد کنید تا هزینه به تومان محاسبه شود')}</span>}
        </div>
      </div>}

      {available && !open && <div className="sx-buy-price">
        {discount > 0 && <div className="sx-price-was"><s className="num">{Math.round(listPrice).toLocaleString('fa-IR')}</s><span className="sx-off">{fa(discount)}٪</span></div>}
        <Amount value={price} currency={props.currency} className="is-large" />
        {props.saleEndsAt && discount > 0 && <div className="sx-buy-timer"><StoreIcon name="clock" size={15} />پایان پیشنهاد <Countdown until={props.saleEndsAt} /></div>}
        {vipPrice > 0 && <div className="sx-buy-vip">{props.vip.member ? <>قیمت شما با عضویت VIP: <Amount value={vipPrice} currency={props.currency} /></> : <>قیمت اعضای VIP: <Amount value={vipPrice} currency={props.currency} /> <Link href="/vip">عضو شوید</Link></>}</div>}
        {props.vip.giftDays > 0 && <div className="sx-buy-vip"><StoreIcon name="star" size={15} />{fa(props.vip.giftDays)} روز اشتراک VIP هدیه با این خرید</div>}
        {clubPoints > 0 && <div className="sx-buy-club"><StoreIcon name="star" size={15} />با این خرید <b className="num">{fa(clubPoints)}</b> امتیاز باشگاه مشتریان می‌گیرید</div>}
        {installmentsNote.length > 0 && <ul className="sx-buy-installments">{installmentsNote.map((row) => <li key={row.label}><StoreIcon name="clock" size={15} /><span>{row.label}: <b className="num">{fa(row.count)}</b> قسط <b className="num">{fa(row.each)}</b> تومانی</span></li>)}</ul>}
      </div>}

      {available && stockLeft >= 0 && stockLeft <= Math.max(props.lowStockAt, 3) && <p className="sx-low is-box">تنها {fa(stockLeft)} عدد در انبار باقی مانده</p>}
      {!available && <p className="sx-unavailable is-box">{props.variants.length && !variant ? 'یکی از گزینه‌ها را انتخاب کنید' : 'این کالا فعلاً موجود نیست'}</p>}
      {!available && !membersOnly && !(props.variants.length && !variant) && <StockAlert productId={props.productId} variantId={variant?.id ?? null} slug={props.slug} />}

      {available && !membersOnly && fields.length > 0 && <fieldset className="sx-ask">
        <legend>اطلاعات لازم برای انجام سفارش</legend>
        {fields.map((field) => <label key={field.key} className="sx-ask-field">
          <span>{field.label}{field.required && <i aria-hidden="true"> *</i>}</span>
          {field.kind === 'textarea'
            ? <textarea rows={3} dir="auto" maxLength={2000} required={field.required} value={answers[field.key] || ''} onChange={(event) => { setAnswers({ ...answers, [field.key]: event.target.value }); setAdded(false) }} />
            : <span className="sx-ask-input">
                <input type={field.kind === 'secret' ? (shown[field.key] ? 'text' : 'password') : field.kind === 'email' ? 'email' : field.kind === 'url' ? 'url' : 'text'} dir={field.kind === 'text' ? 'auto' : 'ltr'} autoComplete={field.kind === 'secret' ? 'new-password' : 'off'} maxLength={500} required={field.required} value={answers[field.key] || ''} onChange={(event) => { setAnswers({ ...answers, [field.key]: event.target.value }); setAdded(false) }} />
                {field.kind === 'secret' && <button type="button" className="sx-link" aria-pressed={!!shown[field.key]} onClick={() => setShown({ ...shown, [field.key]: !shown[field.key] })}>{shown[field.key] ? 'پنهان' : 'نمایش'}</button>}
              </span>}
          {field.help && <small>{field.help}</small>}
        </label>)}
        <p className="sx-ask-note"><StoreIcon name="shield" size={15} />این اطلاعات رمزنگاری‌شده نگه داشته می‌شود، فقط کارشناسِ همین سفارش آن را می‌بیند و پس از انجام سفارش پاک می‌شود.</p>
      </fieldset>}

      {membersOnly ? <div className="sx-buy-members"><b>این کالا مخصوص اعضای ویژه است</b><Link href="/vip" className="sx-btn is-primary is-block">عضویت VIP</Link></div>
        : available && (added
          ? <div className="sx-buy-added" role="status">
              <span><StoreIcon name="check" size={18} />به سبد خرید اضافه شد</span>
              <Link href="/cart" className="sx-btn is-primary is-block">مشاهدهٔ سبد خرید و ادامه</Link>
              <button type="button" className="sx-link" onClick={() => setAdded(false)}>افزودن دوباره</button>
            </div>
          : <div className="sx-buy-actions">
              {limit > 1 && !open && <div className="sx-qty" role="group" aria-label="تعداد">
                <button type="button" onClick={() => setQuantity((q) => Math.min(limit, q + 1))} disabled={quantity >= limit} aria-label="افزایش تعداد"><StoreIcon name="plus" size={16} /></button>
                <output className="num" aria-live="polite">{fa(quantity)}</output>
                <button type="button" onClick={() => setQuantity((q) => Math.max(1, q - 1))} disabled={quantity <= 1} aria-label="کاهش تعداد"><StoreIcon name="minus" size={16} /></button>
              </div>}
              <button type="button" className="sx-btn is-primary is-block is-large" disabled={!!busy} onClick={() => void addCart()}>{busy === 'cart' ? 'در حال افزودن…' : 'افزودن به سبد خرید'}</button>
              {props.kind !== 'PHYSICAL' && !open && !(props.orderFields || []).length && <button type="button" className="sx-btn is-block" disabled={!!busy} onClick={() => void buyNow()}>{busy === 'buy' ? 'در حال انتقال…' : 'خرید فوری'}</button>}
            </div>)}
      {message && <p className="sx-buy-msg" role="alert">{message}</p>}
      {error && <CheckoutError code={error.code} message={error.message} needed={error.needed} currency={error.currency || props.currency} />}
    </div>

    {props.badges.length > 0 && <ul className="sx-badges">{props.badges.map((badge) => <li key={badge}><StoreIcon name="check" size={14} />{badge}</li>)}</ul>}
  </div>
}
