"use client"
import { useState, type FormEvent } from 'react'
import Link from '@/components/AppLink'
import s from './pay-public.module.css'
export default function PayApplication() {
  const [pending, setPending] = useState(false), [message, setMessage] = useState(''), [done, setDone] = useState(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setMessage('')
    const data = new FormData(event.currentTarget)
    try {
      const response = await fetch('/api/pay/merchant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: data.get('name'), website: data.get('website'), note: data.get('note') }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'ثبت درخواست انجام نشد')
      setDone(true); setMessage(result.data?.status === 'PENDING' ? 'درخواست شما در انتظار بررسی است.' : 'وضعیت پذیرندگی شما ثبت شده است. برای مشاهده به پنل پذیرندگان بروید.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'ثبت درخواست انجام نشد') } finally { setPending(false) }
  }
  return done ? <div role="status"><p>{message}</p><Link className={s.primary} href="/pay/merchant">مشاهده وضعیت</Link></div> : <form className={s.form} onSubmit={submit}><label>نام کسب‌وکار<input disabled={pending} name="name" maxLength={100} required /></label><label>نشانی وب‌سایت یا صفحه کسب‌وکار <small>اختیاری، با HTTPS</small><input disabled={pending} name="website" type="url" dir="ltr" maxLength={1000} placeholder="https://" /></label><label>توضیح درباره کسب‌وکار <small>اختیاری</small><textarea disabled={pending} name="note" maxLength={300} rows={4} /></label>{message && <p role="alert">{message}</p>}<button type="submit" className={s.primary} disabled={pending}>{pending ? 'در حال ثبت…' : 'ثبت درخواست'}</button></form>
}
