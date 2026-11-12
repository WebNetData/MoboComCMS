'use client'
import { useEffect,useState } from 'react'
import Link from '@/components/AppLink'
import type {CounterCustomer} from '@/modules/store/domain/counter-sales'
import {formatMoney} from '@/shared/money'
type Context={wallets:{currency:string;balanceMinor:string}[];club:{enabled:boolean;balance:number;tier:string;pointValueToman:number;minRedeem:number};history:{id:number;kind:string;title:string;channel:string;status:string;statusLabel:string;createdAt:string;href:string}[]}
const CHANNEL:Record<string,string>={COUNTER:'حضوری',REPAIR:'تعمیر'}
export default function CustomerDesk({customer,name,phone,onCustomer,onName,onPhone}:{customer:CounterCustomer|null;name:string;phone:string;onCustomer:(value:CounterCustomer|null)=>void;onName:(value:string)=>void;onPhone:(value:string)=>void}){
 const [context,setContext]=useState<Context|null>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false)
 useEffect(()=>{setContext(null);if(!customer)return;const controller=new AbortController();fetch(`/api/admin/store/counter?customer=${customer.id}`,{cache:'no-store',signal:controller.signal}).then(async response=>{const data=await response.json();if(!response.ok)throw Error(data.error||'سابقه دریافت نشد');if(!controller.signal.aborted)setContext(data)}).catch(error=>{if(!controller.signal.aborted)setMessage(error.message)});return()=>controller.abort()},[customer])
 async function resolve(){setBusy(true);setMessage('');try{const response=await fetch('/api/admin/store/counter',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({op:'customer.resolve',phone,name})}),data=await response.json();if(!response.ok)throw Error(data.error||'مشتری پیدا نشد');onCustomer(data.customer);onPhone(data.customer.phone);onName(data.customer.name||name)}catch(error){setMessage(error instanceof Error?error.message:'ارتباط برقرار نشد')}finally{setBusy(false)}}
 if(customer)return <div className="cd-customer">
  <div className="cd-person">
   <span className="cd-avatar" aria-hidden="true">{(customer.name||'م').trim().charAt(0)}</span>
   <div className="cd-person-name"><b>{customer.name||'مشتری بدون نام'}</b><bdi dir="ltr" className="cd-num">{customer.phone}</bdi></div>
   <button type="button" className="btn btn-ghost btn-sm" onClick={()=>{onCustomer(null);onPhone('');setContext(null)}}>خرید بدون حساب</button>
  </div>
  {message&&<p className="cd-error" role="alert">{message}</p>}
  {context?<>
   <dl className="cd-facts">{context.wallets.map(wallet=><div key={wallet.currency}><dt>کیف پول {wallet.currency}</dt><dd className="cd-num">{formatMoney(BigInt(wallet.balanceMinor),wallet.currency,'fa-IR')}</dd></div>)}<div><dt>باشگاه مشتریان</dt><dd>{context.club.enabled?<><span className="cd-num">{context.club.balance.toLocaleString('fa-IR')}</span> امتیاز · {context.club.tier}</>:'غیرفعال'}</dd></div></dl>
   <details className="cd-history"><summary>سابقهٔ خرید و تعمیر <span className="cd-meta">{context.history.length.toLocaleString('fa-IR')}</span></summary>{context.history.length?<ul>{context.history.map(row=><li key={`${row.kind}:${row.id}`}><Link className="sa-link" href={row.href}>{row.title}</Link><span className="cd-meta">{CHANNEL[row.channel]||'آنلاین'} · {row.statusLabel}</span></li>)}</ul>:<p className="sa-hint">سابقه‌ای در دسترس شما نیست.</p>}</details>
  </>:!message&&<p className="sa-hint" role="status">در حال دریافت کیف پول و سابقه…</p>}
 </div>
 return <div className="cd-customer">
  <div className="cd-field"><label htmlFor="counter-customer-phone">شمارهٔ موبایل</label><div className="cd-inline"><input id="counter-customer-phone" className="input" type="tel" dir="ltr" maxLength={30} value={phone} onChange={event=>{onPhone(event.target.value);onCustomer(null)}} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();if(phone&&!busy)void resolve()}}}/><button type="button" className="btn btn-ghost" disabled={busy||!phone} onClick={()=>void resolve()}>{busy?'در حال بررسی…':'پیدا کردن / ساخت حساب'}</button></div></div>
  <label className="cd-field"><span>نام مشتری، اختیاری</span><input id="counter-customer-name" className="input" maxLength={120} value={name} onChange={event=>onName(event.target.value)}/></label>
  {message&&<p className="cd-error" role="alert">{message}</p>}
  <p className="sa-hint">با موبایل، حساب موجود پیدا یا یک حساب ساده ساخته می‌شود. بدون شماره فروش مهمان ثبت می‌شود.</p>
 </div>
}
