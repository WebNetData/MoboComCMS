'use client'

import MiniAppHeading from '../MiniAppHeading'
import { useCallback, useEffect, useState } from 'react'
import { useI18n } from '@/i18n/LocaleProvider'
import { fetchCheckoutGateways, fetchWalletBalances, money, startCheckout, type CheckoutGatewayChoice } from '@/modules/checkout/ui/client'
import { haptic, openLink, paymentHref } from '../telegram-client'
import { planName } from '@/modules/catalog/domain/plan-locale'

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
  featured: boolean
  panel: { name: string; type: string } | null
}

export default function MiniAppPlans() {
  const { t, locale } = useI18n()
  const [plans, setPlans] = useState<Plan[]>([])
  const [balances, setBalances] = useState<Record<string, number>>({})
  const [gateways, setGateways] = useState<CheckoutGatewayChoice[]>([])
  const [gatewayByCurrency, setGatewayByCurrency] = useState<Record<string, string>>({})
  const [username, setUsername] = useState('')
  const [busy, setBusy] = useState<number | null>(null)
  const [msg, setMsg] = useState('')
  const [msgOk, setMsgOk] = useState(false)
  const [paymentUrl, setPaymentUrl] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const [r, b, g] = await Promise.all([fetch('/api/plans'), fetchWalletBalances(), fetchCheckoutGateways()])
    if (r.ok) setPlans((await r.json()) || [])
    setBalances(Object.fromEntries(b.map((x) => [x.currency, x.balance])))
    setGateways(g)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function gatewaysFor(currency: string) {
    const code = String(currency || '').toUpperCase()
    return gateways.filter((g) => g.acceptedCurrencies.includes(code))
  }

  function selectedGatewayRef(currency: string) {
    const options = gatewaysFor(currency)
    const current = gatewayByCurrency[currency]
    return options.some((g) => g.ref === current) ? current : (options.find((g) => g.isDefault)?.ref || options[0]?.ref || '')
  }

  async function buy(plan: Plan) {
    haptic('medium')
    setBusy(plan.id)
    setMsg('')
    setPaymentUrl('')
    try {
      const res = await startCheckout({
        planId: plan.id,
        username: username.trim() || undefined,
        payWith: (balances[plan.currency] || 0) >= plan.price ? 'wallet' : undefined,
        gatewayRef: selectedGatewayRef(plan.currency) || undefined,
      })
      setBusy(null)
      if (!res.ok) { setMsgOk(false); setMsg(res.code === 'INSUFFICIENT_FUNDS' ? t.walletInsufficient : t.errGeneric); return }
      if (res.paid) { setMsgOk(true); setMsg(`✅ ${t.miniPaid} ${res.username || ''}`); await load(); return }
      if (res.paymentUrl) {
        const href = paymentHref(res.paymentUrl)
        if (!href) { setMsgOk(false); setMsg(t.errGeneric); return }
        setPaymentUrl(href); setMsgOk(true); setMsg(t.miniRedirectPay); openLink(href); return
      }
      setMsgOk(true); setMsg(t.miniOrderCreated)
    } catch {
      setBusy(null); setMsgOk(false); setMsg(t.errGeneric)
    }
  }

  return <div>
    <MiniAppHeading icon="globe" title={t.miniPlans} />
    {Object.keys(balances).length > 0 && <p className="muted text-sm mb-4">{t.walletBalance}: <b className="num">{Object.entries(balances).map(([c, v]) => money(v, c, locale === 'fa' ? 'fa-IR' : 'en-US')).join(' · ')}</b></p>}
    <div className="card mb-4"><label className="label">{t.configNameLabel}</label><input className="input" dir="ltr" placeholder={t.configNamePlaceholder} value={username} onChange={e => setUsername(e.target.value)} /><p className="muted text-xs mt-2">{t.configNameHint}</p></div>
    {msg && <p className={msgOk ? 'success-text mb-3' : 'error-text mb-3'}>{msg}</p>}
    {paymentUrl && <a className="btn btn-ghost w-full mb-3" href={paymentUrl}>{locale === 'fa' ? 'باز کردن صفحه پرداخت' : 'Open payment page'}</a>}
    {loading && <p className="muted text-sm">{t.loading}</p>}
    <div className="space-y-3">{plans.map(p => {
      const balance = balances[p.currency] || 0
      const options = gatewaysFor(p.currency)
      const selected = selectedGatewayRef(p.currency)
      return <div key={p.id} className={`card price-card ${p.featured ? 'price-card-featured' : ''}`}>
        <div className="flex items-center justify-between gap-2 mb-2"><h3 className="font-bold">{planName(p, locale)}</h3><span className="num font-extrabold">{money(p.price, p.currency, locale === 'fa' ? 'fa-IR' : 'en-US')}</span></div>
        <div className="plan-specs mb-3"><div className="plan-spec"><span className="plan-spec-label">{t.traffic}</span><span className="plan-spec-value num">{p.trafficGB ? `${p.trafficGB} GB` : t.unlimited}</span></div><div className="plan-spec"><span className="plan-spec-label">{t.duration}</span><span className="plan-spec-value num">{p.days} {t.days}</span></div><div className="plan-spec"><span className="plan-spec-label">{t.devicesLabel}</span><span className="plan-spec-value num">{p.deviceLimit || '∞'}</span></div></div>
        {balance < p.price && options.length > 1 && <select className="select mb-3" aria-label={locale === 'fa' ? 'درگاه پرداخت' : 'Payment gateway'} value={selected} onChange={e => setGatewayByCurrency(prev => ({ ...prev, [p.currency]: e.target.value }))}>{options.map(g => <option key={g.ref} value={g.ref}>{g.label}</option>)}</select>}
        <button className="btn btn-primary w-full" disabled={busy === p.id} onClick={() => buy(p)}>{busy === p.id ? t.loading : balance >= p.price ? `💳 ${t.miniPayWallet}` : `🛒 ${t.buy}`}</button>
        {p.panel && <p className="muted text-xs mt-2">{p.panel.name}</p>}
      </div>
    })}</div>
  </div>
}
