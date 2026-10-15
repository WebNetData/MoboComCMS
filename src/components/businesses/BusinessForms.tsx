'use client'

import { useRef, useState, type FormEvent } from 'react'
import { useRouter } from '@/platform/routing/navigation'
import Link from '@/components/AppLink'
import styles from './BusinessExperience.module.css'
import { RATING_LABELS } from '@/components/engage/RatingMeter'
import { dimensionsFor } from '@/modules/reviews/domain/dimensions'

async function send(body: Record<string, unknown>) {
  const response = await fetch('/api/businesses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const result = await response.json()
  if (!response.ok) throw Error(result.error || 'عملیات انجام نشد')
  return result
}

export function BusinessReviewForm({ businessId, kind, loggedIn, canReply, orders, mine, today }: { businessId: number; kind: string; loggedIn: boolean; canReply: boolean; orders: { id: number }[]; today: string; mine: { rating: number; body: string; status: string; experiencedOn?: string | null; scores?: Record<string, number> } | null }) {
  const router = useRouter(), locked = useRef(false)
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('')
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (locked.current) return
    locked.current = true; setBusy(true); setMessage('')
    const form = new FormData(event.currentTarget)
    try {
      const scores = kind === 'SELLER' ? undefined : Object.fromEntries(dimensionsFor('business').flatMap(dimension => { const value = form.get(`score-${dimension.key}`); return value ? [[dimension.key, Number(value)]] : [] }))
      const result = await send({ action: 'review', businessId, rating: Number(form.get('rating')), body: form.get('body'), scores, experiencedOn: kind === 'SELLER' ? undefined : form.get('experiencedOn') || '', orderId: form.get('orderId') || undefined })
      setMessage(result.status === 'PENDING' ? 'تجربهٔ شما ثبت شد و پس از بررسی نمایش داده می‌شود.' : 'تجربهٔ شما منتشر شد.'); router.refresh()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'ارتباط برقرار نشد؛ پیش از تکرار، وضعیت تجربه را بررسی کنید.') }
    finally { locked.current = false; setBusy(false) }
  }
  return <section className={styles.panel} id="write-experience" aria-labelledby="experience-form-title">
    <h2 id="experience-form-title">تجربهٔ شما ارزشمند است</h2>
    {!loggedIn ? <p className={styles.muted}>برای ثبت تجربه <Link href="/login">وارد حساب خود شوید</Link>.</p> : canReply ? <p className={styles.muted}>شما نمایندهٔ این کسب‌وکار هستید و می‌توانید به تجربه‌های منتشرشده پاسخ دهید.</p> : kind === 'SELLER' && !orders.length ? <p className={styles.muted}>پس از تحویل سفارش از این فروشنده می‌توانید تجربهٔ خرید را ثبت کنید. تجربهٔ سفارش‌های قبلی شما حفظ شده است.</p> : <form onSubmit={submit} className={styles.form} aria-busy={busy}>
      {mine && <p className={styles.notice}>{mine.status === 'PENDING' ? 'تجربهٔ قبلی در انتظار بررسی است.' : 'با ارسال این فرم، تجربهٔ قبلی شما به‌روزرسانی می‌شود.'}</p>}
      <fieldset disabled={busy}><legend>امتیاز کلی شما</legend><div className="rv-picker">{[1, 2, 3, 4, 5].map(rating => <label key={rating} className={`tone-${rating}`}><input type="radio" name="rating" value={rating} defaultChecked={rating === (mine?.rating || 5)} required /><b aria-hidden="true">{rating.toLocaleString('fa-IR')}</b><span>{RATING_LABELS[rating]}</span><span className="sr-only"> ({rating.toLocaleString('fa-IR')} از ۵)</span></label>)}</div></fieldset>
      {kind !== 'SELLER' && <details className={styles.dimensionPicker}><summary>امتیازهای جزئی <span className={styles.muted}>اختیاری</span></summary><div className={styles.dimensionFields}>{dimensionsFor('business').map(dimension => <label key={dimension.key} className={styles.field}>{dimension.label}<select name={`score-${dimension.key}`} defaultValue={mine?.scores?.[dimension.key] || ''} disabled={busy}><option value="">تجربه‌ای ندارم</option>{[5, 4, 3, 2, 1].map(rating => <option key={rating} value={rating}>{rating.toLocaleString('fa-IR')} · {RATING_LABELS[rating]}</option>)}</select></label>)}</div></details>}
      {kind === 'SELLER' ? <label className={styles.field}>سفارش تحویل‌شده<select name="orderId" required disabled={busy}>{orders.map(order => <option key={order.id} value={order.id}>سفارش {order.id.toLocaleString('fa-IR')}</option>)}</select></label> : <label className={styles.field}>تاریخ تجربه <span className={styles.muted}>اختیاری</span><input name="experiencedOn" type="date" max={today} defaultValue={mine?.experiencedOn || ''} disabled={busy} /></label>}
      <label className={styles.field}>چه تجربه‌ای داشتید؟<textarea name="body" required minLength={10} maxLength={2000} defaultValue={mine?.body || ''} disabled={busy} placeholder="از کیفیت خرید، تحویل یا برخورد پشتیبانی بنویسید…" /></label>
      <p className={styles.muted}>امتیاز عمومی از تجربه‌های منتشرشده محاسبه می‌شود. برای سایت‌های بیرونی، ثبت تجربه به‌تنهایی اثبات خرید نیست.</p>
      <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'در حال ثبت…' : mine ? 'به‌روزرسانی تجربه' : 'ثبت تجربهٔ خرید'}</button>
    </form>}
    {message && <p className={styles.notice} role="status">{message}</p>}
  </section>
}

export function BusinessReplyForm({ businessId, reviewId }: { businessId: number; reviewId: number }) {
  const router = useRouter(), lock = useRef(false), [busy, setBusy] = useState(false), [message, setMessage] = useState('')
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (lock.current) return
    lock.current = true; setBusy(true)
    const body = new FormData(event.currentTarget)
    try { await send({ action: 'reply', businessId, reviewId, reply: body.get('reply') }); setMessage('پاسخ ذخیره شد.'); router.refresh() }
    catch (error) { setMessage(error instanceof Error ? error.message : 'ذخیرهٔ پاسخ انجام نشد.') }
    finally { lock.current = false; setBusy(false) }
  }
  return <details className={styles.replyForm}><summary>پاسخ کسب‌وکار به این تجربه</summary><form onSubmit={submit} aria-busy={busy}><label className={styles.field}>متن پاسخ<textarea name="reply" required minLength={10} maxLength={600} disabled={busy} /></label><button className="btn btn-ghost" type="submit" disabled={busy}>{busy ? 'در حال ذخیره…' : 'ثبت پاسخ'}</button>{message && <p className={styles.notice} role="status">{message}</p>}</form></details>
}

export function BusinessHelpful({ reviewId, count, on }: { reviewId: number; count: number; on: boolean }) {
  const [value, setValue] = useState({ count, on }), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), lock = useRef(false)
  async function vote() {
    if (lock.current) return
    lock.current = true; setBusy(true)
    try { const response = await fetch('/api/engage/review/helpful', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reviewId, on: !value.on }) }); const result = await response.json(); if (!response.ok) throw Error(result.error || 'رأی ثبت نشد'); setValue({ on: result.on, count: result.count }); setMessage('') }
    catch (error) { setMessage(error instanceof Error ? error.message : 'رأی ثبت نشد') }
    finally { lock.current = false; setBusy(false) }
  }
  return <><button className={styles.helpful} type="button" aria-pressed={value.on} disabled={busy} onClick={() => void vote()}>مفید بود · {value.count.toLocaleString('fa-IR')}</button>{message && <p className={styles.muted} role="status">{message}</p>}</>
}
