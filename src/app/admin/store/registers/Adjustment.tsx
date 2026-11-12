'use client'
import {useRef,useState} from 'react'
import {send,Notice} from '../shared'
import {toMinor} from '@/shared/money'

export default function Adjustment({sessionId,currency,reload}:{sessionId:number;currency:string;reload:()=>Promise<void>}){
 const [method,setMethod]=useState('CASH'),[direction,setDirection]=useState('in'),[amount,setAmount]=useState(''),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),key=useRef('')
 function changed(){key.current=''}
 async function submit(event:React.FormEvent){
  event.preventDefault();if(busy)return;setBusy(true);setError('')
  try{
   const minor=toMinor(amount,currency);if(minor<=0n)throw Error('مبلغ باید بیشتر از صفر باشد')
   key.current||=crypto.randomUUID()
   const result=await send('/api/admin/store/counter','POST',{op:'register.adjust',sessionId,requestId:key.current,method,amountMinor:(direction==='out'?-minor:minor).toString(),reason})
   if(!result.ok)throw Error(result.error)
   key.current='';setAmount('');setReason('');await reload()
  }catch(error){setError(error instanceof Error?error.message:'ثبت انجام نشد')}finally{setBusy(false)}
 }
 return <details><summary>ثبت دریافت یا برداشت خارج از فروش</summary><form className="sa-form" onSubmit={submit}><fieldset disabled={busy}><legend>حرکت صندوق با ثبت دلیل</legend><label className="sa-field"><span>روش</span><select className="input" value={method} onChange={event=>{setMethod(event.target.value);changed()}}><option value="CASH">نقد</option><option value="CARD">کارت‌خوان</option></select></label><label className="sa-field"><span>جهت</span><select className="input" value={direction} onChange={event=>{setDirection(event.target.value);changed()}}><option value="in">دریافت</option><option value="out">برداشت یا استرداد</option></select></label><label className="sa-field"><span>مبلغ ({currency})</span><input className="input" required inputMode="decimal" value={amount} onChange={event=>{setAmount(event.target.value);changed()}}/></label><label className="sa-field"><span>دلیل دریافت یا برداشت</span><input className="input" required minLength={3} maxLength={300} value={reason} onChange={event=>{setReason(event.target.value);changed()}}/></label><button className="btn btn-ghost" type="submit">ثبت حرکت صندوق</button></fieldset>{error&&<Notice tone="error">{error}</Notice>}</form></details>
}
