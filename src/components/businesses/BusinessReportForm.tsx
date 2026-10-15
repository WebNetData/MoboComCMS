'use client'
import { useRef, useState, type FormEvent } from 'react'
import { BUSINESS_REPORT_REASONS } from '@/modules/businesses/domain/trust-labels'
import styles from './BusinessExperience.module.css'
export default function BusinessReportForm({ businessId, reviewId }: { businessId: number; reviewId: number }) {
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[done,setDone]=useState(false),lock=useRef(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();if(lock.current)return;lock.current=true;setBusy(true);setMessage('')
    const form=new FormData(event.currentTarget)
    try {
      const response=await fetch('/api/businesses',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'report',businessId,reviewId,reason:form.get('reason'),note:form.get('note')})}),result=await response.json()
      if(!response.ok)throw Error(result.error||'گزارش ثبت نشد')
      setDone(true);setMessage(result.duplicate?'گزارش شما قبلاً ثبت شده و در انتظار رسیدگی است.':'گزارش محرمانه ثبت شد؛ نتیجه را در فعالیت‌های من ببینید.')
    }catch(error){setMessage(error instanceof Error?error.message:'ارتباط برقرار نشد؛ دوباره تلاش کنید.')}
    finally{lock.current=false;setBusy(false)}
  }
  return <details className={styles.trustDisclosure} data-testid="business-report"><summary>گزارش این تجربه</summary><div className={styles.trustContent}><p className={styles.muted}>گزارش شما و مشخصات گزارش‌دهنده عمومی نیست. گزارش به‌تنهایی باعث حذف نظر نمی‌شود.</p>{!done&&<form onSubmit={submit} className={styles.form} aria-busy={busy}><fieldset disabled={busy} className={styles.requestFields}><label className={styles.field}>دلیل گزارش<select name="reason" required defaultValue=""><option value="" disabled>انتخاب کنید</option>{Object.entries(BUSINESS_REPORT_REASONS).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label className={styles.field}>توضیح محرمانه<textarea name="note" required minLength={10} maxLength={1000}/></label><button type="submit" className="btn btn-ghost">{busy?'در حال ثبت…':'ارسال گزارش'}</button></fieldset></form>}{message&&<p role="status" className={styles.notice}>{message}</p>}</div></details>
}
