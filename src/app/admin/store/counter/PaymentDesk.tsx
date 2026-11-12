'use client'
import {useState} from 'react'
import {formatMoney,minorToDecimal,toMinor} from '@/shared/money'
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
export default function PaymentDesk({value,onChange,total,currency,customerId}:{value:DeskPayment;onChange:(value:DeskPayment)=>void;total:bigint;currency:string;customerId:number|null}){
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false),patch=(part:Partial<DeskPayment>)=>onChange({...value,...part})
 let rows:CounterTenderInput[]=[],error='';try{rows=paymentRows(value,total,currency)}catch(caught){error=caught instanceof Error?caught.message:'مبالغ معتبر نیست'}
 const wallet=rows.some(row=>row.method==='WALLET')||value.points>0
 async function otp(){if(!customerId)return;setBusy(true);try{const response=await fetch('/api/admin/store/counter',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({op:'wallet.otp',customerId})}),data=await response.json();setMessage(response.ok?'کد تأیید به موبایل مشتری ارسال شد':data.error||'ارسال کد انجام نشد')}catch{setMessage('ارتباط برقرار نشد')}finally{setBusy(false)}}
 return <section className="counter-payment-method"><h2>دریافت وجه</h2><label htmlFor="counter-method">روش پرداخت</label><select id="counter-method" className="input" value={value.method} onChange={event=>patch({method:event.target.value as CounterPaymentMethod})}><option value="CASH">نقد</option><option value="CARD">کارت‌خوان</option><option value="WALLET" disabled={!customerId}>کیف پول مشتری</option><option value="SPLIT">ترکیبی: نقد، کارت و کیف پول</option></select>
 {value.method==='SPLIT'&&<><label htmlFor="counter-card-amount">مبلغ کارت‌خوان ({currency})</label><input id="counter-card-amount" className="input" inputMode="decimal" value={value.card} onChange={event=>patch({card:event.target.value})}/><label htmlFor="counter-wallet-amount">مبلغ کیف پول ({currency})</label><input id="counter-wallet-amount" className="input" inputMode="decimal" disabled={!customerId} value={value.wallet} onChange={event=>patch({wallet:event.target.value})}/><p>باقی مبلغ نقد دریافت می‌شود.</p></>}
 {(value.method==='CARD'||value.method==='SPLIT')&&<><label htmlFor="counter-reference">شمارهٔ پیگیری کارت‌خوان</label><input id="counter-reference" className="input" maxLength={120} required={rows.some(row=>row.method==='CARD')} value={value.reference} onChange={event=>patch({reference:event.target.value})}/></>}
 {customerId&&currency==='IRT'&&<><label htmlFor="counter-points">تبدیل امتیاز باشگاه به کیف پول</label><input id="counter-points" className="input" type="number" min={0} max={1000000000} value={value.points} onChange={event=>patch({points:Math.max(0,Math.floor(Number(event.target.value)||0))})}/><small className="sa-hint">تبدیل طبق نرخ تنظیمات باشگاه است؛ اعتبار اضافه در کیف پول می‌ماند. مبلغ پرداخت از کیف پول را جدا انتخاب کنید.</small></>}
 {wallet&&<><button type="button" className="btn btn-ghost" disabled={busy||!customerId} onClick={()=>void otp()}>ارسال کد تأیید برداشت برای مشتری</button><label htmlFor="counter-wallet-code">کد پیامکی مشتری</label><input id="counter-wallet-code" className="input" inputMode="numeric" pattern="[0-9۰-۹]{6}" maxLength={6} autoComplete="one-time-code" required value={value.walletCode} onChange={event=>patch({walletCode:event.target.value})}/></>}
 {message&&<p role="status">{message}</p>}{error&&<p role="alert">{error}</p>}{rows.length>0&&<ul>{rows.map(row=><li key={row.method}>{row.method==='CASH'?'نقد':row.method==='CARD'?'کارت‌خوان':'کیف پول'}: {formatMoney(BigInt(row.amountMinor),currency||'IRT','fa-IR')}</li>)}</ul>}
 </section>
}
