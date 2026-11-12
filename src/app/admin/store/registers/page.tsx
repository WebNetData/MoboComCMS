'use client'
import {useRef,useState} from 'react'
import Link from '@/components/AppLink'
import {StoreShell,Notice,useJson,send,faDate} from '../shared'
import {formatMoney,toMinor} from '@/shared/money'
import Adjustment from './Adjustment'
import '../desk.css'
type Session={id:number;register:string;cashier:string;currency:string;status:string;openingCashMinor:string;expectedCashMinor:string;expectedCardMinor:string;countedCashMinor:string|null;countedCardMinor:string|null;differenceCashMinor:string;differenceCardMinor:string;orders:number;mine:boolean;createdAt:string;closedAt:string|null}
const show=(value:string,currency:string)=>formatMoney(BigInt(value||'0'),currency,'fa-IR')
function Variance({label,value,currency}:{label:string;value:string;currency:string}){
 const amount=BigInt(value||'0'),tone=amount<0n?'is-short':amount>0n?'is-over':'is-even'
 return <div><dt>{label}</dt><dd className={`cd-num ${tone}`}>{amount===0n?'بدون اختلاف':<>{amount<0n?'کسری ':'اضافه '}<bdi>{show((amount<0n?-amount:amount).toString(),currency)}</bdi></>}</dd></div>
}
function SessionCard({row,reload}:{row:Session;reload:()=>Promise<void>}){
 const [cash,setCash]=useState(''),[card,setCard]=useState(''),[note,setNote]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const open=row.status==='OPEN'
 async function close(event:React.FormEvent){event.preventDefault();if(busy||!window.confirm('شمارش نقد و کارت ثبت و این نوبت صندوق بسته شود؟'))return;setBusy(true);setError('');try{const result=await send('/api/admin/store/counter','POST',{op:'register.close',sessionId:row.id,countedCashMinor:toMinor(cash,row.currency).toString(),countedCardMinor:toMinor(card,row.currency).toString(),note});if(!result.ok)throw Error(result.error);await reload()}catch(error){setError(error instanceof Error?error.message:'بستن صندوق انجام نشد')}finally{setBusy(false)}}
 return <section className={`sa-card cd-session${open?' is-open':''}`} aria-labelledby={`register-${row.id}`}>
  <header className="cd-session-head"><div><h2 id={`register-${row.id}`}>{row.register}</h2><p className="cd-meta">{row.cashier} · {faDate(row.createdAt,true)}{row.closedAt&&<> تا {faDate(row.closedAt,true)}</>} · <span className="cd-num">{row.orders.toLocaleString('fa-IR')}</span> فروش</p></div><span className={`cd-status${open?' is-ok':''}`}>{open?'باز':'بسته'}</span></header>
  <dl className="cd-figures"><div><dt>تنخواه آغاز</dt><dd className="cd-num">{show(row.openingCashMinor,row.currency)}</dd></div><div><dt>نقد مورد انتظار</dt><dd className="cd-num">{show(row.expectedCashMinor,row.currency)}</dd></div><div><dt>جمع کارت‌خوان</dt><dd className="cd-num">{show(row.expectedCardMinor,row.currency)}</dd></div></dl>
  {row.status==='CLOSED'&&<dl className="cd-variance"><Variance label="اختلاف نقد" value={row.differenceCashMinor} currency={row.currency}/><Variance label="اختلاف کارت‌خوان" value={row.differenceCardMinor} currency={row.currency}/></dl>}
  {open&&row.mine&&<div className="cd-session-tools">
   <Adjustment sessionId={row.id} currency={row.currency} reload={reload}/>
   <details className="cd-tool"><summary>شمارش و بستن صندوق</summary><form onSubmit={close}><fieldset disabled={busy}><legend>نقد و رسیدهای کارت‌خوان را بشمارید؛ شمارش بسته‌شده قابل ویرایش نیست</legend><label className="cd-field"><span>نقد شمارش‌شده ({row.currency})</span><input className="input cd-num" dir="ltr" inputMode="decimal" required value={cash} onChange={event=>setCash(event.target.value)}/></label><label className="cd-field"><span>جمع رسیدهای کارت‌خوان ({row.currency})</span><input className="input cd-num" dir="ltr" inputMode="decimal" required value={card} onChange={event=>setCard(event.target.value)}/></label><label className="cd-field"><span>توضیح اختلاف، اختیاری</span><textarea className="input" maxLength={500} value={note} onChange={event=>setNote(event.target.value)}/></label><button className="btn btn-primary" type="submit">{busy?'در حال بستن…':'ثبت شمارش و بستن'}</button></fieldset></form></details>
  </div>}
  {error&&<Notice tone="error">{error}</Notice>}
 </section>
}
export default function Registers(){
 const {data,error,reload,loading}=useJson<{sessions:Session[]}>('/api/admin/store/counter?registers=1'),[register,setRegister]=useState('صندوق اصلی'),[currency,setCurrency]=useState('IRT'),[cash,setCash]=useState('0'),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),key=useRef('')
 async function open(event:React.FormEvent){event.preventDefault();if(busy)return;setBusy(true);setMessage('');try{key.current||=crypto.randomUUID();const result=await send('/api/admin/store/counter','POST',{op:'register.open',requestId:key.current,register,currency,openingCashMinor:toMinor(cash,currency).toString()});if(!result.ok)throw Error(result.error);key.current='';await reload()}catch(error){setMessage(error instanceof Error?error.message:'صندوق باز نشد');await reload()}finally{setBusy(false)}}
 // Open shifts first (the cashier's own before others'), then the closed history in the server's order.
 const rank=(row:Session)=>row.status==='OPEN'?(row.mine?0:1):2
 const sessions=[...(data?.sessions||[])].sort((a,b)=>rank(a)-rank(b)),mine=sessions.some(row=>row.status==='OPEN'&&row.mine)
 return <StoreShell title="صندوق و کارکرد کارکنان" actions={<Link className="btn btn-primary" href="/admin/store/counter">فروش حضوری</Link>}>
  <p className="sa-hint">هر فروش به نوبت صندوق متصل می‌شود. بازپرداخت کیف پول از نقد صندوق کم نمی‌شود؛ دریافت و برداشت فیزیکی جداگانه در حساب صندوق ثبت می‌شود.</p>
  {error&&<Notice tone="error">{error}</Notice>}{message&&<Notice tone="error">{message}</Notice>}
  <form className="sa-card cd-open" onSubmit={open}><h2>{mine?'بازکردن صندوق دیگر':'بازکردن نوبت صندوق'}</h2><fieldset disabled={busy}><label className="cd-field"><span>نام صندوق</span><input className="input" required maxLength={60} value={register} onChange={event=>{setRegister(event.target.value);key.current=''}}/></label><label className="cd-field"><span>واحد پول</span><select className="input" value={currency} onChange={event=>{setCurrency(event.target.value);key.current=''}}><option value="IRT">تومان</option><option value="IRR">ریال</option><option value="USD">دلار</option></select></label><label className="cd-field"><span>نقد آغاز نوبت</span><input className="input cd-num" dir="ltr" required inputMode="decimal" value={cash} onChange={event=>{setCash(event.target.value);key.current=''}}/></label><button className={`btn ${mine?'btn-ghost':'btn-primary'}`} type="submit">{busy?'در حال بازکردن…':'بازکردن صندوق برای من'}</button></fieldset></form>
  {loading&&!data&&<p className="sa-hint" role="status">در حال دریافت صندوق‌ها…</p>}
  {data&&!sessions.length&&<div className="cd-empty-state"><b>هنوز نوبت صندوقی ثبت نشده است</b><span>نخستین صندوق را با تنخواه آغاز باز کنید</span></div>}
  {sessions.length>0&&<div className="cd-sessions">{sessions.map(row=><SessionCard key={row.id} row={row} reload={reload}/>)}</div>}
 </StoreShell>
}
