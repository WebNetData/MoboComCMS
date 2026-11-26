'use client'

import {useEffect,useState} from 'react'
import Link from '@/components/AppLink'
import type {CloudFinancialPage,CloudFinancialRow} from '@/modules/hosting/domain/workspace'
import {formatMoney} from '@/shared/money'
import s from './cloud-financial.module.css'

const states:Record<string,string>={UNPAID:'در انتظار پرداخت',PAID:'پرداخت‌شده',CANCELLED:'لغوشده',REFUNDED:'مستردشده',EXPIRED:'منقضی‌شده',PENDING:'در انتظار',FULFILLED:'انجام‌شده',FAILED:'ناموفق',PROCESSING:'در حال پردازش'}
export default function CloudFinancial({orders=false}:{orders?:boolean}) {
  const [rows,setRows]=useState<CloudFinancialRow[]>([]),[cursor,setCursor]=useState<number|null>(null),[more,setMore]=useState(false)
  const [request,setRequest]=useState<{cursor?:number;key:number}>({key:0}),[loading,setLoading]=useState(true),[error,setError]=useState('')
  useEffect(()=>{const controller=new AbortController();setLoading(true);setError('')
    fetch(`/api/hosting/workspace?view=${orders?'orders':'invoices'}${request.cursor?`&cursor=${request.cursor}`:''}`,{cache:'no-store',signal:controller.signal})
      .then(async response=>{if(!response.ok)throw new Error('دریافت سوابق ممکن نشد. دوباره تلاش کنید.');return response.json() as Promise<CloudFinancialPage>})
      .then(data=>{setRows(current=>request.cursor?[...current,...data.items.filter(row=>!current.some(item=>item.orderId===row.orderId))]:data.items);setCursor(data.nextCursor);setMore(data.hasMore)})
      .catch(err=>{if(!controller.signal.aborted)setError(err instanceof Error?err.message:'دریافت سوابق ممکن نشد')})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false)})
    return()=>controller.abort()
  },[request,orders])
  return <section className={s.page} aria-busy={loading}>
    <header className={s.header}><div><span className={s.eyebrow}>حساب ابری شما</span><h1>{orders?'سفارش‌های ابری':'فاکتورهای ابری'}</h1><p>خرید، تمدید و افزونه‌های سرویس و دامنه؛ با وضعیت ثبت‌شده در حساب موبوکام.</p></div><Link className="btn btn-primary" href="/cloud/dashboard/new">سرویس جدید</Link></header>
    {error&&<div className={s.error} role="alert"><p>{error}</p><button type="button" className="btn btn-ghost" onClick={()=>setRequest(current=>({...current,key:current.key+1}))}>تلاش دوباره</button></div>}
    {!rows.length&&!more&&!loading&&!error&&<div className={s.empty}><h2>هنوز {orders?'سفارش':'فاکتور'} ابری ندارید</h2><p>پس از ثبت سفارش، وضعیت پرداخت و پیگیری آن اینجا نمایش داده می‌شود.</p><Link href="/cloud/dashboard/new" className="btn btn-primary">انتخاب سرویس</Link></div>}
    {!rows.length&&more&&!loading&&<p className={s.feedback}>فاکتور ابری در این بخش از سابقه وجود ندارد؛ برای بررسی ادامه، سوابق قدیمی‌تر را باز کنید.</p>}
    <div className={s.list}>{rows.map(row=><article key={row.orderId} className={s.row}>
      <div className={s.subject}><small>{orders?`سفارش ${row.orderId}`:'فاکتور'} <bdi>{row.number}</bdi></small><h2><Link href={`/cloud/dashboard/invoices/${encodeURIComponent(row.number)}`}>{row.title}</Link></h2><time dateTime={row.issuedAt}>{new Date(row.issuedAt).toLocaleDateString('fa-IR')}</time></div>
      <div className={s.amount}>{formatMoney(row.totalMinor,row.currency,'fa-IR')}<span className={s.status} data-paid={row.status==='PAID'}>{states[orders?row.orderStatus:row.status]||'در حال بررسی'}</span></div>
      <Link href={`/cloud/dashboard/invoices/${encodeURIComponent(row.number)}`} className="btn btn-ghost">{row.status==='UNPAID'?'مشاهده و پرداخت':'مشاهده جزئیات'}</Link>
    </article>)}</div>
    {loading&&<p className={s.feedback} role="status">در حال دریافت سوابق ابری…</p>}
    {more&&cursor&&!loading&&!error&&<button type="button" className="btn btn-ghost" onClick={()=>setRequest(current=>({cursor,key:current.key+1}))}>نمایش سوابق قدیمی‌تر</button>}
  </section>
}
