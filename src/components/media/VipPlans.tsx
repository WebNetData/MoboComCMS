'use client'

import { useRef, useState } from 'react'
import Link from '@/components/AppLink'
import { useSession } from 'next-auth/react'
import { useI18n } from '@/i18n/LocaleProvider'
import { money, startCheckout, type CheckoutGatewayChoice } from '@/modules/checkout/ui/client'

type Plan = { id: number; name: string; nameEn: string; description: string; descriptionEn: string; days: number; price: number; currency: string; perks: { icon: string; fa: string; en: string }[]; highlight: boolean }

/** VIP plan cards with an inline wallet / gateway checkout. */
export default function VipPlans({ plans, gateways, member }: { plans: Plan[]; gateways: Record<string, CheckoutGatewayChoice[]>; member: boolean }) {
  const { locale } = useI18n()
  const fa = locale === 'fa'
  const { status } = useSession()
  const [selected, setSelected] = useState<number | null>(plans.find((p) => p.highlight)?.id ?? plans[0]?.id ?? null)
  const [gatewayRef, setGatewayRef] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const lock = useRef(false)
  const plan = plans.find((p) => p.id === selected) || null
  const options = plan ? gateways[plan.currency] || [] : []
  const ref = options.some((g) => g.ref === gatewayRef) ? gatewayRef : options.find((g) => g.isDefault)?.ref || options[0]?.ref || ''
  const loc = fa ? 'fa-IR' : 'en-US'
  const perMonth = (p: Plan) => {
    if (p.days < 60) return ''
    const raw = (p.price / p.days) * 30
    return money(Number.isInteger(p.price) ? Math.round(raw) : Math.round(raw * 100) / 100, p.currency, loc)
  }

  async function pay() {
    if (!plan || lock.current) return
    lock.current = true; setBusy(true); setError('')
    try {
      const result = await startCheckout({ membershipPlanId: plan.id, gatewayRef: ref || undefined })
      if (!result.ok) {
        if (result.code === 'GATEWAY_AMBIGUOUS' && result.invoiceUrl) { window.location.assign(result.invoiceUrl); return }
        setError(result.code === 'INSUFFICIENT_FUNDS' ? (fa ? 'موجودی کیف پول کافی نیست و درگاهی برای این ارز فعال نیست.' : 'Wallet balance is not enough and no gateway supports this currency.') : result.code === 'MEMBERSHIP_DISABLED' ? (fa ? 'فروش اشتراک ویژه موقتاً متوقف است.' : 'VIP sales are paused.') : result.message || (fa ? 'پرداخت انجام نشد. دوباره تلاش کنید.' : 'Payment failed. Please try again.'))
        return
      }
      const destination = result.paid ? `/payment/result?invoice=${encodeURIComponent(result.invoiceNumber)}` : result.paymentUrl || result.invoiceUrl
      if (destination) window.location.assign(destination)
      else setError(fa ? 'مسیر پرداخت دریافت نشد؛ سفارش‌ها را بررسی کنید.' : 'No payment destination. Check your orders.')
    } catch {
      setError(fa ? 'پاسخ پرداخت دریافت نشد. پیش از تلاش دوباره، سفارش‌ها را بررسی کنید.' : 'No payment response. Check your orders before retrying.')
    } finally {
      lock.current = false; setBusy(false)
    }
  }

  if (!plans.length) return <p className="muted vip-noplans">{fa ? 'پلن‌های اشتراک ویژه به‌زودی اضافه می‌شوند.' : 'VIP plans are coming soon.'}</p>

  return (
    <div className="vip-plans-wrap">
      <div className="vip-plans" role="radiogroup" aria-label={fa ? 'پلن‌های VIP' : 'VIP plans'}>
        {plans.map((p) => {
          const saving = plans.length > 1 ? Math.round((1 - (p.price / p.days) / Math.max(...plans.map((x) => x.price / x.days))) * 100) : 0
          return (
            <button key={p.id} type="button" role="radio" aria-checked={selected === p.id} className={`vip-plan${p.highlight ? ' is-highlight' : ''}${selected === p.id ? ' is-selected' : ''}`} onClick={() => setSelected(p.id)}>
              {p.highlight && <span className="vip-plan-flag">{fa ? 'پیشنهاد ویژه' : 'Best value'}</span>}
              <span className="vip-plan-name">{fa ? p.name : p.nameEn || p.name}</span>
              <span className="vip-plan-days">{p.days.toLocaleString(loc)} {fa ? 'روز' : 'days'}</span>
              <strong className="vip-plan-price" dir="ltr">{money(p.price, p.currency, loc)}</strong>
              {perMonth(p) && <small className="vip-plan-month">{fa ? 'ماهانه' : 'per month'} ≈ <span dir="ltr">{perMonth(p)}</span></small>}
              {saving >= 5 && <span className="vip-plan-save">{fa ? `${saving.toLocaleString(loc)}٪ صرفه‌جویی` : `Save ${saving}%`}</span>}
              {(fa ? p.description : p.descriptionEn || p.description) && <p>{fa ? p.description : p.descriptionEn || p.description}</p>}
              {p.perks.length > 0 && <ul>{p.perks.map((perk, i) => <li key={i}><span aria-hidden="true">{perk.icon}</span>{fa ? perk.fa : perk.en || perk.fa}</li>)}</ul>}
              <span className="vip-plan-radio" aria-hidden="true" />
            </button>
          )
        })}
      </div>
      {plan && (
        <div className="vip-pay">
          <div className="vip-pay-summary">
            <span>{fa ? 'پلن انتخابی' : 'Selected'}</span>
            <b>{fa ? plan.name : plan.nameEn || plan.name} · {plan.days.toLocaleString(loc)} {fa ? 'روز' : 'days'}</b>
            <strong dir="ltr">{money(plan.price, plan.currency, loc)}</strong>
          </div>
          {status === 'authenticated' && options.length > 1 && (
            <label className="vip-pay-gateway">{fa ? 'درگاه پرداخت' : 'Payment gateway'}
              <select className="select" value={ref} onChange={(e) => setGatewayRef(e.target.value)}>{options.map((g) => <option key={g.ref} value={g.ref}>{g.label}{g.feePercent ? ` · ${g.feePercent}%` : ''}</option>)}</select>
            </label>
          )}
          <p className="muted text-sm">{member ? (fa ? 'روزهای جدید به انتهای اشتراک فعلی‌تان اضافه می‌شود.' : 'New days are added after your current membership ends.') : (fa ? 'ابتدا از موجودی کیف پول کسر می‌شود؛ باقی مبلغ با درگاه پرداخت می‌شود. فعال‌سازی فوری است.' : 'Wallet credit is used first; the rest goes through the gateway. Activation is instant.')}</p>
          {status === 'authenticated'
            ? <button type="button" className="btn vip-btn vip-pay-btn" disabled={busy} onClick={pay}>{busy ? (fa ? 'در حال انتقال…' : 'Redirecting…') : member ? (fa ? 'تمدید اشتراک ویژه' : 'Extend VIP') : (fa ? 'پرداخت و فعال‌سازی VIP' : 'Pay & activate VIP')}</button>
            : <Link className="btn vip-btn vip-pay-btn" href={`/login?next=${encodeURIComponent('/vip')}`}>{fa ? 'ورود برای خرید' : 'Sign in to buy'}</Link>}
          {error && <p className="error-text" role="alert">{error}</p>}
        </div>
      )}
    </div>
  )
}
