'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from '@/components/AppLink'
import StatusBadge from '@/components/StatusBadge'
import { useI18n } from '@/i18n/LocaleProvider'
import { useModuleEnabled } from '@/extensions/client/ExtensionProvider'
import { formatCurrency, currencyLabel, BASE_CURRENCY } from '@/shared/money/client'
import { newIdempotencyKey } from '@/shared/security/idempotency'
import type { CheckoutGatewayChoice } from '@/modules/checkout/ui/client'
import { transactionLabel } from '@/modules/wallet/domain/transaction-locale'

interface Tx { id:number; amount:number; balanceAfter:number; currency:string; type:string; status:string; description:string; invoiceId:number|null; orderId:number|null; createdAt:string }
interface Balance { currency:string; balance:number }
// Round amounts a person would actually top up, by the size of the currency's unit.
const QUICK_BY:Record<string,number[]>={IRT:[50_000,100_000,200_000,500_000,1_000_000],TMN:[50_000,100_000,200_000,500_000,1_000_000],IRR:[500_000,1_000_000,2_000_000,5_000_000,10_000_000]}
const quickFor=(currency:string)=>QUICK_BY[currency]||[10,25,50,100,250]

function topupKey(currency:string, amount:number) {
  const storage=`happ.wallet.topup.${currency}.${amount}`
  try { const old=sessionStorage.getItem(storage); if(old)return {key:old,storage}; const key=newIdempotencyKey('wallet'); sessionStorage.setItem(storage,key); return {key,storage} }
  catch { return {key:newIdempotencyKey('wallet'),storage} }
}

/** Why a top-up was refused, in words a member understands (the server's code decides it). */
function topupError(data: { code?: string; error?: string } | null, isFa: boolean) {
  const code = String(data?.code || ''), detail = String(data?.error || '')
  const amount = detail.match(/(\d[\d.,]*)\s+([A-Z]{3})/)
  const limit = amount ? formatCurrency(Number(amount[1].replace(/,/g, '')), amount[2], isFa ? 'fa-IR' : 'en-US') : ''
  const fa: Record<string, string> = {
    BELOW_MINIMUM: limit ? `کمترین مبلغ شارژ ${limit} است.` : 'مبلغ کمتر از حداقل شارژ است.',
    ABOVE_MAXIMUM: limit ? `بیشترین مبلغ شارژ در هر بار ${limit} است.` : 'مبلغ بیشتر از سقف شارژ است.',
    INVALID_AMOUNT: 'مبلغ را به عدد وارد کنید.', NO_GATEWAY: 'درگاه پرداختی برای شارژ فعال نیست.', GATEWAY_NOT_AVAILABLE: 'این درگاه برای این واحد پول فعال نیست؛ درگاه دیگری انتخاب کنید.',
    GATEWAY_CURRENCY_MISMATCH: 'این درگاه این واحد پول را نمی‌پذیرد.', IDEMPOTENCY_REQUIRED: 'صفحه را تازه کنید و دوباره تلاش کنید.',
  }
  return isFa ? fa[code] || '' : detail
}

export default function WalletPage() {
  const {t,locale}=useI18n(); const isFa=locale==='fa'; const vpnOn=useModuleEnabled('vpn'); const storeOn=useModuleEnabled('store')
  const [balances,setBalances]=useState<Balance[]>([]); const [txs,setTxs]=useState<Tx[]>([]); const [totals,setTotals]=useState<Record<string,{toppedUp:number;spent:number;count:number}>>({})
  const [topupCurrencies,setTopupCurrencies]=useState<string[]>([]); const [topupGateways,setTopupGateways]=useState<CheckoutGatewayChoice[]>([]); const [currency,setCurrency]=useState(BASE_CURRENCY); const [gatewayRef,setGatewayRef]=useState(''); const [amount,setAmount]=useState(quickFor(BASE_CURRENCY)[1])
  const [busy,setBusy]=useState(false); const [error,setError]=useState(''); const [loading,setLoading]=useState(true)
  const load=useCallback(async()=>{ const res=await fetch('/api/wallet'); if(res.ok){const d=await res.json();setBalances(d.balances||[]);setTxs(d.transactions||[]);setTotals(d.totals||{});const cs=d.topupCurrencies||[];setTopupCurrencies(cs);setTopupGateways(d.topupGateways||[]);setCurrency(c=>cs.includes(c)?c:(cs[0]||d.balances?.[0]?.currency||c))} setLoading(false)},[])
  useEffect(()=>{load()},[load])
  const compatibleGateways=useMemo(()=>topupGateways.filter(g=>g.acceptedCurrencies.includes(currency)),[topupGateways,currency])
  useEffect(()=>{if(!compatibleGateways.some(g=>g.ref===gatewayRef))setGatewayRef(compatibleGateways.find(g=>g.isDefault)?.ref||compatibleGateways[0]?.ref||'')},[compatibleGateways,gatewayRef])
  const balance=balances.find(b=>b.currency===currency)?.balance||0; const summary=totals[currency]||{toppedUp:0,spent:0,count:0}; const visible=useMemo(()=>txs.filter(x=>x.currency===currency),[txs,currency])
  const money=(n:number,c=currency)=>formatCurrency(n||0,c,isFa?'fa-IR':'en-US'); const fmt=(d:string)=>new Date(d).toLocaleString(isFa?'fa-IR':'en-US')
  async function topUp(){ setBusy(true);setError('');const token=topupKey(currency,amount); let res:Response; try{res=await fetch('/api/wallet',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':token.key},body:JSON.stringify({amount:String(amount),currency,gatewayRef:gatewayRef||undefined})})}catch{setBusy(false);setError(t.errGeneric);return} const data=await res.json().catch(()=>null);try{sessionStorage.removeItem(token.storage)}catch{} setBusy(false);if(!res.ok){setError(topupError(data,isFa)||t.errGeneric);return} if(data?.paymentUrl)window.location.href=data.paymentUrl;else load() }
  const kpis:[[string,string,string,string],[string,string,string,string],[string,string,string,string],[string,string,string,string]]=[
    [t.walletBalance,money(balance),'💳','kpi-green'],[t.totalToppedUp,money(summary.toppedUp),'⬆️',''],[t.totalSpent,money(summary.spent),'⬇️',''],[t.txCount,String(summary.count),'🧮','']]
  return <div>
    <div className="appbar"><div><h1 className="h2">💳 {t.wallet}</h1><p className="muted">{vpnOn ? t.walletSub : isFa ? 'یک‌بار شارژ کنید و خریدهای سایت را از موجودی بپردازید.' : 'Top up once and pay for your purchases from the balance.'}</p></div><div className="flex gap-2"><select className="select" value={currency} onChange={e=>setCurrency(e.target.value)}>{[...new Set([...topupCurrencies,...balances.map(b=>b.currency)].map(c=>c==='TMN'?'IRT':c))].map(c=><option key={c} value={c}>{currencyLabel(c,isFa?'fa-IR':'en-US')}</option>)}</select>{vpnOn ? <Link href="/plans" className="btn btn-ghost">{t.browsePlans}</Link> : storeOn && <Link href="/products" className="btn btn-ghost">{isFa ? 'فروشگاه' : 'Shop'}</Link>}</div></div>
    {balances.length>1&&<p className="muted text-sm mb-4">{balances.map(b=>money(b.balance,b.currency)).join(' · ')}</p>}
    <p className="muted text-sm mb-6">💡 {t.walletPayHint}</p>
    <div className="grid-4 mb-8">{kpis.map(([label,value,icon,cls])=><div key={label} className={`card kpi ${cls}`}><div className="kpi-icon">{icon}</div><div className="min-w-0"><div className="muted text-xs">{label}</div><div className="num text-2xl font-extrabold truncate">{value}</div></div></div>)}</div>
    <div className="grid" style={{gridTemplateColumns:'minmax(0,1fr) minmax(0,1.3fr)',gap:'1rem'}}>
      <div className="card self-start"><h2 className="h3 mb-1">{t.topUpTitle}</h2><p className="muted text-sm mb-4">{t.topUpHint}</p>
        {!topupCurrencies.includes(currency)&&<p className="error-text mb-3">{isFa ? 'شارژ این ارز با درگاه‌های فعال در دسترس نیست.' : `Top-up is not available for ${currency} with the active gateways.`}</p>}
        <div className="flex flex-wrap gap-2 mb-4">{quickFor(currency).map(q=><button key={q} type="button" onClick={()=>setAmount(q)} className={`badge ${amount===q?'badge-primary':'badge-gray'}`}>{money(q)}</button>)}</div>
        <label className="label">{t.amountLabel} ({currency})</label><input className="input num mb-4" dir="ltr" inputMode="decimal" value={amount} onChange={e=>setAmount(Number(e.target.value))}/>
        {compatibleGateways.length>0&&<><label className="label">{isFa?'درگاه پرداخت':'Payment gateway'}</label><select className="select mb-4" value={gatewayRef} onChange={e=>setGatewayRef(e.target.value)}>{compatibleGateways.map(g=><option key={g.ref} value={g.ref}>{g.label}{g.feePercent?` · ${g.feePercent}%`:''}</option>)}</select></>}
        {error&&<p className="error-text mb-3">{error}</p>}<button className="btn btn-primary w-full" disabled={busy||amount<=0||!topupCurrencies.includes(currency)||compatibleGateways.length===0} onClick={topUp}>{busy?t.loading:`⚡ ${t.payNow}`}</button><p className="muted text-xs mt-3">{vpnOn ? t.topUpNote : locale === 'fa' ? 'از موجودی کیف پول برای پرداخت سفارش‌ها و خریدهای سایت استفاده می‌شود.' : 'Wallet balance can be used to pay for orders and purchases on the site.'}</p>
      </div>
      <div className="card"><div className="flex items-center justify-between mb-4"><h2 className="h3">{t.txHistory}</h2><button className="btn btn-ghost" onClick={load}>↻ {t.refresh}</button></div>
        {loading&&<p className="muted">{t.loading}</p>}{!loading&&visible.length===0&&<p className="muted">{t.noTx}</p>}{visible.length>0&&<div className="overflow-x-auto"><table className="data"><thead><tr><th>{t.date}</th><th>{t.type}</th><th>{t.description}</th><th>{t.amountLabel}</th><th>{t.balanceAfter}</th><th>{t.status}</th></tr></thead><tbody>{visible.map(tx=><tr key={tx.id}><td className="num text-xs whitespace-nowrap">{fmt(tx.createdAt)}</td><td><StatusBadge value={tx.type}/></td><td className="text-sm">{transactionLabel(tx.type,locale)}{tx.invoiceId&&<Link href="/dashboard/invoices" className="muted text-xs ms-2">#{tx.invoiceId}</Link>}</td><td className={`num font-semibold ${tx.amount>=0?'success-text':'error-text'}`}>{tx.amount>=0?'+':'−'}{money(Math.abs(tx.amount),tx.currency)}</td><td className="num">{money(tx.balanceAfter,tx.currency)}</td><td><StatusBadge value={tx.status}/></td></tr>)}</tbody></table></div>}
      </div>
    </div>
  </div>
}
