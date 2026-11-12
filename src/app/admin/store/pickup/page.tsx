'use client'
import {useState} from 'react'
import Link from '@/components/AppLink'
import {StoreShell,Notice,useJson,send,faDate} from '../shared'
import '../desk.css'
type Order={orderId:number;customer:string;invoice:string;status:string;attempts:number;items:string;createdAt:string}
function Pickup({order,reload,manager}:{order:Order;reload:()=>Promise<void>;manager:boolean}){
 const [code,setCode]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const ready=order.status==='READY',locked=order.attempts>=10
 async function act(action:'ready'|'collect'|'reissue'){if(busy)return;if(action==='reissue'&&!window.confirm('کد قبلی باطل و کد تازه برای مشتری پیامک شود؟'))return;setBusy(true);setError('');try{const result=await send('/api/admin/store/pickup','POST',{orderId:order.orderId,action,code});if(result.ok){setCode('');await reload()}else setError(result.error)}catch{setError('ارتباط برقرار نشد؛ وضعیت سفارش را تازه کنید و دوباره تلاش کنید')}finally{setBusy(false)}}
 return <section className={`sa-card cd-pickup${ready?' is-ready':''}`} aria-labelledby={`pickup-${order.orderId}`}>
  <header className="cd-pickup-head"><div><h2 id={`pickup-${order.orderId}`}><Link className="sa-link" href={`/admin/store/orders/${order.orderId}`}>سفارش <bdi className="cd-num">{order.orderId.toLocaleString('fa-IR',{useGrouping:false})}</bdi></Link></h2><p className="cd-meta">{order.customer} · <bdi>{order.invoice}</bdi> · {faDate(order.createdAt,true)}</p></div><span className={`cd-status ${ready?'is-ok':'is-warn'}`}>{ready?'آمادهٔ مراجعه':'در انتظار آماده‌سازی'}</span></header>
  <p className="cd-pickup-items">{order.items}</p>
  {!ready?<button className="btn btn-primary" type="button" disabled={busy} onClick={()=>void act('ready')}>{busy?'در حال ثبت…':'آماده است؛ کد تحویل پیامک شود'}</button>
   :<form className="cd-collect" onSubmit={event=>{event.preventDefault();void act('collect')}}><label className="cd-field"><span>کد تحویل مشتری</span><input className="input cd-code" dir="ltr" inputMode="numeric" pattern="[0-9۰-۹]{6}" maxLength={6} autoComplete="off" required value={code} onChange={event=>setCode(event.target.value)} disabled={busy||locked}/></label><button className="btn btn-primary" disabled={busy||locked||code.length!==6} type="submit">{busy?'در حال ثبت…':'تحویل و بستن سفارش'}</button></form>}
  {locked&&<p className="cd-locked" role="status">کد پس از ده تلاش نادرست قفل شده است؛ مدیر باید کد تازه صادر کند.</p>}
  {ready&&manager&&<button className="btn btn-ghost" type="button" disabled={busy} onClick={()=>void act('reissue')}>صدور و پیامک کد تازه</button>}
  {error&&<Notice tone="error">{error}</Notice>}
 </section>
}
export default function PickupPage(){
 const {data,error,loading,reload}=useJson<{orders:Order[];manager:boolean}>('/api/admin/store/pickup')
 const orders=data?.orders||[],ready=orders.filter(order=>order.status==='READY').length
 return <StoreShell title="تحویل سفارش آنلاین از فروشگاه" actions={<button className="btn btn-ghost" type="button" disabled={loading} onClick={()=>void reload()}>{loading?'در حال تازه‌سازی…':'تازه‌سازی'}</button>}>
  <p className="sa-hint">فقط سفارش پرداخت‌شده آمادهٔ تحویل می‌شود. کارشناس ابتدا سفارش را از صفحهٔ سفارش‌ها برمی‌دارد؛ تحویل نهایی فقط با کد مشتری ثبت می‌شود.</p>
  {error&&<Notice tone="error">{error}</Notice>}
  {loading&&!data&&<p className="sa-hint" role="status">در حال دریافت سفارش‌ها…</p>}
  {orders.length>0&&<p className="cd-meta" role="status"><span className="cd-num">{ready.toLocaleString('fa-IR')}</span> آمادهٔ مراجعه · <span className="cd-num">{(orders.length-ready).toLocaleString('fa-IR')}</span> در انتظار آماده‌سازی</p>}
  {orders.length>0&&<div className="cd-pickups">{orders.map(order=><Pickup key={order.orderId} order={order} reload={reload} manager={!!data?.manager}/>)}</div>}
  {data&&!orders.length&&<div className="cd-empty-state"><b>سفارشی برای تحویل حضوری نیست</b><span>سفارش‌های پرداخت‌شده با روش «تحویل از فروشگاه» اینجا می‌آیند</span></div>}
 </StoreShell>
}
