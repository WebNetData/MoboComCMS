'use client'
import { useRef, useState, type FormEvent } from 'react'
import Link from '@/components/AppLink'
import styles from './BusinessExperience.module.css'
export default function BusinessProofForm({ businessId, reviewId }: { businessId: number; reviewId: number }) {
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),lock=useRef(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();if(lock.current)return;lock.current=true;setBusy(true);setMessage('')
    const element=event.currentTarget,form=new FormData(element),file=form.get('file')
    try {
      if(!(file instanceof File)||!file.size||file.size>5*1024*1024)throw Error('یک تصویر با حجم حداکثر ۵ مگابایت انتخاب کنید.')
      form.set('businessId',String(businessId));form.set('reviewId',String(reviewId))
      const response=await fetch('/api/businesses/proofs',{method:'POST',body:form}),result=await response.json()
      if(!response.ok)throw Error(result.error||'مدرک ثبت نشد')
      element.reset();setMessage('مدرک خصوصی ثبت شد و منتظر بررسی مستقل مدیریت است. نتیجه در فعالیت‌های من نمایش داده می‌شود.')
    }catch(error){setMessage(error instanceof Error?error.message:'ارتباط برقرار نشد؛ وضعیت را در فعالیت‌های من بررسی کنید.')}
    finally{lock.current=false;setBusy(false)}
  }
  return <section className={`${styles.panel} ${styles.proofPanel}`} data-testid="business-proof"><span className={styles.eyebrow}>خصوصی · فقط شما و مدیر مجاز</span><h2>مدرک خرید برای تجربهٔ شما</h2><p className={styles.muted} id={`proof-help-${reviewId}`}>اختیاری است. قبل از ارسال تصویر رسید، شمارهٔ کارت، آدرس و اطلاعات تماس را بپوشانید. فایل منتشر نمی‌شود؛ نشان «مدرک خرید بررسی‌شده» فقط پس از تطبیق مدیر با همین نسخهٔ تجربه نمایش داده می‌شود.</p><form onSubmit={submit} className={styles.form} aria-busy={busy}><label className={styles.field}>تصویر مدرک خرید<input type="file" name="file" accept="image/png,image/jpeg,image/webp" required disabled={busy} aria-describedby={`proof-help-${reviewId}`}/><small className={styles.muted}>PNG، JPEG یا WebP · حداکثر ۵ مگابایت</small></label><button type="submit" className="btn btn-primary" disabled={busy}>{busy?'در حال ارسال…':'ارسال خصوصی برای بررسی'}</button>{message&&<p role="status" className={styles.notice}>{message}</p>}</form><Link href="/businesses/activity">مشاهدهٔ نتیجه یا پس‌گرفتن مدرک ←</Link></section>
}
