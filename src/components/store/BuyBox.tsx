'use client'

import Link from '@/components/AppLink'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from '@/platform/routing/navigation'
import { useSession } from 'next-auth/react'
import CheckoutError from '@/components/CheckoutError'
import Countdown from '@/components/store/Countdown'
import { StoreIcon } from '@/components/store/StoreIcons'
import { addToCart } from '@/modules/store/ui/cart-client'
import { fetchCheckoutGateways, startCheckout } from '@/modules/checkout/ui/client'
import { iranianUnit } from '@/shared/money/format'
import { useSite } from '@/components/site/SiteProvider'

export type BuyVariant = { id: number; name: string; attributes: Record<string, string>; price: number; listPrice: number; memberPrice: number; stock: number; limit: number; image?: string }

/** Tells the product gallery which picture the chosen variant has (ProductGallery listens for it). */
export const VARIANT_IMAGE_EVENT = 'store:variant-image'
export type BuyBoxProps = {
  /** Marketplace seller of this product; the site itself when absent. */
  seller?: { name: string; label: string; href: string } | null
  productId: number
  slug: string
  kind: string
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
}

const fa = (value: number) => value.toLocaleString('fa-IR')
const COLORS: Record<string, string> = {
  مشکی: '#1f2328', سفید: '#ffffff', نقره‌ای: '#c9ced6', طلایی: '#d4af37', قرمز: '#e5484d', آبی: '#3b82f6', سبز: '#22a06b', زرد: '#f5c542',
  صورتی: '#f472b6', بنفش: '#8b5cf6', نارنجی: '#f97316', خاکستری: '#8b949e', سرمه‌ای: '#1e3a8a', قهوه‌ای: '#8b5a2b', کرم: '#f1e7d0',
  black: '#1f2328', white: '#ffffff', silver: '#c9ced6', gold: '#d4af37', red: '#e5484d', blue: '#3b82f6', green: '#22a06b', gray: '#8b949e', grey: '#8b949e',
}
const swatch = (value: string) => COLORS[value.trim().toLowerCase()] || COLORS[value.trim()] || (/^#[0-9a-f]{3,8}$/i.test(value.trim()) ? value.trim() : '')

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

  // Values per axis, so each attribute becomes its own row of options.
  const axes = useMemo(() => props.axes.map((axis) => ({ ...axis, values: [...new Set(props.variants.map((row) => row.attributes[axis.key]).filter(Boolean))] })).filter((axis) => axis.values.length), [props.axes, props.variants])
  const pick = (key: string, value: string) => {
    const wanted = { ...(variant?.attributes || {}), [key]: value }
    const exact = props.variants.find((row) => Object.entries(wanted).every(([k, v]) => row.attributes[k] === v))
    const loose = props.variants.find((row) => row.attributes[key] === value && row.limit > 0) || props.variants.find((row) => row.attributes[key] === value)
    const next = exact || loose
    if (next) { setVariantId(next.id); setQuantity(1); setAdded(false) }
  }

  async function addCart() {
    setBusy('cart'); setMessage(''); setError(null)
    const result = await addToCart(props.productId, variant?.id ?? null, quantity)
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
            const inStock = props.variants.some((row) => row.attributes[axis.key] === value && row.limit > 0)
            const color = axis.color ? swatch(value) : ''
            return <button key={value} type="button" aria-pressed={current === value} className={`${axis.color ? 'sx-swatch' : 'sx-option'}${current === value ? ' is-selected' : ''}${inStock ? '' : ' is-out'}`} onClick={() => pick(axis.key, value)} title={inStock ? value : `${value} (ناموجود)`}>
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
        <li>{props.kind === 'PHYSICAL' ? <StoreIcon name="truck" size={18} /> : <StoreIcon name="bolt" size={18} />}<span>{props.kind === 'PHYSICAL' ? props.shipping : 'تحویل آنی پس از پرداخت در حساب کاربری'}</span></li>
      </ul>

      {available && <div className="sx-buy-price">
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

      {membersOnly ? <div className="sx-buy-members"><b>این کالا مخصوص اعضای ویژه است</b><Link href="/vip" className="sx-btn is-primary is-block">عضویت VIP</Link></div>
        : available && (added
          ? <div className="sx-buy-added" role="status">
              <span><StoreIcon name="check" size={18} />به سبد خرید اضافه شد</span>
              <Link href="/cart" className="sx-btn is-primary is-block">مشاهدهٔ سبد خرید و ادامه</Link>
              <button type="button" className="sx-link" onClick={() => setAdded(false)}>افزودن دوباره</button>
            </div>
          : <div className="sx-buy-actions">
              {limit > 1 && <div className="sx-qty" role="group" aria-label="تعداد">
                <button type="button" onClick={() => setQuantity((q) => Math.min(limit, q + 1))} disabled={quantity >= limit} aria-label="افزایش تعداد"><StoreIcon name="plus" size={16} /></button>
                <output className="num" aria-live="polite">{fa(quantity)}</output>
                <button type="button" onClick={() => setQuantity((q) => Math.max(1, q - 1))} disabled={quantity <= 1} aria-label="کاهش تعداد"><StoreIcon name="minus" size={16} /></button>
              </div>}
              <button type="button" className="sx-btn is-primary is-block is-large" disabled={!!busy} onClick={() => void addCart()}>{busy === 'cart' ? 'در حال افزودن…' : 'افزودن به سبد خرید'}</button>
              {props.kind !== 'PHYSICAL' && <button type="button" className="sx-btn is-block" disabled={!!busy} onClick={() => void buyNow()}>{busy === 'buy' ? 'در حال انتقال…' : 'خرید فوری'}</button>}
            </div>)}
      {message && <p className="sx-buy-msg" role="alert">{message}</p>}
      {error && <CheckoutError code={error.code} message={error.message} needed={error.needed} currency={error.currency || props.currency} />}
    </div>

    {props.badges.length > 0 && <ul className="sx-badges">{props.badges.map((badge) => <li key={badge}><StoreIcon name="check" size={14} />{badge}</li>)}</ul>}
  </div>
}
