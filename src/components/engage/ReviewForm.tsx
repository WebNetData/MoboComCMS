'use client'

import { useRouter } from '@/platform/routing/navigation'
import { useState } from 'react'

type Mine = { rating: number; body: string; status: string } | null
const LABELS = ['', 'ضعیف', 'متوسط', 'خوب', 'خیلی خوب', 'عالی']

/** Star rating + optional text review for the signed-in member (create, edit, delete). */
export default function ReviewForm({ item, mine, loggedIn, title, path }: { item: string; mine: Mine; loggedIn: boolean; title: string; path: string }) {
  const router = useRouter()
  const [rating, setRating] = useState(mine?.rating || 0)
  const [hover, setHover] = useState(0)
  const [body, setBody] = useState(mine?.body || '')
  const [editing, setEditing] = useState(!mine)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)

  if (!loggedIn) {
    return <p className="rv-login"><a href={`/login?next=${encodeURIComponent(`${path}#reviews`)}`} className="btn btn-ghost btn-sm">ورود</a> برای امتیاز دادن و نوشتن نظر دربارهٔ «{title}».</p>
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!rating) { setMessage({ text: 'ابتدا یک تا پنج ستاره انتخاب کنید', error: true }); return }
    setBusy(true); setMessage(null)
    const response = await fetch('/api/engage/review', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ item, rating, body }) }).catch(() => null)
    const data = await response?.json().catch(() => null)
    setBusy(false)
    if (!response?.ok) { setMessage({ text: data?.error || 'ثبت نشد؛ دوباره امتحان کنید', error: true }); return }
    setEditing(false)
    setMessage({ text: data.status === 'PENDING' ? 'امتیاز ثبت شد. متن نظر پس از بررسی نمایش داده می‌شود.' : 'ممنون! نظر شما ثبت شد.', error: false })
    router.refresh()
  }

  async function remove() {
    if (!window.confirm('نظر و امتیاز شما حذف شود؟')) return
    setBusy(true)
    const response = await fetch(`/api/engage/review?item=${encodeURIComponent(item)}`, { method: 'DELETE' }).catch(() => null)
    setBusy(false)
    if (response?.ok) { setRating(0); setBody(''); setEditing(true); setMessage({ text: 'نظر شما حذف شد', error: false }); router.refresh() }
  }

  if (!editing && mine) {
    return (
      <div className="rv-mine">
        <span className="rv-stars" aria-label={`امتیاز شما: ${mine.rating} از ۵`}>{'★'.repeat(mine.rating)}<i>{'★'.repeat(5 - mine.rating)}</i></span>
        <span>امتیاز شما{mine.status === 'PENDING' ? ' · متن در انتظار تأیید' : mine.status === 'REJECTED' ? ' · متن تأیید نشد' : ''}</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>ویرایش</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void remove()} disabled={busy}>حذف</button>
        {message && <p className={message.error ? 'error-text' : 'rv-ok'} role="status">{message.text}</p>}
      </div>
    )
  }

  const shown = hover || rating
  return (
    <form className="rv-form" onSubmit={submit}>
      <fieldset className="rv-picker" onMouseLeave={() => setHover(0)}>
        <legend>امتیاز شما به «{title}»</legend>
        {[1, 2, 3, 4, 5].map((value) => (
          <label key={value} className={value <= shown ? 'is-on' : ''} onMouseEnter={() => setHover(value)}>
            <input type="radio" name="rating" value={value} checked={rating === value} onChange={() => setRating(value)} />
            <span aria-hidden="true">★</span><span className="sr-only">{value} ستاره</span>
          </label>
        ))}
        <output aria-live="polite">{shown ? LABELS[shown] : 'انتخاب کنید'}</output>
      </fieldset>
      <textarea className="input" rows={3} maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} placeholder="تجربهٔ خود را بنویسید (اختیاری): چه چیزی خوب بود؟ چه مشکلی داشت؟" aria-label="متن نظر" dir="auto" />
      {message && <p className={message.error ? 'error-text' : 'rv-ok'} role={message.error ? 'alert' : 'status'}>{message.text}</p>}
      <div className="rv-form-actions">
        <button className="btn btn-primary btn-sm" disabled={busy || !rating}>{busy ? 'در حال ثبت…' : mine ? 'ذخیرهٔ تغییرات' : 'ثبت امتیاز و نظر'}</button>
        {mine && <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setEditing(false); setRating(mine.rating); setBody(mine.body) }}>انصراف</button>}
        <small className="muted">{body.length.toLocaleString('fa-IR')} / ۲٬۰۰۰</small>
      </div>
    </form>
  )
}
