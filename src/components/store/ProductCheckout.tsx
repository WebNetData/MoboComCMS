'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from '@/components/AppLink'
import { useRouter } from '@/platform/routing/navigation'
import CheckoutError from '@/components/CheckoutError'
import { AddressDialog, AddressSummary, useAddresses, type SavedAddress } from '@/components/store/AddressBook'
import { fetchWalletBalance, money, startCheckout, type CheckoutGatewayChoice } from '@/modules/checkout/ui/client'
import { WEEKDAY_FA, type ScheduleDay } from '@/modules/shipping/domain/shipping'

type Item = {
  productId: number; slug: string; name: string; image: string; variantId: number | null; variantName: string; inStock: boolean
  currency: string; price: number; regularPrice: number; shipping: number
}
type Delivery = { enabled: boolean; days: ScheduleDay[] }

const dayMonth = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { day: 'numeric', month: 'long', timeZone: 'UTC' })
const fullDate = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
const asDate = (day: string) => new Date(`${day}T12:00:00Z`)
/** Codes whose server message is already written for the customer. */
const SHIPPING_CODES = new Set(['SHIPPING_REQUIRED', 'ADDRESS_NOT_FOUND', 'DELIVERY_REQUIRED', 'DELIVERY_SLOT_INVALID', 'DELIVERY_SLOT_FULL', 'OUT_OF_STOCK', 'VARIANT_NOT_FOUND', 'MEMBERS_ONLY'])

export default function ProductCheckout({ item, delivery, gateways }: { item: Item; delivery: Delivery; gateways: CheckoutGatewayChoice[] }) {
  const router = useRouter()
  const { addresses, error: addressError, reload } = useAddresses()
  const [addressId, setAddressId] = useState(0)
  const [chooser, setChooser] = useState(false)
  const [dialog, setDialog] = useState<{ open: boolean; edit: SavedAddress | null }>({ open: false, edit: null })
  const [days, setDays] = useState(delivery.days)
  const [date, setDate] = useState(() => delivery.days.find((d) => d.slots.some((s) => s.available))?.date || '')
  const [slotId, setSlotId] = useState('')
  const [gatewayRef, setGatewayRef] = useState(() => gateways.find((g) => g.isDefault)?.ref || gateways[0]?.ref || '')
  const [balance, setBalance] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<{ code: string; message: string; needed: number; currency?: string } | null>(null)
  const errorRef = useRef<HTMLDivElement>(null)

  useEffect(() => { let alive = true; fetchWalletBalance(item.currency).then((value) => alive && setBalance(value)); return () => { alive = false } }, [item.currency])
  // Default to the default address once the book loads (or after the chosen one was deleted).
  useEffect(() => {
    if (!addresses?.length) { setAddressId(0); return }
    setAddressId((current) => addresses.some((a) => a.id === current) ? current : (addresses.find((a) => a.isDefault) || addresses[0]).id)
  }, [addresses])
  useEffect(() => { if (error) errorRef.current?.focus() }, [error])

  const address = addresses?.find((a) => a.id === addressId) || null
  const day = days.find((d) => d.date === date) || null
  const slot = day?.slots.find((s) => s.id === slotId && s.available) || null
  const total = item.price + item.shipping
  const covered = balance >= total
  const locale = 'fa-IR'
  const fmt = (value: number) => money(value, item.currency, locale)

  const missing = useMemo(() => {
    if (!item.inStock) return 'این کالا ناموجود است'
    if (!address) return 'یک آدرس تحویل انتخاب کنید'
    if (delivery.enabled && days.length && !slot) return 'زمان ارسال را انتخاب کنید'
    if (delivery.enabled && !days.length) return 'در حال حاضر زمان ارسالی برای انتخاب وجود ندارد'
    return ''
  }, [item.inStock, address, delivery.enabled, days.length, slot])

  async function refreshSchedule() {
    const response = await fetch('/api/delivery/schedule', { cache: 'no-store' }).catch(() => null)
    const body = await response?.json().catch(() => null)
    if (response?.ok && Array.isArray(body?.days)) setDays(body.days)
  }

  async function pay() {
    if (missing || !address) return
    setBusy(true); setError(null)
    try {
      const result = await startCheckout({
        productId: item.productId, variantId: item.variantId || undefined, addressId: address.id,
        delivery: slot && day ? { date: day.date, slotId: slot.id } : undefined, gatewayRef: gatewayRef || undefined,
      })
      if (result.ok) {
        if (result.paid || result.invoiceUrl) router.push(`/payment/result?invoice=${result.invoiceNumber}`)
        else if (result.paymentUrl) window.location.href = result.paymentUrl
        return
      }
      if (result.code === 'DELIVERY_SLOT_FULL' || result.code === 'DELIVERY_SLOT_INVALID') { setSlotId(''); await refreshSchedule() }
      if (result.code === 'ADDRESS_NOT_FOUND') await reload()
      setError({ code: result.code, message: result.message, needed: result.needed, currency: result.currency })
    } catch {
      setError({ code: 'NETWORK_ERROR', message: 'ارتباط برقرار نشد. وضعیت سفارش‌ها را بررسی و دوباره تلاش کنید.', needed: 0 })
    } finally { setBusy(false) }
  }

  return <div className="sh-checkout" dir="rtl">
    <ol className="sh-steps" aria-label="مراحل خرید">
      <li className="is-done"><Link href={`/products/${item.slug}`}>انتخاب کالا</Link></li>
      <li className="is-current" aria-current="step">آدرس و زمان ارسال</li>
      <li>پرداخت</li>
    </ol>

    <div className="sh-checkout-grid">
      <div className="sh-checkout-main">
        <section className="sh-panel" aria-labelledby="sh-address-title">
          <header className="sh-panel-head">
            <h2 id="sh-address-title">آدرس تحویل سفارش</h2>
            {addresses && addresses.length > 0 && <button type="button" className="sh-link" aria-expanded={chooser} aria-controls="sh-address-list" onClick={() => setChooser((open) => !open)}>{chooser ? 'بستن' : 'تغییر یا ویرایش آدرس'}</button>}
          </header>
          {addressError && <p className="sh-notice is-error" role="alert">{addressError}</p>}
          {addresses === null ? <div className="sh-skeleton" role="status" aria-busy="true" aria-label="در حال بارگذاری آدرس‌ها" /> : addresses.length === 0 ? <div className="sh-empty is-compact">
            <p>برای ارسال این کالا یک آدرس ثبت کنید. آدرس در <Link href="/dashboard/addresses">آدرس‌های من</Link> ذخیره می‌شود و دفعهٔ بعد فقط انتخابش می‌کنید.</p>
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
        </section>

        <section className="sh-panel" aria-labelledby="sh-time-title">
          <header className="sh-panel-head">
            <h2 id="sh-time-title">زمان ارسال</h2>
            {slot && day && <span className="sh-muted">{fullDate.format(asDate(day.date))} · ساعت {slot.label}</span>}
          </header>
          {!delivery.enabled ? <p className="sh-muted">سفارش پس از پردازش در اولین فرصت ارسال می‌شود و کد رهگیری در بخش سفارش‌ها نمایش داده می‌شود.</p>
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
                    <span className="sh-slot-note">{!s.available ? 'ظرفیت تکمیل' : s.remaining > 0 && s.remaining <= 3 ? `${s.remaining.toLocaleString('fa-IR')} ظرفیت باقی‌مانده` : item.shipping > 0 ? fmt(item.shipping) : 'ارسال رایگان'}</span>
                  </label>)}
                </div>}
              </>}
        </section>

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
        <h2 id="sh-summary-title">خلاصهٔ سفارش</h2>
        <div className="sh-item">
          {item.image ? <img src={item.image} alt="" width={64} height={64} /> : <span className="sh-item-ph" aria-hidden="true" />}
          <div><b>{item.name}</b>{item.variantName && <small>{item.variantName}</small>}</div>
        </div>
        <dl className="sh-totals">
          <div><dt>قیمت کالا</dt><dd>{item.regularPrice > item.price && <s>{fmt(item.regularPrice)}</s>}{fmt(item.price)}</dd></div>
          <div><dt>هزینهٔ ارسال</dt><dd>{item.shipping > 0 ? fmt(item.shipping) : <span className="sh-free">رایگان</span>}</dd></div>
          {balance > 0 && <div><dt>از کیف پول</dt><dd>−{fmt(Math.min(balance, total))}</dd></div>}
          <div className="sh-total"><dt>مبلغ قابل پرداخت</dt><dd>{fmt(Math.max(0, total - balance))}</dd></div>
        </dl>
        <button type="button" className="sh-btn sh-btn-primary sh-pay" disabled={busy || !!missing} onClick={() => void pay()}>
          {busy ? 'در حال ثبت سفارش…' : covered ? 'ثبت سفارش و پرداخت از کیف پول' : 'ثبت سفارش و پرداخت'}
        </button>
        {missing && <p className="sh-muted sh-center">{missing}</p>}
        <p className="sh-fineprint">با ثبت سفارش، زمان ارسال برای شما رزرو می‌شود. سفارش پرداخت‌نشده پس از دو ساعت آزاد می‌شود.</p>
        <div ref={errorRef} tabIndex={-1} className="sh-error-slot">
          {error && (SHIPPING_CODES.has(error.code) ? <p className="sh-notice is-error" role="alert">{error.message}</p> : <CheckoutError code={error.code} message={error.message} needed={error.needed} currency={error.currency || item.currency} />)}
        </div>
      </aside>
    </div>

    <AddressDialog open={dialog.open} initial={dialog.edit} onClose={() => setDialog({ open: false, edit: null })} onSaved={async (saved) => {
      setDialog({ open: false, edit: null }); await reload(); setAddressId(saved.id); setChooser(false)
    }} />
  </div>
}
