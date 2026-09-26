'use client'

import MiniAppHeading from '../MiniAppHeading'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useI18n } from '@/i18n/LocaleProvider'
import { formatCurrency } from '@/shared/money/client'
import { newIdempotencyKey } from '@/shared/security/idempotency'
import type { CheckoutGatewayChoice } from '@/modules/checkout/ui/client'
import { haptic, openLink, paymentHref } from '../telegram-client'

interface Tx { id: number; amount: number; currency: string; type: string; status: string; description: string; createdAt: string }
interface Balance { currency: string; balance: number }

function idem(currency: string, amount: string) {
  const sk = `happ.mini.wallet.${currency}.${amount}`
  try {
    const old = sessionStorage.getItem(sk)
    if (old) return { key: old, sk }
    const key = newIdempotencyKey('mini')
    sessionStorage.setItem(sk, key)
    return { key, sk }
  } catch {
    return { key: newIdempotencyKey('mini'), sk }
  }
}

export default function MiniAppWallet() {
  const { t, locale } = useI18n()
  const [balances, setBalances] = useState<Balance[]>([])
  const [txs, setTxs] = useState<Tx[]>([])
  const [topups, setTopups] = useState<string[]>([])
  const [gateways, setGateways] = useState<CheckoutGatewayChoice[]>([])
  const [gatewayRef, setGatewayRef] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [amount, setAmount] = useState('10')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [ok, setOk] = useState(false)
  const [paymentUrl, setPaymentUrl] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const res = await fetch('/api/wallet')
    const d = res.ok ? await res.json().catch(() => null) : null
    setBalances(d?.balances || [])
    setTxs(d?.transactions || [])
    const cs = d?.topupCurrencies || []
    setTopups(cs)
    setGateways(d?.topupGateways || [])
    setCurrency(c => cs.includes(c) ? c : (cs[0] || d?.balances?.[0]?.currency || c))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])
  const compatibleGateways = useMemo(() => gateways.filter(g => g.acceptedCurrencies.includes(currency)), [gateways, currency])
  useEffect(() => {
    if (!compatibleGateways.some(g => g.ref === gatewayRef)) setGatewayRef(compatibleGateways.find(g => g.isDefault)?.ref || compatibleGateways[0]?.ref || '')
  }, [compatibleGateways, gatewayRef])

  const balance = balances.find(b => b.currency === currency)?.balance || 0
  const visible = useMemo(() => txs.filter(x => x.currency === currency), [txs, currency])
  const money = (n: number, c = currency) => formatCurrency(n || 0, c, locale === 'fa' ? 'fa-IR' : 'en-US')

  async function topUp() {
    haptic('medium'); setBusy(true); setMsg(''); setPaymentUrl('')
    const token = idem(currency, amount)
    let res: Response
    try {
      res = await fetch('/api/wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': token.key },
        body: JSON.stringify({ amount, currency, gatewayRef: gatewayRef || undefined }),
      })
    } catch {
      setBusy(false); setOk(false); setMsg(t.errGeneric); return
    }
    const data = await res.json().catch(() => null)
    try { sessionStorage.removeItem(token.sk) } catch {}
    setBusy(false)
    if (!res.ok) { setOk(false); setMsg(t.errGeneric); return }
    const href = paymentHref(String(data?.paymentUrl || ''))
    if (!href) { setOk(false); setMsg(t.errGeneric); return }
    setPaymentUrl(href)
    setOk(true); setMsg(t.miniRedirectPay)
    openLink(href)
  }

  return <div>
    <MiniAppHeading icon="wallet" title={t.miniWallet} />
    <Link href="/miniapp/payments" className="btn btn-ghost w-full mb-4">{locale === 'fa' ? 'پرداخت‌ها و وضعیت تحویل' : 'Payments and delivery status'}</Link>
    <div className="card tg-balance mb-4"><span className="muted text-xs">{t.walletBalance}</span><b className="num">{money(balance)}</b><select aria-label={locale === 'fa' ? 'ارز کیف پول' : 'Wallet currency'} className="select mt-2" value={currency} onChange={e => setCurrency(e.target.value)}>{[...new Set([currency, ...topups, ...balances.map(b => b.currency)])].map(c => <option key={c}>{c}</option>)}</select></div>
    <div className="card mb-4"><label className="label">{t.topUp}</label><div className="flex gap-2 mb-2">{['5', '10', '25', '50'].map(v => <button key={v} aria-pressed={amount === v} className={`badge tg-amount ${amount === v ? 'tg-amount-on' : ''}`} onClick={() => setAmount(v)}>{money(Number(v))}</button>)}</div><input aria-label={t.topUp} className="input num mb-3" dir="ltr" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} />{compatibleGateways.length > 0 && <select className="select mb-3" aria-label={locale === 'fa' ? 'درگاه پرداخت' : 'Payment gateway'} value={gatewayRef} onChange={e => setGatewayRef(e.target.value)}>{compatibleGateways.map(g => <option key={g.ref} value={g.ref}>{g.label}</option>)}</select>}<button className="btn btn-primary w-full" disabled={busy || !topups.includes(currency) || compatibleGateways.length === 0} onClick={topUp}>{busy ? t.loading : `➕ ${t.topUp}`}</button>{!topups.includes(currency) && <p className="muted text-xs mt-2">{locale === 'fa' ? `شارژ با ارز ${currency} فعلاً در دسترس نیست.` : `Top-up unavailable for ${currency}.`}</p>}{msg && <p className={ok ? 'success-text mt-3' : 'error-text mt-3'}>{msg}</p>}{paymentUrl && <a className="btn btn-ghost w-full mt-3" href={paymentUrl}>{locale === 'fa' ? 'باز کردن صفحه پرداخت' : 'Open payment page'}</a>}</div>
    <div className="card"><h3 className="font-bold mb-3">{t.miniTransactions}</h3>{loading && <p className="muted text-sm">{t.loading}</p>}{!loading && visible.length === 0 && <p className="muted text-sm">{t.miniNoTx}</p>}<div className="flex flex-col gap-2">{visible.slice(0, 20).map(x => <div key={x.id} className="flex items-center justify-between gap-2 border-b border-var pb-2"><div className="min-w-0"><div className="text-sm truncate">{x.description || x.type}</div><div className="muted text-xs num">{new Date(x.createdAt).toLocaleDateString(locale === 'fa' ? 'fa-IR' : 'en-US')}</div></div><span className={`num text-sm font-semibold ${x.amount < 0 ? 'text-danger' : ''}`}>{money(x.amount, x.currency)}</span></div>)}</div></div>
  </div>
}
