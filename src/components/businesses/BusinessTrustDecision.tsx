'use client'
import { useRef, useState, type FormEvent } from 'react'
import styles from './BusinessExperience.module.css'
type Target = { kind: 'report'; id: number; status: string } | { kind: 'proof'; id: number; status: string }
export default function BusinessTrustDecision({ target, onDone }: { target: Target; onDone: () => void }) {
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),lock=useRef(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();if(lock.current)return;lock.current=true;setBusy(true);setMessage('')
    const form=new FormData(event.currentTarget)
    try {
      const body={action:target.kind==='report'?'report.decide':'proof.decide',reportId:target.id,proofId:target.id,expectedStatus:target.status,decision:form.get('decision'),decisionNote:form.get('decisionNote'),hide:form.get('hide')==='on',acknowledgeProof:form.get('acknowledgeProof')==='on'}
      const response=await fetch('/api/admin/businesses',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),result=await response.json()
      if(!response.ok)throw Error(result.error||'تصمیم ذخیره نشد')
      setMessage('نتیجه با موفقیت ثبت شد.');onDone()
    }catch(error){setMessage(error instanceof Error?error.message:'ارتباط برقرار نشد؛ پیش از تکرار وضعیت را بررسی کنید.')}
    finally{lock.current=false;setBusy(false)}
  }
  return <form onSubmit={submit} className={styles.form} aria-busy={busy}><fieldset className={styles.requestFields} disabled={busy}><label className={styles.field}>نتیجهٔ بررسی<select name="decision" required defaultValue=""><option value="" disabled>تصمیم را انتخاب کنید</option>{target.kind==='report'?<><option value="RESOLVED">پذیرش و بستن گزارش</option><option value="DISMISSED">وارد نبودن گزارش</option></>:<>{target.status==='PENDING'&&<option value="APPROVED">تأیید تطبیق مدرک</option>}<option value="REJECTED">{target.status==='APPROVED'?'لغو تأیید مدرک':'تأیید نشدن مدرک'}</option></>}</select></label><label className={styles.field}>دلیل تصمیم · فقط در پیگیری خصوصی<textarea name="decisionNote" required minLength={10} maxLength={1000}/></label>{target.kind==='report'?<label className={styles.check}><input type="checkbox" name="hide"/>همراه پذیرش گزارش، همین نسخهٔ تجربه پنهان شود.</label>:target.status==='PENDING'&&<label className={styles.check}><input type="checkbox" name="acknowledgeProof"/>تصویر را مشاهده و ارتباط خرید با کسب‌وکار و تجربه را بررسی کرده‌ام.</label>}<button className="btn btn-primary" type="submit">{busy?'در حال ثبت…':'ثبت تصمیم مستقل'}</button></fieldset>{message&&<p role="status" className={styles.notice}>{message}</p>}</form>
}
