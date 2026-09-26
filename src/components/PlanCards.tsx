'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/i18n/LocaleProvider'
import { fetchWalletBalances, money } from '@/modules/checkout/ui/client'
import { planDescription, planName } from '@/modules/catalog/domain/plan-locale'

interface Plan {
  id: number
  name: string
  nameEn?: string
  description: string
  descriptionEn?: string
  trafficGB: number
  days: number
  deviceLimit: number
  price: number
  currency: string
  featured?: boolean
  panel?: { name: string; type: string } | null
  access?: string
  memberPrice?: number
  vipGiftDays?: number
}

export default function PlanCards({
  plans,
  tomanRate = 0,
  showCurrencySwitch = true,
  showWallet = true,
  vip,
}: {
  plans: Plan[]
  tomanRate?: number
  showCurrencySwitch?: boolean
  showWallet?: boolean
  /** Set when the membership module is on: whether the visitor is a VIP member. */
  vip?: { member: boolean }
}) {
  const { status } = useSession()
  const router = useRouter()
  const { t, locale } = useI18n()
  const isFa = locale === 'fa'
  const [displayCurrency, setDisplayCurrency] = useState<'BASE' | 'IRT'>('BASE')
  const [balances, setBalances] = useState<Record<string, number>>({})

  const rate = Number(tomanRate) || 0
  const hasUsdPlans = plans.some((plan) => plan.currency === 'USD')
  const useToman = displayCurrency === 'IRT' && rate > 0

  useEffect(() => {
    if (!showWallet || status !== 'authenticated') {
      setBalances({})
      return
    }
    let alive = true
    fetchWalletBalances().then((rows) => {
      if (alive) setBalances(Object.fromEntries(rows.map((row) => [row.currency, row.balance])))
    })
    return () => { alive = false }
  }, [status, showWallet])

  const priceLabel = (price: number, currency: string) => {
    if (useToman && currency === 'USD') return `${Math.round(price * rate).toLocaleString('en-US')} ${t.toman}`
    return money(price, currency, isFa ? 'fa-IR' : 'en-US')
  }

  return (
    <div>
      {showCurrencySwitch && rate > 0 && hasUsdPlans && (
        <div className="flex justify-center mb-6">
          <div className="currency-switch">
            <button className={displayCurrency === 'BASE' ? 'is-on' : ''} onClick={() => setDisplayCurrency('BASE')}>{isFa ? 'ارز اصلی' : 'Base currency'}</button>
            <button className={displayCurrency === 'IRT' ? 'is-on' : ''} onClick={() => setDisplayCurrency('IRT')}>{isFa ? 'تومان' : 'Toman'}</button>
          </div>
        </div>
      )}

      {showWallet && status === 'authenticated' && (
        <div className="wallet-strip">
          <span className="wallet-strip-icon">💳</span>
          <div className="wallet-strip-body">
            <span className="wallet-strip-label">{t.walletBalance}</span>
            <span className="wallet-strip-value num">
              {Object.entries(balances).length
                ? Object.entries(balances).map(([currency, balance]) => money(balance, currency, isFa ? 'fa-IR' : 'en-US')).join(' · ')
                : money(0, plans[0]?.currency || 'USD', isFa ? 'fa-IR' : 'en-US')}
            </span>
          </div>
          <p className="wallet-strip-hint">{t.walletPayHint}</p>
          <a href="/dashboard/wallet" className="btn btn-ghost btn-sm">＋ {t.topUpWallet}</a>
        </div>
      )}

      <div className="pricing-grid">
        {plans.map((p) => {
          const balance = balances[p.currency] || 0
          const monthly = p.days > 0 ? p.price / (p.days / 30) : p.price
          const covered = showWallet && status === 'authenticated' && balance >= p.price
          const partial = showWallet && status === 'authenticated' && balance > 0 && balance < p.price
          return (
            <article key={p.id} className={`price-card ${p.featured ? 'price-card-featured' : ''}`}>
              {p.featured && <span className="price-flag">★ {t.mostPopular}</span>}
              <div>
                <h3 className="price-name"><bdi>{planName(p, locale)}</bdi></h3>
                <p className="price-desc num">{planDescription(p, locale) || `${p.trafficGB} GB · ${p.days} ${t.days} · ${p.deviceLimit} ${t.devices}`}</p>
              </div>
              <div className="price-row">
                <span className="price-value num">{priceLabel(p.price, p.currency)}</span>
                <span className="price-period">/ {p.days} {t.days}</span>
              </div>
              <div className="price-alt num">{t.monthly}: {priceLabel(monthly, p.currency)} {t.perMonth}</div>
              {vip && !!p.memberPrice && p.memberPrice < p.price && <div className="vip-price-row"><span className="vip-chip is-small">♛ VIP</span>{vip.member ? <><span>{isFa ? 'قیمت شما:' : 'Your price:'}</span><b className="num">{priceLabel(p.memberPrice, p.currency)}</b></> : <><span>{isFa ? 'اعضای ویژه:' : 'Members:'}</span><b className="num">{priceLabel(p.memberPrice, p.currency)}</b></>}</div>}
              {vip && !!p.vipGiftDays && <div className="vip-price-row"><span aria-hidden="true">🎁</span>{isFa ? `${p.vipGiftDays.toLocaleString('fa-IR')} روز VIP هدیه` : `${p.vipGiftDays} VIP days included`}</div>}
              {covered && <div className="wallet-covers-badge">{t.walletCoversPlan}</div>}
              {partial && <div className="wallet-partial-badge">{t.walletPartialBadge} · {money(balance, p.currency)} → {money(p.price - balance, p.currency)}</div>}
              <div className="plan-specs">
                <div className="plan-spec"><div className="plan-spec-value num">{p.trafficGB}</div><div className="plan-spec-label">GB {t.bandwidth}</div></div>
                <div className="plan-spec"><div className="plan-spec-value num">{p.days}</div><div className="plan-spec-label">{t.days}</div></div>
                <div className="plan-spec"><div className="plan-spec-value num">{p.deviceLimit}</div><div className="plan-spec-label">{t.devices}</div></div>
              </div>
              <ul className="feature-list">
                <li className="feature-item"><span className="feature-check">✓</span> {t.instantActivation}</li>
                <li className="feature-item"><span className="feature-check">✓</span> {t.simultaneous}: {p.deviceLimit}</li>
                <li className="feature-item"><span className="feature-check">✓</span> {isFa ? 'لینک خصوصی و رمزگذاری‌شده Happ' : 'Private, encrypted Happ link'}</li>
                {p.panel && <li className="feature-item"><span className="feature-check">✓</span> {t.server}: {p.panel.name}</li>}
              </ul>
              {vip && p.access === 'MEMBERS' && !vip.member
                ? <button onClick={() => router.push('/vip')} className="btn w-full vip-btn">♛ {isFa ? 'ویژه اعضای VIP' : 'VIP members only'}</button>
                : <button onClick={() => router.push(`/checkout?planId=${p.id}`)} className={`btn w-full ${p.featured ? 'btn-primary' : 'btn-ghost'}`}>{t.choosePlan}</button>}
              <div className="price-note"><span>{isFa ? 'مشخصات پلن را قبل از خرید بررسی کنید' : 'Review plan details before purchasing'}</span></div>
            </article>
          )
        })}
      </div>
    </div>
  )
}
