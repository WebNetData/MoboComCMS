'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useI18n } from '@/i18n/LocaleProvider'
import { fetchCheckoutGateways, fetchWalletBalance, money, startCheckout, type CheckoutGatewayChoice } from '@/modules/checkout/ui/client'
import CheckoutError from '@/components/CheckoutError'
import Link from 'next/link'

export default function ProductBuy({
  productId,
  slug,
  inStock,
  price,
  currency,
  kind = 'VIRTUAL',
  variants = [],
  vip,
}: {
  productId: number
  slug: string
  inStock: boolean
  price: number
  currency: string
  kind?: string
  variants?: { id: number; name: string; nameEn: string; price: number; stock: number; attributes: string; memberPrice?: number }[]
  /** VIP membership context (absent when the membership module is off). */
  vip?: { member: boolean; loggedIn: boolean; access: string; memberPrice: number; giftDays: number }
}) {
  const { t, locale } = useI18n()
  const router = useRouter()
  const { status } = useSession()
  const [busy, setBusy] = useState(false)
  const [balance, setBalance] = useState(0)
  const [gateways, setGateways] = useState<CheckoutGatewayChoice[]>([])
  const [gatewayRef, setGatewayRef] = useState('')
  const [error, setError] = useState<{ code: string; message: string; needed: number; currency?: string } | null>(null)
  const [variantId, setVariantId] = useState<number | null>(null)
  const [shipping, setShipping] = useState({ recipient: '', phone: '', country: '', city: '', postalCode: '', address: '' })
  const selectedVariant = variants.find(variant => variant.id === variantId)
  const regularPrice = selectedVariant?.price ?? price
  const vipPrice = selectedVariant ? selectedVariant.memberPrice || 0 : vip?.memberPrice || 0
  const hasVipPrice = !!vip && vipPrice > 0 && vipPrice < regularPrice
  const currentPrice = hasVipPrice && vip?.member ? vipPrice : regularPrice
  const membersOnly = vip?.access === 'MEMBERS' && !vip.member
  const available = inStock && (!selectedVariant || selectedVariant.stock !== 0)

  useEffect(() => {
    if (status !== 'authenticated') { setBalance(0); return }
    let alive = true
    fetchWalletBalance(currency).then((value) => alive && setBalance(value))
    return () => { alive = false }
  }, [status, currency])

  useEffect(() => {
    let alive = true
    fetchCheckoutGateways(currency).then((items) => {
      if (!alive) return
      setGateways(items)
      setGatewayRef((current) => items.some((g) => g.ref === current) ? current : (items.find((g) => g.isDefault)?.ref || items[0]?.ref || ''))
    })
    return () => { alive = false }
  }, [currency])

  async function buy() {
    setError(null)
    if (status !== 'authenticated') { router.push(`/login?next=${encodeURIComponent(`/products/${slug}`)}`); return }
    if (variants.length && !selectedVariant) { setError({ code: 'VARIANT_REQUIRED', message: locale === 'fa' ? 'نوع محصول را انتخاب کنید.' : 'Select a product variant.', needed: 0 }); return }
    if (kind === 'PHYSICAL' && (!shipping.recipient.trim() || !shipping.phone.trim() || !shipping.country.trim() || !shipping.city.trim() || !shipping.address.trim())) { setError({ code: 'SHIPPING_REQUIRED', message: locale === 'fa' ? 'اطلاعات ارسال را کامل کنید.' : 'Complete the shipping details.', needed: 0 }); return }
    setBusy(true)
    try {
      const res = await startCheckout({ productId, variantId: selectedVariant?.id, shippingAddress: kind === 'PHYSICAL' ? shipping : undefined, gatewayRef: gatewayRef || undefined })
      if (res.ok) {
        setBalance(res.balance)
        if (res.paid || res.invoiceUrl) router.push(`/payment/result?invoice=${res.invoiceNumber}`)
        else if (res.paymentUrl) window.location.href = res.paymentUrl
        return
      }
      setError({ code: res.code, message: res.message, needed: res.needed, currency: res.currency })
    } catch {
      setError({ code: 'NETWORK_ERROR', message: locale === 'fa' ? 'ارتباط برقرار نشد. وضعیت سفارش‌ها را بررسی و دوباره تلاش کنید.' : 'Connection failed. Check your orders, then try again.', needed: 0 })
    } finally { setBusy(false) }
  }

  const covered = status === 'authenticated' && balance >= currentPrice
  const localeName = locale === 'fa' ? 'fa-IR' : 'en-US'
  return (
    <div>
      {variants.length > 0 && <fieldset className="store-variant-picker"><legend>{locale === 'fa' ? 'انتخاب نوع محصول' : 'Choose an option'}</legend><div className="store-variant-options">{variants.map(variant => { let attributes: Record<string, string> = {}; try { attributes = JSON.parse(variant.attributes) } catch {} return <button type="button" key={variant.id} className={`store-variant-option ${variantId === variant.id ? 'selected' : ''}`} aria-pressed={variantId === variant.id} disabled={variant.stock === 0} onClick={() => setVariantId(variant.id)}><strong>{locale === 'fa' ? variant.name : variant.nameEn || variant.name}</strong>{Object.entries(attributes).length > 0 && <small>{Object.values(attributes).join(' · ')}</small>}<span className="num">{money(variant.price, currency, locale === 'fa' ? 'fa-IR' : 'en-US')}</span>{variant.stock === 0 && <small>{t.outOfStock}</small>}</button> })}</div></fieldset>}
      {kind === 'PHYSICAL' && <div className="store-shipping"><h3>{locale === 'fa' ? 'اطلاعات ارسال' : 'Shipping details'}</h3><div className="store-shipping-grid">{(['recipient', 'phone', 'country', 'city', 'postalCode', 'address'] as const).map(key => <label key={key}><span>{({ recipient: locale === 'fa' ? 'نام گیرنده' : 'Recipient', phone: locale === 'fa' ? 'شماره تماس' : 'Phone', country: locale === 'fa' ? 'کشور' : 'Country', city: locale === 'fa' ? 'شهر' : 'City', postalCode: locale === 'fa' ? 'کد پستی' : 'Postal code', address: locale === 'fa' ? 'نشانی کامل' : 'Full address' })[key]}</span><input className="input" value={shipping[key]} onChange={e => setShipping(current => ({ ...current, [key]: e.target.value }))} dir={key === 'phone' || key === 'postalCode' ? 'ltr' : undefined} /></label>)}</div></div>}
      {gateways.length > 1 && <div className="mb-3"><label className="label">{locale === 'fa' ? 'درگاه پرداخت' : 'Payment gateway'}</label><select className="select" value={gatewayRef} onChange={(e) => setGatewayRef(e.target.value)}>{gateways.map((g) => <option key={g.ref} value={g.ref}>{g.label}{g.feePercent ? ` · ${g.feePercent}%` : ''}</option>)}</select></div>}
      {hasVipPrice && (
        <div className="vip-price-row">
          {vip?.member
            ? <><span className="vip-chip is-small">♛ VIP</span><s className="num">{money(regularPrice, currency, localeName)}</s><b className="num">{money(vipPrice, currency, localeName)}</b></>
            : <><span className="vip-chip is-small">♛ VIP</span><span>{locale === 'fa' ? 'قیمت اعضای ویژه:' : 'VIP price:'}</span><b className="num">{money(vipPrice, currency, localeName)}</b><Link href="/vip" className="text-xs">{locale === 'fa' ? 'عضو شوید ←' : 'Join →'}</Link></>}
        </div>
      )}
      {!!vip?.giftDays && vip.giftDays > 0 && <p className="vip-price-row"><span aria-hidden="true">🎁</span>{locale === 'fa' ? `${vip.giftDays.toLocaleString('fa-IR')} روز اشتراک VIP هدیه با این خرید` : `${vip.giftDays} VIP days free with this purchase`}</p>}
      {membersOnly ? (
        <div className="vip-account-card">
          <div><b>♛ {locale === 'fa' ? 'این محصول مخصوص اعضای ویژه است' : 'This product is for VIP members'}</b><small>{locale === 'fa' ? 'برای خرید، ابتدا اشتراک VIP بگیرید.' : 'Get VIP membership to buy it.'}</small></div>
          <Link href={vip?.loggedIn ? '/vip' : `/login?next=${encodeURIComponent(`/products/${slug}`)}`} className="btn vip-btn">{vip?.loggedIn ? (locale === 'fa' ? 'عضویت VIP' : 'Go VIP') : (locale === 'fa' ? 'ورود' : 'Sign in')}</Link>
        </div>
      ) : (
      <button className="btn btn-primary btn-lg w-full" disabled={busy || !available} onClick={buy}>
        {busy ? t.loading : !available ? t.outOfStock : variants.length && !selectedVariant ? locale === 'fa' ? 'نوع محصول را انتخاب کنید' : 'Choose an option' : `🛒 ${t.buyNow} — ${money(currentPrice, currency, localeName)}`}
      </button>
      )}
      {covered && <p className="wallet-covers-badge mt-3">{t.walletCoversPlan}</p>}
      {status === 'authenticated' && balance > 0 && !covered && (
        <p className="muted text-xs mt-3 num">{t.walletBalance}: {money(balance, currency, localeName)} · {t.walletPayHint}</p>
      )}
      {error && <CheckoutError code={error.code} message={error.message} needed={error.needed} currency={error.currency || currency} />}
    </div>
  )
}
