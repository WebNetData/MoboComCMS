'use client'
import {useState} from 'react'
import {formatMoney,toMinor} from '@/shared/money'
import type {CounterPaymentMethod,CounterTenderInput} from '@/modules/store/domain/counter-sales'
export type DeskPayment={method:CounterPaymentMethod;card:string;wallet:string;reference:string;walletCode:string;points:number}
export const EMPTY_PAYMENT:DeskPayment={method:'CASH',card:'',wallet:'',reference:'',walletCode:'',points:0}
export function paymentRows(value:DeskPayment,total:bigint,currency:string):CounterTenderInput[]{
 const amount=(raw:string)=>toMinor(raw||'0',currency||'IRT')
 const wallet=value.method==='WALLET'?total:value.method==='SPLIT'?amount(value.wallet):0n
 const card=value.method==='CARD'?total:value.method==='SPLIT'?amount(value.card):0n
 const cash=total-wallet-card
 if(wallet<0n||card<0n||cash<0n)throw Error('جمع پرداخت‌ها بیشتر از مبلغ فروش است')
 return ([['CASH',cash],['CARD',card],['WALLET',wallet]] as const).filter(([,amount])=>amount>0n).map(([method,amount])=>({method,amountMinor:amount.toString(),reference:method==='CARD'?value.reference:''}))
}
const METHODS:{value:CounterPaymentMethod;label:string}[]=[{value:'CASH',label:'نقد'},{value:'CARD',label:'کارت‌خوان'},{value:'WALLET',label:'کیف پول'},{value:'SPLIT',label:'ترکیبی'}]
const TENDER={CASH:'نقد',CARD:'کارت‌خوان',WALLET:'کیف پول'} as const
export default function PaymentDesk({value,onChange,total,currency,customerId}:{value:DeskPayment;onChange:(value:DeskPayment)=>void;total:bigint;currency:string;customerId:number|null}){
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false),patch=(part:Partial<DeskPayment>)=>onChange({...value,...part})
 let rows:CounterTenderInput[]=[],error='';try{rows=paymentRows(value,total,currency)}catch(caught){error=caught instanceof Error?caught.message:'مبالغ معتبر نیست'}
 const wallet=rows.some(row=>row.method==='WALLET')||value.points>0
 const share=(minor:string)=>total>0n?Number(BigInt(minor)*10000n/total)/100:0
 async function otp(){if(!customerId)return;setBusy(true);try{const response=await fetch('/api/admin/store/counter',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({op:'wallet.otp',customerId})}),data=await response.json();setMessage(response.ok?'کد تأیید به موبایل مشتری ارسال شد':data.error||'ارسال کد انجام نشد')}catch{setMessage('ارتباط برقرار نشد')}finally{setBusy(false)}}
 return <div className="cd-payment">
  <fieldset className="cd-seg"><legend className="cd-sr">روش پرداخت</legend>{METHODS.map(method=>{const off=method.value==='WALLET'&&!customerId;return <label key={method.value} className={value.method===method.value?'is-on':''} title={off?'برای کیف پول ابتدا مشتری را با موبایل پیدا کنید':undefined}><input type="radio" name="counter-method" value={method.value} checked={value.method===method.value} disabled={off} onChange={()=>patch({method:method.value})}/>{method.label}</label>})}</fieldset>
  {value.method==='SPLIT'&&<div className="cd-pair"><label className="cd-field"><span>مبلغ کارت‌خوان ({currency||'—'})</span><input id="counter-card-amount" className="input cd-num" inputMode="decimal" dir="ltr" value={value.card} onChange={event=>patch({card:event.target.value})}/></label><label className="cd-field"><span>مبلغ کیف پول ({currency||'—'})</span><input id="counter-wallet-amount" className="input cd-num" inputMode="decimal" dir="ltr" disabled={!customerId} value={value.wallet} onChange={event=>patch({wallet:event.target.value})}/></label><p className="sa-hint cd-pair-wide">باقی مبلغ نقد دریافت می‌شود.</p></div>}
  {(value.method==='CARD'||value.method==='SPLIT')&&<label className="cd-field"><span>شمارهٔ پیگیری کارت‌خوان</span><input id="counter-reference" className="input cd-num" dir="ltr" maxLength={120} required={rows.some(row=>row.method==='CARD')} value={value.reference} onChange={event=>patch({reference:event.target.value})}/></label>}
  {customerId&&currency==='IRT'&&<label className="cd-field"><span>تبدیل امتیاز باشگاه به کیف پول</span><input id="counter-points" className="input cd-num" type="number" min={0} max={1000000000} value={value.points} onChange={event=>patch({points:Math.max(0,Math.floor(Number(event.target.value)||0))})}/><small className="sa-hint">طبق نرخ باشگاه؛ اعتبار اضافه در کیف پول می‌ماند. مبلغ برداشت از کیف پول جداگانه انتخاب می‌شود.</small></label>}
  {wallet&&<div className="cd-otp"><button type="button" className="btn btn-ghost" disabled={busy||!customerId} onClick={()=>void otp()}>{busy?'در حال ارسال…':'ارسال کد تأیید برای مشتری'}</button><label className="cd-field"><span>کد پیامکی مشتری</span><input id="counter-wallet-code" className="input cd-code" dir="ltr" inputMode="numeric" pattern="[0-9۰-۹]{6}" maxLength={6} autoComplete="one-time-code" required value={value.walletCode} onChange={event=>patch({walletCode:event.target.value})}/></label></div>}
  {message&&<p className="sa-hint" role="status">{message}</p>}{error&&<p className="cd-error" role="alert">{error}</p>}
  {rows.length>0&&<div className="cd-split">
   <div className="cd-split-bar" aria-hidden="true">{rows.map(row=><span key={row.method} className={`is-${row.method.toLowerCase()}`} style={{inlineSize:`${share(row.amountMinor)}%`}}/>)}</div>
   <ul>{rows.map(row=><li key={row.method}><span className={`cd-dot is-${row.method.toLowerCase()}`} aria-hidden="true"/>{TENDER[row.method]}<b className="cd-num">{formatMoney(BigInt(row.amountMinor),currency||'IRT','fa-IR')}</b></li>)}</ul>
  </div>}
 </div>
}
