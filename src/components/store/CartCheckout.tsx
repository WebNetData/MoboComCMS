'use client'

import GiftOptions, { type GiftChoice } from './GiftOptions'
import { checkoutDestination, checkoutPath, type CheckoutSurface } from '@/modules/checkout/domain/surface'


import { useEffect, useMemo, useRef, useState } from 'react'
import Link from '@/components/AppLink'
import { useRouter } from '@/platform/routing/navigation'
import CheckoutError from '@/components/CheckoutError'
import { AddressDialog, AddressSummary, useAddresses, type SavedAddress } from '@/components/store/AddressBook'
import { Amount } from '@/components/store/CartPage'
import { StoreIcon } from '@/components/store/StoreIcons'
import { fetchWalletBalance, type CheckoutGatewayChoice } from '@/modules/checkout/ui/client'
import { checkoutCart, type Cart } from '@/modules/store/ui/cart-client'
import { WEEKDAY_FA, type ScheduleDay } from '@/modules/shipping/domain/shipping'
import { useCarrierQuotes, type CarrierOption } from './useCarrierQuotes'

type Delivery = { enabled: boolean; days: ScheduleDay[]; pickup?: {enabled:boolean;address:string;instructions:string} }
const ZONE_FA: Record<string, string> = { city: 'درون‌شهری', province: 'درون‌استانی', country: 'برون‌استانی' }

const dayMonth = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { day: 'numeric', month: 'long', timeZone: 'UTC' })
const fullDate = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
const asDate = (day: string) => new Date(`${day}T12:00:00Z`)
/** Codes whose server message is already written for the customer. */
const PLAIN_CODES = new Set(['NETWORK_ERROR', 'CHECKOUT_RESPONSE_INVALID', 'NO_CARRIER', 'CARRIER_UNAVAILABLE', 'SHIPPING_REQUIRED', 'ADDRESS_NOT_FOUND', 'DELIVERY_REQUIRED', 'DELIVERY_SLOT_INVALID', 'DELIVERY_SLOT_FULL', 'OUT_OF_STOCK', 'VARIANT_NOT_FOUND', 'MEMBERS_ONLY', 'QUANTITY_LIMIT', 'CART_EMPTY', 'CART_BLOCKED', 'CART_FULL', 'MIXED_CURRENCY', 'PRODUCT_NOT_FOUND', 'VARIANT_REQUIRED', 'GIFT_INVALID', 'GIFT_UNAVAILABLE', 'GIFT_WRAP_UNAVAILABLE'])
const PROMO_MESSAGES: Record<string, string> = {
  PROMOTION_INVALID: 'کد تخفیف نامعتبر است', PROMOTION_NOT_FOUND: 'کد تخفیف پیدا نشد', PROMOTION_INACTIVE: 'این کد تخفیف فعال نیست یا منقضی شده',
  PROMOTION_SCOPE: 'این کد برای این سفارش قابل استفاده نیست', PROMOTION_MINIMUM: 'مبلغ سفارش به حداقل لازم برای این کد نرسیده', PROMOTION_EXHAUSTED: 'ظرفیت استفاده از این کد تمام شده',
  PROMOTION_USER_LIMIT: 'سهم شما از این کد تخفیف تمام شده', PROMOTION_MEMBERS_ONLY: 'این کد مخصوص اعضای ویژه است',
}

/** Cart checkout: delivery address and time (for physical items), discount code, payment. */
export default function CartCheckout({ quotation, cart, delivery, gateways, giftOptions, orderPauseNotice = '', surface = 'public' }: { quotation?: { token: string; fingerprint: string }; orderPauseNotice?: string; giftOptions?: { enabled: boolean; wrapEnabled: boolean }; surface?: CheckoutSurface; cart: Cart; delivery: Delivery; gateways: CheckoutGatewayChoice[] }) {
  const [quotationReviewed, setQuotationReviewed] = useState(false)
  const router = useRouter()
  const counted = useRef(false)
  useEffect(() => {
    if (counted.current) return
    counted.current = true
    void fetch('/api/analytics/collect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ e: 'store.checkout' }), keepalive: true }).catch(() => {})
  }, [])
  const [gift, setGift] = useState<GiftChoice>({ enabled: false, recipient: '', message: '', wrap: false })
  const [pickup,setPickup]=useState(false)
  const physical = cart.hasPhysical && !pickup
  const { addresses, error: addressError, reload } = useAddresses()
  const [addressId, setAddressId] = useState(0)
  const [addressRefreshing, setAddressRefreshing] = useState(false)
  const [chooser, setChooser] = useState(false)
  const [dialog, setDialog] = useState<{ open: boolean; edit: SavedAddress | null }>({ open: false, edit: null })
  const [days, setDays] = useState(delivery.days)
  const [date, setDate] = useState(() => delivery.days.find((d) => d.slots.some((s) => s.available))?.date || '')
  const [slotId, setSlotId] = useState('')
  const [gatewayRef, setGatewayRef] = useState(() => gateways.find((g) => g.isDefault)?.ref || gateways[0]?.ref || '')
  const [code, setCode] = useState('')
  const [codeOpen, setCodeOpen] = useState(false)
  const [balance, setBalance] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<{ code: string; message: string; needed: number; currency?: string } | null>(null)
  const errorRef = useRef<HTMLDivElement>(null)
  const byCarrier = !!cart.shippingByAddress
  const address = addresses?.find((a) => a.id === addressId) || null
  const quoteContext = JSON.stringify([address?.province || '', address?.city || ''])
  const { carriers, error: carrierError, retry: retryCarriers } = useCarrierQuotes(addressId, physical && byCarrier && !addressRefreshing && !addressError, quoteContext, quotation?.token || '')
  const [carrierId, setCarrierId] = useState('')

  useEffect(() => { let alive = true; fetchWalletBalance(cart.currency).then((value) => alive && setBalance(value)); return () => { alive = false } }, [cart.currency])
  useEffect(() => {
    if (!addresses?.length) { setAddressId(0); return }
    setAddressId((current) => addresses.some((a) => a.id === current) ? current : (addresses.find((a) => a.isDefault) || addresses[0]).id)
  }, [addresses])
  useEffect(() => { if (error) errorRef.current?.focus() }, [error])

  useEffect(() => {
    if (!carriers) return
    setCarrierId(current => carriers.options.some(o => o.ok && o.carrierId === current) ? current : (carriers.options.find(o => o.ok)?.carrierId || ''))
  }, [carriers])

  const carrier = carriers?.options.find((o): o is Extract<CarrierOption, { ok: true }> => o.ok && o.carrierId === carrierId) || null
  const needsSchedule = delivery.enabled && (!byCarrier || !!carrier?.scheduled)
  const shippingFee = pickup ? 0 : byCarrier ? carrier?.fee || 0 : cart.shipping
  const day = days.find((d) => d.date === date) || null
  const slot = day?.slots.find((s) => s.id === slotId && s.available) || null
  const total = cart.itemsTotal + shippingFee
  const covered = balance >= total

  const missing = useMemo(() => {
    if (quotation && !quotationReviewed) return 'قیمت و شرایط فعلی پیش‌فاکتور را تأیید کنید'
    if (orderPauseNotice) return orderPauseNotice
    if (cart.blocked) return 'سبد خرید شما نیاز به بازبینی دارد'
    if (cart.hasPhysical && giftOptions?.enabled && gift.enabled && !gift.recipient.trim()) return 'نام گیرندهٔ هدیه را وارد کنید'
    if (!physical) return ''
    if (addressRefreshing) return 'در حال تازه‌سازی آدرس…'
    if (addressError) return 'برای ادامه، آدرس‌ها را دوباره دریافت کنید'
    if (!address) return 'یک آدرس تحویل انتخاب کنید'
    if (byCarrier && carrierError) return 'برای ادامه، هزینهٔ ارسال را دوباره دریافت کنید'
    if (byCarrier && !carriers) return 'در حال محاسبهٔ هزینهٔ ارسال…'
    if (byCarrier && !carrier) return 'روش ارسال را انتخاب کنید'
    if (needsSchedule && !days.length) return 'در حال حاضر زمان ارسالی برای انتخاب وجود ندارد'
    if (needsSchedule && !slot) return 'زمان ارسال را انتخاب کنید'
    return ''
  }, [quotation, quotationReviewed, orderPauseNotice, cart.blocked, cart.hasPhysical, giftOptions?.enabled, gift.enabled, gift.recipient, physical, addressRefreshing, addressError, address, byCarrier, carrierError, carriers, carrier, needsSchedule, days.length, slot])

  async function refreshSchedule() {
    const response = await fetch('/api/delivery/schedule', { cache: 'no-store' }).catch(() => null)
    const body = await response?.json().catch(() => null)
    if (response?.ok && Array.isArray(body?.days)) setDays(body.days)
  }

  async function pay() {
    if (missing) return
    setBusy(true); setError(null)
    try {
      const result = await checkoutCart({
        shippingMode: pickup ? 'PICKUP' : 'SHIP',
        gift: cart.hasPhysical && giftOptions?.enabled && gift.enabled ? { ...gift, wrap: giftOptions.wrapEnabled && gift.wrap } : undefined,
        surface: surface === 'dashboard' ? 'dashboard' : undefined,
        addressId: physical && address ? address.id : undefined,
        delivery: physical && needsSchedule && slot && day ? { date: day.date, slotId: slot.id } : undefined,
        carrierId: physical && byCarrier && carrier ? carrier.carrierId : undefined,
        gatewayRef: gatewayRef || undefined,
        discountCode: code.trim() || undefined,
      }, quotation)
      if (result.ok) {
        const destination = checkoutDestination(result, surface)
        if (destination) {
          if (surface === 'dashboard' || (!result.paid && result.paymentUrl)) window.location.assign(destination)
          else router.push(destination)
        }
        return
      }
      if (result.code === 'DELIVERY_SLOT_FULL' || result.code === 'DELIVERY_SLOT_INVALID') { setSlotId(''); await refreshSchedule() }
      if (result.code === 'ADDRESS_NOT_FOUND') await reload()
      if (result.code === 'CARRIER_UNAVAILABLE' || result.code === 'NO_CARRIER') { setCarrierId(''); retryCarriers() }
      if (PROMO_MESSAGES[result.code]) setCodeOpen(true)
      setError({ code: result.code, message: PROMO_MESSAGES[result.code] || result.message, needed: result.needed, currency: result.currency })
    } catch {
      setError({ code: 'NETWORK_ERROR', message: 'ارتباط برقرار نشد. وضعیت سفارش‌ها را بررسی و دوباره تلاش کنید.', needed: 0 })
    } finally { setBusy(false) }
  }

  const plain = error && (PLAIN_CODES.has(error.code) || PROMO_MESSAGES[error.code])

  return <div className="sh-checkout sx-checkout" dir="rtl">
    <ol className="sh-steps" aria-label="مراحل خرید">
      <li className="is-done"><Link href={quotation ? `/quote/${quotation.token}` : checkoutPath('/cart', surface)}>{quotation ? 'پیش‌فاکتور' : 'سبد خرید'}</Link></li>
      <li className="is-current" aria-current="step">{physical ? 'آدرس و زمان ارسال' : 'بازبینی سفارش'}</li>
      <li>پرداخت</li>
    </ol>

    <div className="sh-checkout-grid">
      <div className="sh-checkout-main">
        {cart.hasPhysical && giftOptions?.enabled && <GiftOptions value={gift} onChange={setGift} wrapEnabled={giftOptions.wrapEnabled} disabled={busy} />}
        {cart.hasPhysical && delivery.pickup?.enabled && <section className="sh-panel" aria-labelledby="sh-pickup-title"><h2 id="sh-pickup-title">دریافت سفارش</h2><label className="sh-check"><input type="checkbox" checked={pickup} onChange={event=>setPickup(event.target.checked)}/>تحویل حضوری از فروشگاه، بدون هزینهٔ ارسال</label>{pickup&&<><p>{delivery.pickup.address}</p><p>{delivery.pickup.instructions}</p><p>پس از پرداخت و آماده‌شدن سفارش، پیامک کد تحویل ارسال می‌شود. موبایل حساب خود را پیش از پرداخت ثبت کنید.</p></>}</section>}
        {physical && <section className="sh-panel" aria-labelledby="sh-address-title">
          <header className="sh-panel-head">
            <h2 id="sh-address-title">آدرس تحویل سفارش</h2>
            {addresses && addresses.length > 0 && <button type="button" className="sh-link" aria-expanded={chooser} aria-controls="sh-address-list" onClick={() => setChooser((open) => !open)}>{chooser ? 'بستن' : 'تغییر یا ویرایش آدرس'}</button>}
          </header>
          {addressError && <div className="sh-notice is-error" role="alert"><p>{addressError}</p><button type="button" className="sh-btn" onClick={() => void reload()}>دریافت دوبارهٔ آدرس‌ها</button></div>}
          {addresses === null ? <div className="sh-skeleton" role="status" aria-busy="true" aria-label="در حال بارگذاری آدرس‌ها" /> : addresses.length === 0 ? <div className="sh-empty is-compact">
            <p>برای ارسال سفارش یک آدرس ثبت کنید. آدرس در <Link href="/dashboard/addresses">آدرس‌های من</Link> ذخیره می‌شود.</p>
            <button type="button" className="sh-btn sh-btn-primary" onClick={() => setDialog({ open: true, edit: null })}>+ افزودن آدرس</button>
          </div> : !chooser && address ? <div className="sh-selected-address">
            <span className="sh-pin" aria-hidden="true" />
            <div><b>{address.title}</b><AddressSummary address={address} /></div>
          </div> : <div id="sh-address-list">
            <ul className="sh-address-options" role="radiogroup" aria-label="انتخاب آدرس">
              {addresses.map((a) => <li key={a.id}>
                <label className={`sh-option${a.id === addressId ? ' is-selected' : ''}`}>
                  <input type="radio" name="address" checked={a.id === addressId} onChange={() => { setAddressId(a.id); setChooser(false) }} />
                  <div><b>{a.title}{a.isDefault && <span className="sh-badge">پیش‌فرض</span>}</b><AddressSummary address={a} /></div>
                </label>
                <button type="button" className="sh-link sh-option-edit" onClick={() => setDialog({ open: true, edit: a })}>ویرایش</button>
              </li>)}
            </ul>
            <button type="button" className="sh-btn sh-btn-ghost" onClick={() => setDialog({ open: true, edit: null })}>+ افزودن آدرس جدید</button>
          </div>}
        </section>}

        {physical && byCarrier && address && <section className="sh-panel" aria-labelledby="sh-carrier-title">
          <header className="sh-panel-head">
            <h2 id="sh-carrier-title">روش ارسال</h2>
            {carriers && <span className="sh-muted">وزن مرسوله حدود {(Math.ceil(carriers.weightGrams / 100) / 10).toLocaleString('fa-IR')} کیلوگرم · {address.city}</span>}
          </header>
          {carrierError ? <div className="sh-notice is-error" role="alert"><p>{carrierError}</p><button type="button" className="sh-btn" onClick={retryCarriers}>دریافت دوبارهٔ هزینهٔ ارسال</button></div> : !carriers ? <div className="sh-skeleton" role="status" aria-busy="true" aria-label="در حال محاسبهٔ هزینهٔ ارسال" /> : !carriers.options.some((o) => o.ok) ? <p className="sh-notice is-error" role="status">برای این آدرس روش ارسالی در دسترس نیست. آدرس دیگری انتخاب کنید یا با پشتیبانی تماس بگیرید.</p>
            : <div className="sh-carriers" role="radiogroup" aria-label="روش ارسال">
              {carriers.options.map((o) => o.ok ? <label key={o.carrierId} className={`sh-option sh-carrier${o.carrierId === carrierId ? ' is-selected' : ''}`}>
                <input type="radio" name="carrier" checked={o.carrierId === carrierId} onChange={() => { setCarrierId(o.carrierId); setSlotId('') }} />
                <div className="sh-carrier-body">
                  <b>{o.name}</b>
                  <small className="sh-muted">{o.scheduled ? 'تحویل در روز و ساعت انتخابی' : `تحویل ${o.eta}`} · {ZONE_FA[o.zone] || o.zone}{o.note ? ` · ${o.note}` : ''}</small>
                </div>
                <span className="sh-carrier-fee">{o.collect ? <><span className="sh-collect">پس‌کرایه</span>{o.fee > 0 && <small className="sh-free-by">+ <Amount value={o.fee} currency={cart.currency} /> همین حالا</small>}</> : o.fee > 0 ? <Amount value={o.fee} currency={cart.currency} /> : <span className="sh-free">رایگان</span>}{o.freeBy && <small className="sh-free-by">{o.freeBy}</small>}</span>
              </label> : <div key={o.carrierId} className="sh-option sh-carrier is-off" aria-disabled="true">
                <div className="sh-carrier-body"><b>{o.name}</b><small className="sh-muted">{o.reason}</small></div>
              </div>)}
            </div>}
        </section>}

        {physical && (!byCarrier || needsSchedule || !carrier) && <section className="sh-panel" aria-labelledby="sh-time-title">
          <header className="sh-panel-head">
            <h2 id="sh-time-title">زمان ارسال</h2>
            {slot && day && <span className="sh-muted">{fullDate.format(asDate(day.date))} · ساعت {slot.label}</span>}
          </header>
          <ul className="sx-ship-items" aria-label="کالاهای ارسالی">{cart.lines.filter((line) => line.kind === 'PHYSICAL').map((line) => <li key={line.id} title={line.name}>{line.image ? <img src={line.image} alt={line.name} /> : <StoreIcon name="box" size={22} />}{line.quantity > 1 && <span className="num">{line.quantity.toLocaleString('fa-IR')}×</span>}</li>)}</ul>
          {!needsSchedule ? <p className="sh-muted">سفارش پس از پردازش در اولین فرصت ارسال می‌شود و کد رهگیری در بخش سفارش‌ها نمایش داده می‌شود.</p>
            : !days.length ? <p className="sh-notice is-error" role="status">فعلاً زمان ارسالی برای انتخاب وجود ندارد؛ کمی بعد دوباره سر بزنید.</p>
              : <>
                <div className="sh-days" role="tablist" aria-label="روز ارسال">
                  {days.map((d) => {
                    const open = d.slots.some((s) => s.available)
                    return <button key={d.date} type="button" role="tab" aria-selected={d.date === date} className="sh-day" disabled={!open} onClick={() => { setDate(d.date); setSlotId('') }}>
                      <span className="sh-day-name">{WEEKDAY_FA[d.weekday]}</span>
                      <span className="sh-day-date">{dayMonth.format(asDate(d.date))}</span>
                      {!open && <span className="sh-day-full">تکمیل</span>}
                    </button>
                  })}
                </div>
                {day && <div className="sh-slots" role="radiogroup" aria-label={`بازهٔ زمانی ${WEEKDAY_FA[day.weekday]}`}>
                  {day.slots.map((s) => <label key={s.id} className={`sh-slot${s.id === slotId ? ' is-selected' : ''}${s.available ? '' : ' is-full'}`}>
                    <input type="radio" name="slot" value={s.id} checked={s.id === slotId} disabled={!s.available} onChange={() => setSlotId(s.id)} />
                    <span className="sh-slot-time">ساعت {s.label}</span>
                    <span className="sh-slot-note">{!s.available ? 'ظرفیت تکمیل' : s.remaining > 0 && s.remaining <= 3 ? `${s.remaining.toLocaleString('fa-IR')} ظرفیت باقی‌مانده` : shippingFee > 0 ? <Amount value={shippingFee} currency={cart.currency} /> : 'ارسال رایگان'}</span>
                  </label>)}
                </div>}
              </>}
        </section>}

        {!physical && <section className="sh-panel" aria-labelledby="sh-items-title">
          <header className="sh-panel-head"><h2 id="sh-items-title">کالاهای سفارش</h2><span className="sh-muted">{cart.lines.every((line) => line.instant) ? 'تحویل آنی پس از پرداخت' : 'تحویل دیجیتال در حساب کاربری پس از تأیید سفارش'}</span></header>
          <ul className="sx-review-lines">{cart.lines.map((line) => <li key={line.id}>{line.image ? <img src={line.image} alt="" /> : <StoreIcon name="box" size={22} />}<span><b>{line.name}</b>{line.variantName && <small>{line.variantName}</small>}</span><span className="num">{line.quantity.toLocaleString('fa-IR')}×</span></li>)}</ul>
        </section>}

        {gateways.length > 1 && total > balance && <section className="sh-panel" aria-labelledby="sh-pay-title">
          <header className="sh-panel-head"><h2 id="sh-pay-title">روش پرداخت</h2></header>
          <div className="sh-gateways" role="radiogroup" aria-label="درگاه پرداخت">
            {gateways.map((g) => <label key={g.ref} className={`sh-option${g.ref === gatewayRef ? ' is-selected' : ''}`}>
              <input type="radio" name="gateway" checked={g.ref === gatewayRef} onChange={() => setGatewayRef(g.ref)} />
              <div><b>{g.label}</b>{g.feePercent > 0 && <small className="sh-muted">کارمزد {g.feePercent.toLocaleString('fa-IR')}٪</small>}</div>
            </label>)}
          </div>
        </section>}
      </div>

      <aside className="sh-summary" aria-labelledby="sh-summary-title">
        <>{quotation && <label className="sh-check"><input type="checkbox" checked={quotationReviewed} onChange={event => setQuotationReviewed(event.target.checked)} disabled={busy} />قیمت فعلی، تخفیف و شرایط پیش‌فاکتور را بررسی و تأیید کردم</label>}</><h2 id="sh-summary-title">خلاصهٔ سفارش <small className="num">({cart.count.toLocaleString('fa-IR')} کالا)</small></h2>
        <dl className="sh-totals">
          <div><dt>قیمت کالاها</dt><dd><Amount value={cart.listTotal} currency={cart.currency} /></dd></div>
          {cart.saving > 0 && <div className="sx-save-row"><dt>{quotation ? 'تخفیف فروشنده' : 'سود شما'}</dt><dd>−<Amount value={cart.saving} currency={cart.currency} /></dd></div>}
          {physical && <div><dt>هزینهٔ ارسال{carrier && <small className="sh-muted"> ({carrier.name})</small>}</dt><dd>{byCarrier && !carrier ? <span className="sh-muted">—</span> : carrier?.collect ? <span className="sh-collect">پس‌کرایه{shippingFee > 0 && <> + <Amount value={shippingFee} currency={cart.currency} /></>}</span> : shippingFee > 0 ? <Amount value={shippingFee} currency={cart.currency} /> : <span className="sh-free">رایگان</span>}</dd></div>}
          {balance > 0 && <div><dt>از کیف پول</dt><dd>−<Amount value={Math.min(balance, total)} currency={cart.currency} /></dd></div>}
          <div className="sh-total"><dt>مبلغ قابل پرداخت</dt><dd><Amount value={Math.max(0, total - balance)} currency={cart.currency} /></dd></div>
        </dl>
        <div className="sx-code">
          {!quotation && (!codeOpen ? <button type="button" className="sh-link" onClick={() => setCodeOpen(true)}><StoreIcon name="percent" size={15} />کد تخفیف دارید؟</button>
            : <label><span>کد تخفیف</span><input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} dir="ltr" maxLength={32} placeholder="CODE" /><small>تخفیف هنگام ثبت سفارش اعمال و در فاکتور نمایش داده می‌شود.</small></label>)}
        </div>
        <button type="button" className="sh-btn sh-btn-primary sh-pay" disabled={busy || !!missing} onClick={() => void pay()}>
          {busy ? 'در حال ثبت سفارش…' : covered ? 'ثبت سفارش و پرداخت از کیف پول' : 'ثبت سفارش و پرداخت'}
        </button>
        {missing && <p className="sh-muted sh-center">{missing}</p>}
        <p className="sh-fineprint">{physical ? 'با ثبت سفارش، کالاها و زمان ارسال برای شما رزرو می‌شوند. سفارش پرداخت‌نشده پس از مدتی آزاد می‌شود.' : 'با ثبت سفارش، کالاها برای شما رزرو می‌شوند.'}</p>
        <div ref={errorRef} tabIndex={-1} className="sh-error-slot">
          {error && (plain ? <p className="sh-notice is-error" role="alert">{error.message}</p> : <CheckoutError code={error.code} message={error.message} needed={error.needed} currency={error.currency || cart.currency} />)}
        </div>
      </aside>
    </div>

    <AddressDialog open={dialog.open} initial={dialog.edit} onClose={() => setDialog({ open: false, edit: null })} onSaved={async (saved) => {
      setAddressRefreshing(true)
      setDialog({ open: false, edit: null })
      try { await reload(); setAddressId(saved.id); setChooser(false) }
      finally { setAddressRefreshing(false) }
    }} />
  </div>
}
