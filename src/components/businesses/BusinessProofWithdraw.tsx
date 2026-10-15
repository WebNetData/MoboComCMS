'use client'
import { useRef, useState, type FormEvent } from 'react'
import { useRouter } from '@/platform/routing/navigation'
import styles from './BusinessExperience.module.css'
export default function BusinessProofWithdraw({ proofId }: { proofId: number }) {
  const router=useRouter(),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),lock=useRef(false)
  async function withdraw(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();if(lock.current)return;lock.current=true;setBusy(true);setMessage('')
    try { const response=await fetch('/api/businesses',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'proof.withdraw',proofId})}),result=await response.json();if(!response.ok)throw Error(result.error||'عملیات انجام نشد');setMessage('مدرک پس گرفته شد؛ دسترسی به فایل و نشان آن برداشته شد.');router.refresh() }
    catch(error){setMessage(error instanceof Error?error.message:'ارتباط برقرار نشد؛ دوباره تلاش کنید.')}
    finally{lock.current=false;setBusy(false)}
  }
  return <details className={styles.trustDisclosure}><summary>پس‌گرفتن مدرک و حذف فایل</summary><form onSubmit={withdraw} className={styles.trustContent} aria-busy={busy}><label className={styles.check}><input type="checkbox" required disabled={busy}/>می‌دانم فایل حذف می‌شود و نشان مرتبط با این مدرک برداشته می‌شود.</label><button type="submit" className="btn btn-ghost" disabled={busy}>{busy?'در حال انجام…':'تأیید پس‌گرفتن مدرک'}</button>{message&&<p className={styles.notice} role="status">{message}</p>}</form></details>
}
