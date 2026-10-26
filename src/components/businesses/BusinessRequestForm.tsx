'use client'

import { useRef, useState, type FormEvent } from 'react'
import Link from '@/components/AppLink'
import { useRouter } from '@/platform/routing/navigation'
import styles from './BusinessExperience.module.css'

/** `categories`: the owner's active fields of activity, offered for a suggested business. */
export default function BusinessRequestForm({ loggedIn, businessId, categories = [] }: { loggedIn: boolean; businessId?: number; categories?: string[] }) {
  const claim = !!businessId, lock = useRef(false), router = useRouter()
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [sent, setSent] = useState(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (lock.current) return
    const form = new FormData(event.currentTarget)
    lock.current = true; setBusy(true); setMessage('')
    try {
      const response = await fetch('/api/businesses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'request', kind: claim ? 'CLAIM' : 'SUGGESTION', businessId, name: form.get('name'), website: form.get('website'), category: form.get('category'), note: form.get('note') }) })
      const result = await response.json()
      if (!response.ok) throw Error(result.error || 'درخواست ثبت نشد')
      setSent(true); setMessage('درخواست ثبت شد. نتیجهٔ بررسی در «درخواست‌های من» نمایش داده می‌شود.'); router.refresh()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'ارتباط برقرار نشد؛ وضعیت درخواست را پیش از تکرار بررسی کنید.') }
    finally { lock.current = false; setBusy(false) }
  }
  return <details className={styles.requestBox} id={claim ? 'claim-business' : 'suggest-business'}>
    <summary>{claim ? 'نمایندهٔ این کسب‌وکار هستید؟' : 'کسب‌وکار مورد نظرتان در فهرست نیست؟'}<span>{claim ? 'درخواست نمایندگی' : 'معرفی کسب‌وکار جدید'} <span aria-hidden="true">↗</span></span></summary>
    <div className={styles.requestContent}>
      <p className={styles.muted}>{claim ? 'پس از بررسی ارتباط حساب شما با کسب‌وکار توسط مدیریت، امکان پاسخ رسمی فعال می‌شود. ثبت درخواست به معنی تأیید نمایندگی نیست.' : 'نام و نشانی سایت را معرفی کنید؛ پس از بررسی مدیریت، صفحهٔ عمومی کسب‌وکار ساخته می‌شود.'} اطلاعات بانکی، رمز، شمارهٔ سفارش و مدارک شخصی را اینجا ننویسید.</p>
      {!loggedIn ? <p>برای ثبت درخواست <Link href="/login">وارد حساب خود شوید</Link>.</p> : sent ? <Link href="/businesses/activity" className="btn btn-ghost">پیگیری درخواست</Link> : <form className={styles.form} onSubmit={submit} aria-busy={busy}>
        <fieldset disabled={busy} className={styles.requestFields}><legend className="sr-only">{claim ? 'اطلاعات نمایندگی' : 'اطلاعات کسب‌وکار پیشنهادی'}</legend>
          {!claim && <><label className={styles.field}>نام کسب‌وکار<input name="name" required minLength={2} maxLength={120} autoComplete="organization" /></label><label className={styles.field}>نشانی وب‌سایت<input name="website" required maxLength={2048} dir="ltr" placeholder="example.com" inputMode="url" /></label><label className={styles.field}>زمینهٔ فعالیت <small>اختیاری</small><select name="category" defaultValue=""><option value="">— انتخاب کنید —</option>{categories.map((name) => <option key={name} value={name}>{name}</option>)}</select></label></>}
          <label className={styles.field}>{claim ? 'سمت و ارتباط شما با کسب‌وکار' : 'چرا این کسب‌وکار را پیشنهاد می‌دهید؟'}<textarea name="note" required minLength={20} maxLength={1000} /></label>
          <button className="btn btn-primary" type="submit">{busy ? 'در حال ثبت…' : claim ? 'ارسال درخواست بررسی نمایندگی' : 'ارسال پیشنهاد'}</button>
        </fieldset>
      </form>}
      {message && <p className={styles.notice} role="status">{message}</p>}
    </div>
  </details>
}
