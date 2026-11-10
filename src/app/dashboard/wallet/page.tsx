'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from '@/components/AppLink'
import Icon from '@/components/site/Icon'
import { useI18n } from '@/i18n/LocaleProvider'
import { useModuleEnabled } from '@/extensions/client/ExtensionProvider'
import { formatCurrency, currencyLabel, BASE_CURRENCY } from '@/shared/money/client'
import { newIdempotencyKey } from '@/shared/security/idempotency'
import type { CheckoutGatewayChoice } from '@/modules/checkout/ui/client'
import { transactionLabel } from '@/modules/wallet/domain/transaction-locale'

interface Tx { id:number; amount:number; balanceAfter:number; currency:string; type:string; status:string; description:string; invoiceId:number|null; orderId:number|null; createdAt:string }
interface Balance { currency:string; balance:number }
const TX_STATE:Record<string,[string,string]>={DONE:['انجام شد','is-ok'],PENDING:['در انتظار پرداخت','is-warn'],PROCESSING:['در حال انجام','is-warn'],FAILED:['ناموفق','is-bad'],REVERSED:['برگشت خورد','is-off'],CANCELLED:['لغو شد','is-off']}
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
  const [topupCurrencies,setTopupCurrencies]=useState<string[]>([]); const [topupGateways,setTopupGateways]=useState<CheckoutGatewayChoice[]>([]); const [currency,setCurrency]=useState(BASE_CURRENCY); const [gatewayRef,setGatewayRef]=useState(''); const [amount,setAmount]=useState(()=>quickFor(BASE_CURRENCY)[1])
  const [busy,setBusy]=useState(false); const [error,setError]=useState(''); const [loading,setLoading]=useState(true)
  const load=useCallback(async()=>{ const res=await fetch('/api/wallet'); if(res.ok){const d=await res.json();setBalances(d.balances||[]);setTxs(d.transactions||[]);setTotals(d.totals||{});const cs=d.topupCurrencies||[];setTopupCurrencies(cs);setTopupGateways(d.topupGateways||[]);setCurrency(c=>cs.includes(c)?c:(cs[0]||d.balances?.[0]?.currency||c))} setLoading(false)},[])
  useEffect(()=>{load()},[load])
  const compatibleGateways=useMemo(()=>topupGateways.filter(g=>g.acceptedCurrencies.includes(currency)),[topupGateways,currency])
  useEffect(()=>{if(!compatibleGateways.some(g=>g.ref===gatewayRef))setGatewayRef(compatibleGateways.find(g=>g.isDefault)?.ref||compatibleGateways[0]?.ref||'')},[compatibleGateways,gatewayRef])
  const balance=balances.find(b=>b.currency===currency)?.balance||0; const summary=totals[currency]||{toppedUp:0,spent:0,count:0}; const visible=useMemo(()=>txs.filter(x=>x.currency===currency),[txs,currency])
  const money=(n:number,c=currency)=>formatCurrency(n||0,c,isFa?'fa-IR':'en-US'); const fmt=(d:string)=>new Date(d).toLocaleString(isFa?'fa-IR':'en-US')
  async function topUp(){ setBusy(true);setError('');const token=topupKey(currency,amount); let res:Response; try{res=await fetch('/api/wallet',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':token.key},body:JSON.stringify({amount:String(amount),currency,gatewayRef:gatewayRef||undefined})})}catch{setBusy(false);setError(t.errGeneric);return} const data=await res.json().catch(()=>null);try{sessionStorage.removeItem(token.storage)}catch{} setBusy(false);if(!res.ok){setError(topupError(data,isFa)||t.errGeneric);return} if(data?.paymentUrl)window.location.href=data.paymentUrl;else load() }
  const currencies=[...new Set([...topupCurrencies,...balances.map(b=>b.currency)].map(c=>c==='TMN'?'IRT':c))]
  const otherBalances=balances.filter(b=>b.currency!==currency&&b.balance>0)
  const txState=(status:string)=>TX_STATE[status]||[status,'']
  return <div className="dt-page" dir={isFa?'rtl':'ltr'}>
    <header className="dt-head">
      <div><h1>{t.wallet}</h1><p>{vpnOn ? t.walletSub : isFa ? 'یک‌بار شارژ کنید و خریدهای سایت را از موجودی بپردازید.' : 'Top up once and pay for your purchases from the balance.'}</p></div>
      <div className="dt-head-actions">
        {currencies.length>1&&<select className="select" value={currency} onChange={e=>setCurrency(e.target.value)} aria-label={isFa?'واحد پول':'Currency'}>{currencies.map(c=><option key={c} value={c}>{currencyLabel(c,isFa?'fa-IR':'en-US')}</option>)}</select>}
        {vpnOn ? <Link href="/plans" className="btn btn-ghost">{t.browsePlans}</Link> : storeOn && <Link href="/products" className="btn btn-ghost"><Icon name="bag" size={16} /> {isFa?'فروشگاه':'Shop'}</Link>}
      </div>
    </header>

    <section className="dt-balance">
      <div className="dt-balance-main">
        <span className="dt-balance-icon" aria-hidden="true"><Icon name="wallet" size={26} /></span>
        <div><small>{t.walletBalance}</small><b className="num">{money(balance)}</b>{otherBalances.length>0&&<span className="dt-balance-more">{otherBalances.map(b=><button key={b.currency} type="button" onClick={()=>setCurrency(b.currency)}>{money(b.balance,b.currency)}</button>)}</span>}</div>
      </div>
      <dl className="dt-balance-stats">
        <div><dt>{t.totalToppedUp}</dt><dd className="num">{money(summary.toppedUp)}</dd></div>
        <div><dt>{t.totalSpent}</dt><dd className="num">{money(summary.spent)}</dd></div>
        <div><dt>{t.txCount}</dt><dd className="num">{summary.count.toLocaleString(isFa?'fa-IR':'en-US')}</dd></div>
      </dl>
      <p className="dt-balance-hint">{t.walletPayHint}</p>
    </section>

    <div className="dt-split">
      <section className="dt-card dt-topup" aria-labelledby="dt-topup-title">
        <h2 id="dt-topup-title">{t.topUpTitle}</h2><p>{t.topUpHint}</p>
        {!topupCurrencies.includes(currency)&&<p className="dt-alert is-bad">{isFa ? 'شارژ این واحد پول با درگاه‌های فعال در دسترس نیست.' : `Top-up is not available for ${currency} with the active gateways.`}</p>}
        <div className="dt-quick" role="group" aria-label={isFa?'مبلغ‌های آماده':'Quick amounts'}>{quickFor(currency).map(q=><button key={q} type="button" aria-pressed={amount===q} onClick={()=>setAmount(q)} className={amount===q?'is-on':''}>{money(q)}</button>)}</div>
        <label className="dt-field"><span>{t.amountLabel} {isFa?'به '+(currency==='IRR'?'ریال':currency==='IRT'||currency==='TMN'?'تومان':currency):'('+currency+')'}</span><input className="input num" dir="ltr" inputMode="decimal" value={amount} onChange={e=>{const n=Number(e.target.value.replace(/[^\d.]/g,''));setAmount(Number.isFinite(n)?n:0)}}/><small className="num">{amount>0?money(amount):''}</small></label>
        {compatibleGateways.length>0&&<label className="dt-field"><span>{isFa?'درگاه پرداخت':'Payment gateway'}</span><select className="select" value={gatewayRef} onChange={e=>setGatewayRef(e.target.value)}>{compatibleGateways.map(g=><option key={g.ref} value={g.ref}>{g.label}{g.feePercent?` · ${g.feePercent}%`:''}</option>)}</select></label>}
        {error&&<p className="dt-alert is-bad" role="alert">{error}</p>}
        <button type="button" className="btn btn-primary dt-wide" disabled={busy||amount<=0||!topupCurrencies.includes(currency)||compatibleGateways.length===0} onClick={topUp}>{busy?t.loading:<><Icon name="bolt" size={16} /> {isFa?`پرداخت ${money(amount)}`:t.payNow}</>}</button>
        <small className="dt-note">{vpnOn ? t.topUpNote : isFa ? 'از موجودی کیف پول برای پرداخت سفارش‌ها و خریدهای سایت استفاده می‌شود.' : 'Wallet balance can be used to pay for orders and purchases on the site.'}</small>
      </section>

      <section className="dt-card" aria-labelledby="dt-tx-title">
        <header className="dt-card-head"><h2 id="dt-tx-title">{t.txHistory}</h2><button type="button" className="btn btn-ghost btn-sm" onClick={load}><Icon name="clock" size={14} /> {t.refresh}</button></header>
        {loading ? <div className="dt-skeleton" aria-busy="true"><i /><i /></div>
          : visible.length===0 ? <div className="dt-empty"><Icon name="wallet" size={28} /><b>{t.noTx}</b><span>{isFa?'اولین شارژ یا خرید شما این‌جا ثبت می‌شود.':'Your first top-up or purchase appears here.'}</span></div>
          : <ul className="dt-tx">{visible.map(tx=>{const [label,tone]=txState(tx.status);const income=tx.amount>=0;return <li key={tx.id} className={tx.status==='DONE'?'':'is-muted'}>
            <span className={`dt-tx-icon ${income?'is-in':'is-out'}`} aria-hidden="true"><Icon name={income?'plus':'arrow'} size={16} /></span>
            <div className="dt-tx-main"><b>{transactionLabel(tx.type,locale)}</b><small>{fmt(tx.createdAt)}{tx.invoiceId?<> · <Link href="/dashboard/invoices">{isFa?'فاکتور':'Invoice'} #{tx.invoiceId.toLocaleString(isFa?'fa-IR':'en-US')}</Link></>:null}</small></div>
            <div className="dt-tx-end"><b className={`num ${income?'is-in':'is-out'}`}>{income?'+':'−'}{money(Math.abs(tx.amount),tx.currency)}</b><small>{tx.status==='DONE'?<>{isFa?'موجودی پس از آن':'Balance after'}: <span className="num">{money(tx.balanceAfter,tx.currency)}</span></>:<span className={`dt-state ${tone}`}>{label}</span>}</small></div>
          </li>})}</ul>}
      </section>
    </div>
  </div>
}
