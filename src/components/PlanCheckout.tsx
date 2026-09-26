'use client'
import { useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { useI18n } from '@/i18n/LocaleProvider'
import { money, startCheckout, type CheckoutGatewayChoice } from '@/modules/checkout/ui/client'
import { planName } from '@/modules/catalog/domain/plan-locale'

export default function PlanCheckout({
  plan,
  offerId,
  prefix,
  gateways,
}: {
  plan: { id: number; name: string; nameEn?: string; price: number; currency: string; days: number; trafficGB: number }
  offerId?: number
  prefix: string
  gateways: CheckoutGatewayChoice[]
}) {
  const { locale } = useI18n()
  const fa = locale === 'fa'
  const { status } = useSession()
  const [name, setName] = useState('')
  const [step, setStep] = useState(2)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [discountCode, setDiscountCode] = useState('')
  const [discountQuote, setDiscountQuote] = useState<{ discount: number; total: number } | null>(null)
  const [gatewayRef, setGatewayRef] = useState(() => gateways.find((g) => g.isDefault)?.ref || gateways[0]?.ref || '')
  const lock = useRef(false)
  const [restored, setRestored] = useState(false)

  useEffect(() => {
    try { setName(sessionStorage.getItem(`checkout.name.${plan.id}`) || '') } catch {}
    setRestored(true)
  }, [plan.id])
  useEffect(() => {
    if (restored) {
      try { sessionStorage.setItem(`checkout.name.${plan.id}`, name) } catch {}
    }
  }, [name, plan.id, restored])
  useEffect(() => {
    if (!gateways.some((g) => g.ref === gatewayRef)) setGatewayRef(gateways.find((g) => g.isDefault)?.ref || gateways[0]?.ref || '')
  }, [gateways, gatewayRef])

  const valid = !name.trim() || /^[a-z0-9_]{3,30}$/.test(name.trim())
  async function checkDiscount() {
    setError(''); setDiscountQuote(null)
    if (!discountCode.trim()) return
    try {
      const response = await fetch('/api/promotions/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ planId: plan.id, offerId, code: discountCode.trim() }) })
      const data = await response.json()
      if (!response.ok) throw Error()
      setDiscountQuote({ discount: Number(data.discount), total: Number(data.total) })
    } catch { setError(fa ? 'کد تخفیف برای این سفارش معتبر نیست.' : 'This discount code is not valid for this order.') }
  }
  async function pay() {
    if (lock.current) return
    lock.current = true; setBusy(true); setError('')
    try {
      const result = await startCheckout({ ...(offerId ? { offerId } : { planId: plan.id }), username: name.trim() || undefined, gatewayRef: gatewayRef || undefined, discountCode: discountCode.trim() || undefined })
      if (!result.ok) {
        if (result.code === 'GATEWAY_AMBIGUOUS' && result.invoiceUrl) { window.location.assign(result.invoiceUrl); return }
        setError(result.code === 'INVALID_USERNAME' ? (fa ? 'نام اشتراک معتبر نیست.' : 'Invalid subscription name.') : result.code === 'USERNAME_TAKEN' ? (fa ? 'این نام اشتراک قبلاً استفاده شده است.' : 'This subscription name is already taken.') : result.code === 'INSUFFICIENT_FUNDS' ? (fa ? 'موجودی کیف پول کافی نیست.' : 'Insufficient wallet balance.') : result.code.startsWith('PROMOTION_') ? (fa ? 'کد تخفیف معتبر نیست یا ظرفیت آن تمام شده است.' : 'The discount code is invalid or fully used.') : (fa ? 'پرداخت انجام نشد؛ سفارش‌ها را بررسی کنید یا با پشتیبانی تماس بگیرید.' : 'Payment could not be completed. Check your orders or contact support.')); if (['INVALID_USERNAME', 'USERNAME_TAKEN'].includes(result.code)) setStep(2); return
      }
      try { sessionStorage.removeItem(`checkout.name.${plan.id}`) } catch {}
      const destination = result.paid ? `/payment/result?invoice=${encodeURIComponent(result.invoiceNumber)}` : result.paymentUrl || result.invoiceUrl
      if (destination) window.location.assign(destination)
      else setError(fa ? 'مسیر پرداخت دریافت نشد؛ سفارش‌ها را بررسی کنید.' : 'Payment destination unavailable. Check your orders.')
    } catch {
      setError(fa ? 'پاسخ پرداخت دریافت نشد. پیش از تلاش مجدد، سفارش‌ها را بررسی کنید.' : 'Payment response unavailable. Check your orders before retrying.')
    } finally {
      lock.current = false
      setBusy(false)
    }
  }

  const gateway = gateways.find((g) => g.ref === gatewayRef)
  const checkoutReturn = offerId ? `/checkout?offerId=${offerId}` : `/checkout?planId=${plan.id}`
  const promotionField = <div className="card mt-4"><label className="label" htmlFor="checkout-discount">{fa ? 'کد تخفیف' : 'Discount code'}</label><div className="flex gap-2 mt-2"><input id="checkout-discount" className="input" dir="ltr" maxLength={32} value={discountCode} onChange={e => { setDiscountCode(e.target.value.toUpperCase()); setDiscountQuote(null) }} placeholder={fa ? 'کد خود را وارد کنید' : 'Enter your code'} /><button className="btn btn-ghost" type="button" onClick={checkDiscount} disabled={status !== 'authenticated'}>{fa ? 'بررسی' : 'Apply'}</button></div>{discountQuote && <p className="success-text mt-3">{fa ? 'تخفیف' : 'Discount'}: {money(discountQuote.discount, plan.currency, fa ? 'fa-IR' : 'en-US')} · {fa ? 'مبلغ نهایی' : 'Total'}: {money(discountQuote.total, plan.currency, fa ? 'fa-IR' : 'en-US')}</p>}</div>
  return <div className="checkout-flow"><ol className="checkout-steps">{(fa ? ['انتخاب پلن', 'نام اشتراک', 'بررسی و پرداخت'] : ['Choose plan', 'Subscription name', 'Review & pay']).map((label, index) => <li key={label} aria-current={step === index + 1 ? 'step' : undefined} className={step >= index + 1 ? 'is-current' : ''}><b>{index + 1}</b>{label}</li>)}</ol><div className="checkout-columns"><section className="content-reading"><h1 className="h2">{step === 2 ? (fa ? 'اشتراکت چه نامی داشته باشد؟' : 'Name your subscription') : (fa ? 'بررسی نهایی سفارش' : 'Review your order')}</h1>{step === 2 ? <form onSubmit={e => { e.preventDefault(); if (valid) { setError(''); setStep(3) } }}><label className="label mt-6" htmlFor="subscription-name">{fa ? 'نام اشتراک (اختیاری)' : 'Subscription name (optional)'}</label><input id="subscription-name" className="input" dir="ltr" value={name} maxLength={30} onChange={e => setName(e.target.value)} placeholder={`${prefix}_…`} autoComplete="off" aria-describedby="name-hint" /><p id="name-hint" className="muted text-sm mt-3">{fa ? `خالی بگذارید تا نامی با پیشوند ${prefix} خودکار ساخته شود. نام دلخواه: ۳ تا ۳۰ حرف کوچک انگلیسی، عدد یا _.` : `Leave blank for an automatic name starting with ${prefix}. Custom names: 3–30 lowercase letters, digits or underscores.`}</p>{!valid && <p className="error-text mt-3">{fa ? 'فرمت نام را اصلاح کنید.' : 'Please correct the name format.'}</p>}<button className="btn btn-primary mt-6" disabled={!valid}>{fa ? 'ادامه و بررسی سفارش' : 'Continue to review'}</button></form> : <><p className="muted mt-4">{fa ? 'نام اشتراک:' : 'Subscription name:'} <b dir="ltr">{name.trim() || `${prefix}_…`}</b></p><p className="muted text-sm mt-4">{fa ? 'ابتدا اعتبار کیف پول استفاده می‌شود؛ در صورت نیاز، باقی مبلغ با درگاه انتخاب‌شده پرداخت خواهد شد. تا تأیید این مرحله پرداختی انجام نمی‌شود.' : 'Wallet credit is applied first; any remainder is paid with the selected gateway. No payment occurs before confirmation.'}</p>{promotionField}{gateways.length > 0 && <div className="card mt-4"><label className="label" htmlFor="checkout-gateway">{fa ? 'درگاه پرداخت' : 'Payment gateway'}</label>{gateways.length === 1 ? <div className="font-semibold mt-1">🏦 {gateway?.label || gateways[0].label}</div> : <select id="checkout-gateway" className="select" value={gatewayRef} onChange={(e) => setGatewayRef(e.target.value)}>{gateways.map((item) => <option key={item.ref} value={item.ref}>{item.label}{item.feePercent ? ` · ${item.feePercent}%` : ''}</option>)}</select>}<p className="muted text-xs mt-2">{fa ? 'درگاه پیش‌فرض از قبل انتخاب شده؛ می‌توانید هر درگاه فعال و سازگار را انتخاب کنید.' : 'The default gateway is preselected; you can choose any active compatible gateway.'}</p></div>}{gateways.length === 0 && <p className="muted text-sm mt-4">{fa ? 'اگر موجودی کیف پول کافی نباشد، درگاه پرداخت فعالی برای این ارز وجود ندارد.' : 'If wallet balance is insufficient, no active gateway supports this currency.'}</p>}<div className="flex flex-wrap gap-3 mt-6"><button className="btn btn-ghost" disabled={busy} onClick={() => setStep(2)}>{fa ? 'ویرایش نام' : 'Edit name'}</button>{status === 'authenticated' ? <button className="btn btn-primary" disabled={busy} onClick={pay}>{busy ? (fa ? 'در حال پردازش…' : 'Processing…') : (fa ? 'تأیید و پرداخت' : 'Confirm & pay')}</button> : <Link className="btn btn-primary" href={`/login?next=${encodeURIComponent(checkoutReturn)}`}>{fa ? 'ورود برای پرداخت' : 'Sign in to pay'}</Link>}</div></>}{error && <p className="error-text mt-4" role="alert">{error}</p>}</section><aside className="content-reading checkout-summary"><span className="content-eyebrow">{fa ? 'پلن انتخاب‌شده' : 'Selected plan'}</span><h2 className="h2 mt-4">{planName(plan, locale)}</h2><p className="muted mt-3">{plan.trafficGB || '∞'} GB · {plan.days} {fa ? 'روز' : 'days'}</p><strong className="checkout-price" dir="ltr">{money(discountQuote?.total ?? plan.price, plan.currency, fa ? 'fa-IR' : 'en-US')}</strong><Link href="/plans" className="btn btn-ghost">{fa ? 'تغییر پلن' : 'Change plan'}</Link></aside></div></div>
}
