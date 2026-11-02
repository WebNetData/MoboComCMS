'use client'

import { useMemo, useRef, useState } from 'react'
import Link from '@/components/AppLink'
import { useI18n } from '@/i18n/LocaleProvider'
import { money, startCheckout, type CheckoutGatewayChoice } from '@/modules/checkout/ui/client'
import type { VipGroup } from '@/modules/membership/server/catalog'

type Plan = VipGroup['plans'][number]
const LIFETIME = -1, FIXED = -2

const spanOf = (plan: Plan) => (plan.billing === 'LIFETIME' ? LIFETIME : plan.billing === 'FIXED' ? FIXED : plan.days)

function Check({ on = true }: { on?: boolean }) {
  return on
    ? <svg className="vp-check" viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true"><path d="M3 8.5 6.5 12 13 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
    : <span className="vp-none" aria-hidden="true">—</span>
}

/** The tiers side by side with a switch between durations, a comparison of what each opens, and checkout under them. */
export default function VipPricing({ groups, gateways, rank, signedIn }: { groups: VipGroup[]; gateways: Record<string, CheckoutGatewayChoice[]>; rank: number; signedIn: boolean }) {
  const { locale } = useI18n()
  const fa = locale === 'fa'
  const L = (persian: string, english: string) => (fa ? persian : english)
  const loc = fa ? 'fa-IR' : 'en-US'
  const tiered = groups.some((group) => group.tier)
  const all = useMemo(() => groups.flatMap((group) => group.plans), [groups])
  const spans = useMemo(() => [...new Set(all.map(spanOf))].sort((a, b) => (a < 0 ? 1e6 - a : a) - (b < 0 ? 1e6 - b : b)), [all])
  const start = all.find((plan) => plan.highlight) || all[0]
  const [span, setSpan] = useState(start ? spanOf(start) : 0)
  const [selected, setSelected] = useState<number | null>(start?.id ?? null)
  const [trial, setTrial] = useState(false)
  const [offer, setOffer] = useState('')
  const [code, setCode] = useState('')
  const [discount, setDiscount] = useState<{ code: string; total: number } | null>(null)
  const [gatewayRef, setGatewayRef] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const lock = useRef(false)

  const plan = all.find((row) => row.id === selected) || null
  const options = plan ? gateways[plan.currency] || [] : []
  const ref = options.some((g) => g.ref === gatewayRef) ? gatewayRef : options.find((g) => g.isDefault)?.ref || options[0]?.ref || ''
  const price = (value: number, currency: string) => money(value, currency, loc)
  const spanName = (value: number) => value === LIFETIME ? L('مادام‌العمر', 'Lifetime') : value === FIXED ? L('تا تاریخ مشخص', 'Fixed term') : ({ 30: L('ماهانه', 'Monthly'), 90: L('سه‌ماهه', 'Quarterly'), 180: L('شش‌ماهه', 'Half-yearly'), 365: L('سالانه', 'Yearly') } as Record<number, string>)[value] || `${value.toLocaleString(loc)} ${L('روز', 'days')}`
  const pick = (row: Plan) => { setSelected(row.id); setTrial(false); setOffer(''); setDiscount(null); setCode(''); setError('') }
  const shown = (group: VipGroup) => (group.tier ? [group.plans.find((row) => spanOf(row) === span) || group.plans[0]] : group.plans)
  const trialFree = !!plan && plan.trialPrice === 0 && (plan.offer?.fee ?? plan.signupFee) === 0
  const due = !plan ? 0 : trial ? plan.trialPrice + (plan.offer?.fee ?? plan.signupFee) : discount ? discount.total : plan.offer ? plan.offer.amount : plan.price + plan.signupFee

  async function applyCode() {
    if (!plan || !code.trim()) return
    setBusy(true); setError('')
    const response = await fetch('/api/promotions/quote', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, membershipPlanId: plan.id, trial, offer: offer || undefined }) }).catch(() => null)
    const data = await response?.json().catch(() => null)
    setBusy(false)
    if (response?.ok) setDiscount({ code: code.trim().toUpperCase(), total: data.total })
    else { setDiscount(null); setError(L('این کد برای این پلن معتبر نیست', 'This code is not valid for this plan')) }
  }

  async function pay() {
    if (!plan || lock.current) return
    lock.current = true; setBusy(true); setError('')
    try {
      if (trial && trialFree) {
        const response = await fetch('/api/me/membership', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'trial', planId: plan.id }) }).catch(() => null)
        const data = await response?.json().catch(() => null)
        if (response?.ok) window.location.assign('/vip/account')
        else setError(data?.error || L('شروع دورهٔ آزمایشی انجام نشد', 'The trial could not start'))
        return
      }
      const result = await startCheckout({ membershipPlanId: plan.id, gatewayRef: ref || undefined, ...(trial ? { membershipTrial: true } : {}), ...(offer ? { membershipOffer: offer } : {}), ...(discount ? { discountCode: discount.code } : {}) })
      if (!result.ok) {
        if (result.code === 'GATEWAY_AMBIGUOUS' && result.invoiceUrl) { window.location.assign(result.invoiceUrl); return }
        setError(result.code === 'INSUFFICIENT_FUNDS' ? L('موجودی کیف پول کافی نیست و درگاهی برای این ارز فعال نیست.', 'Not enough wallet balance and no gateway for this currency.') : result.message || L('پرداخت انجام نشد', 'Payment failed'))
        return
      }
      const destination = result.paid ? `/payment/result?invoice=${encodeURIComponent(result.invoiceNumber)}` : result.paymentUrl || result.invoiceUrl
      if (destination) window.location.assign(destination)
      else setError(L('مسیر پرداخت دریافت نشد؛ سفارش‌ها را بررسی کنید.', 'No payment destination. Check your orders.'))
    } catch {
      setError(L('پاسخ پرداخت دریافت نشد. پیش از تلاش دوباره، سفارش‌ها را بررسی کنید.', 'No payment response. Check your orders before trying again.'))
    } finally {
      lock.current = false; setBusy(false)
    }
  }

  if (!all.length) return <p className="muted vip-noplans">{L('پلن‌های اشتراک ویژه به‌زودی اضافه می‌شوند.', 'VIP plans are coming soon.')}</p>

  const rows = tiered ? [...new Set(groups.flatMap((group) => group.plans.flatMap((row) => row.perks.map((perk) => (fa ? perk.fa : perk.en || perk.fa)))))] : []
  const tierGroups = groups.filter((group) => group.tier)
  const has = (group: VipGroup, line: string) => group.plans.some((row) => row.perks.some((perk) => (fa ? perk.fa : perk.en || perk.fa) === line))

  return <div className="vp">
    {tiered && spans.length > 1 && <div className="vp-spans" role="radiogroup" aria-label={L('مدت اشتراک', 'Billing period')}>
      {spans.map((value) => <button key={value} type="button" role="radio" aria-checked={span === value} className={span === value ? 'is-on' : ''} onClick={() => { setSpan(value); const next = groups.flatMap(shown).find((row) => row.tierId === plan?.tierId && spanOf(row) === value) || groups.flatMap((group) => group.plans).find((row) => row.tierId === plan?.tierId && spanOf(row) === value); if (next) pick(next) }}>{spanName(value)}</button>)}
    </div>}

    <div className={`vp-cards is-${Math.min(4, groups.reduce((sum, group) => sum + shown(group).length, 0))}`}>
      {groups.flatMap((group) => shown(group).map((row) => {
        const name = group.tier ? group.tier.name : fa ? row.name : row.nameEn || row.name
        const current = !!group.tier && group.tier.rank === rank
        const amount = row.offer && !row.offer.refused ? row.offer.amount - row.offer.fee : row.price
        const month = row.billing === 'DAYS' && row.days >= 60 ? (row.price / row.days) * 30 : 0
        return <article key={row.id} className={`vp-card${row.highlight ? ' is-featured' : ''}${selected === row.id ? ' is-chosen' : ''}`} style={{ ['--tier' as string]: group.tier?.color || 'var(--vip-gold-2)' }}>
          {row.highlight && <span className="vp-flag">{L('پیشنهاد ما', 'Our pick')}</span>}
          <header><h3>{name}</h3>{(group.tier?.tagline || (fa ? row.description : row.descriptionEn || row.description)) && <p>{group.tier?.tagline || (fa ? row.description : row.descriptionEn || row.description)}</p>}</header>
          <div className="vp-price">
            {row.compareAt > row.price && <s dir="ltr">{price(row.compareAt, row.currency)}</s>}
            <strong dir="ltr">{price(amount, row.currency)}</strong>
            <small>{row.billing === 'LIFETIME' ? L('یک‌بار پرداخت، برای همیشه', 'One payment, for life') : row.billing === 'FIXED' && row.fixedEndsAt ? `${L('تا', 'until')} ${new Date(row.fixedEndsAt).toLocaleDateString(loc, { timeZone: 'Asia/Tehran' })}` : `${row.days.toLocaleString(loc)} ${L('روز', 'days')}`}{month > 0 && <> · <span dir="ltr">{price(Math.round(month), row.currency)}</span> {L('در ماه', 'a month')}</>}</small>
            {row.offer && row.offer.credit > 0 && <small className="vp-credit">{L('با کسر اعتبار اشتراک فعلی', 'After your current plan\'s credit')}</small>}
            {row.signupFee > 0 && (!row.offer || row.offer.fee > 0) && <small>{L('هزینهٔ عضویت', 'Signup fee')}: <span dir="ltr">{price(row.signupFee, row.currency)}</span></small>}
          </div>
          {row.perks.length > 0 && <ul className="vp-perks">{row.perks.map((perk, index) => <li key={index}><Check />{fa ? perk.fa : perk.en || perk.fa}</li>)}</ul>}
          {group.tier && (group.tier.storeDiscountPercent > 0 || group.tier.freeShipping || group.tier.hideAds) && <ul className="vp-perks">
            {group.tier.storeDiscountPercent > 0 && <li><Check />{L(`${group.tier.storeDiscountPercent.toLocaleString(loc)}٪ تخفیف در فروشگاه`, `${group.tier.storeDiscountPercent}% off in the store`)}</li>}
            {group.tier.freeShipping && <li><Check />{L('ارسال رایگان', 'Free shipping')}</li>}
            {group.tier.hideAds && <li><Check />{L('سایت بدون تبلیغ', 'No ads')}</li>}
          </ul>}
          {current ? <span className="vp-current">{L('سطح فعلی شما', 'Your current tier')}</span>
            : row.offer?.refused ? <span className="vp-current">{row.offer.refused}</span>
              : <button type="button" className={`btn ${row.highlight ? 'vip-btn' : 'btn-ghost'} vp-choose`} aria-pressed={selected === row.id} onClick={() => pick(row)}>{selected === row.id ? L('انتخاب شد', 'Selected') : row.offer?.upgrade ? L('ارتقا به این سطح', 'Upgrade') : L('انتخاب این پلن', 'Choose this plan')}</button>}
        </article>
      }))}
    </div>

    {plan && <section className="vp-pay" aria-label={L('تکمیل خرید', 'Checkout')}>
      <div className="vp-pay-head">
        <div><span>{L('انتخاب شما', 'Your choice')}</span><b>{fa ? plan.name : plan.nameEn || plan.name}</b></div>
        <strong dir="ltr">{price(due, plan.currency)}</strong>
      </div>
      {plan.trialDays > 0 && (!plan.offer || plan.offer.trialOpen) && <label className="vp-toggle"><input type="checkbox" checked={trial} onChange={(event) => { setTrial(event.target.checked); setDiscount(null) }} /><span>{L(`شروع با ${plan.trialDays.toLocaleString(loc)} روز آزمایشی`, `Start with a ${plan.trialDays}-day trial`)}{plan.trialPrice > 0 && <> · <span dir="ltr">{price(plan.trialPrice, plan.currency)}</span></>}</span></label>}
      {plan.payWhatYouWant && !trial && <label className="vp-field"><span>{L('مبلغ دلخواه شما', 'Your amount')} ({L('حداقل', 'at least')} <span dir="ltr">{price(plan.minPrice, plan.currency)}</span>)</span><input className="input" dir="ltr" inputMode="decimal" value={offer} placeholder={String(plan.price)} onChange={(event) => { setOffer(event.target.value); setDiscount(null) }} /></label>}
      {signedIn && !(trial && trialFree) && <div className="vp-code">
        <label className="vp-field"><span>{L('کد تخفیف', 'Discount code')}</span><input className="input" dir="ltr" value={code} maxLength={32} onChange={(event) => { setCode(event.target.value); setDiscount(null) }} /></label>
        <button type="button" className="btn btn-ghost" disabled={busy || !code.trim()} onClick={() => void applyCode()}>{L('اعمال', 'Apply')}</button>
      </div>}
      {signedIn && !(trial && trialFree) && options.length > 1 && <label className="vp-field"><span>{L('درگاه پرداخت', 'Payment gateway')}</span><select className="select" value={ref} onChange={(event) => setGatewayRef(event.target.value)}>{options.map((g) => <option key={g.ref} value={g.ref}>{g.label}{g.feePercent ? ` · ${g.feePercent}٪` : ''}</option>)}</select></label>}
      <p className="vp-note">{plan.offer?.upgrade ? L('سطح جدید همین حالا فعال می‌شود و ارزش روزهای باقی‌ماندهٔ شما از قیمت کم شده است.', 'The new tier starts now; your unused days are taken off the price.') : rank > 0 ? L('روزهای جدید به انتهای اشتراک فعلی‌تان اضافه می‌شود.', 'New days are added after your current membership.') : L('ابتدا از موجودی کیف پول استفاده می‌شود و باقی مبلغ با درگاه پرداخت می‌شود.', 'Your wallet is used first; the rest goes through the gateway.')}</p>
      {signedIn
        ? <button type="button" className="btn vip-btn vp-go" disabled={busy || !!plan.offer?.refused} onClick={() => void pay()}>{busy ? L('لطفاً صبر کنید…', 'Please wait…') : trial && trialFree ? L('شروع رایگان', 'Start free') : plan.offer?.upgrade ? L('ارتقا و پرداخت', 'Upgrade and pay') : rank > 0 ? L('تمدید اشتراک', 'Renew') : L('پرداخت و فعال‌سازی', 'Pay and activate')}</button>
        : <Link className="btn vip-btn vp-go" href={`/login?next=${encodeURIComponent('/vip')}`}>{L('ورود برای خرید', 'Sign in to buy')}</Link>}
      {error && <p className="error-text" role="alert">{error}</p>}
    </section>}

    {tierGroups.length > 1 && rows.length > 0 && <section className="vp-compare" aria-label={L('مقایسهٔ سطح‌ها', 'Compare tiers')}>
      <h3>{L('مقایسهٔ سطح‌ها', 'Compare tiers')}</h3>
      <div className="vp-compare-scroll" tabIndex={0} role="region" aria-label={L('جدول مقایسه', 'Comparison table')}><table>
        <thead><tr><th scope="col">{L('امکان', 'Feature')}</th>{tierGroups.map((group) => <th key={group.tier!.id} scope="col" style={{ ['--tier' as string]: group.tier!.color }}>{group.tier!.name}</th>)}</tr></thead>
        <tbody>
          {rows.map((line) => <tr key={line}><th scope="row">{line}</th>{tierGroups.map((group) => <td key={group.tier!.id}><Check on={has(group, line)} /><span className="sr-only">{has(group, line) ? L('دارد', 'Included') : L('ندارد', 'Not included')}</span></td>)}</tr>)}
          {tierGroups.some((group) => group.tier!.storeDiscountPercent > 0) && <tr><th scope="row">{L('تخفیف فروشگاه', 'Store discount')}</th>{tierGroups.map((group) => <td key={group.tier!.id} className="num">{group.tier!.storeDiscountPercent ? `${group.tier!.storeDiscountPercent.toLocaleString(loc)}٪` : '—'}</td>)}</tr>}
          {tierGroups.some((group) => group.tier!.freeShipping) && <tr><th scope="row">{L('ارسال رایگان', 'Free shipping')}</th>{tierGroups.map((group) => <td key={group.tier!.id}><Check on={group.tier!.freeShipping} /><span className="sr-only">{group.tier!.freeShipping ? L('دارد', 'Included') : L('ندارد', 'Not included')}</span></td>)}</tr>}
        </tbody>
      </table></div>
    </section>}
  </div>
}
