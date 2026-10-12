'use client'

import { useRouter } from '@/platform/routing/navigation'
import { useState } from 'react'
import { EXPERIENCE_LABEL, isExperienceKind, suggestedRating, type ReviewScores } from '@/modules/reviews/domain/dimensions'

type Mine = { rating: number; body: string; status: string; verified?: string; scores?: ReviewScores } | null
type Dimension = { key: string; label: string; hint: string }
const LABELS = ['', 'ضعیف', 'متوسط', 'خوب', 'خیلی خوب', 'عالی']

/** Star rating, optional per-type dimension scores and optional text review for the signed-in member (create, edit, delete). */
export default function ReviewForm({ item, mine, loggedIn, title, path, dimensions = [], experience = '', badgeHint = '', startEditing = false, onDone }: { item: string; mine: Mine; loggedIn: boolean; title: string; path: string; dimensions?: Dimension[]; experience?: string; badgeHint?: string; /** Open the editor for an existing review (account list). */ startEditing?: boolean; /** Called when the editor is left: saved, cancelled or deleted. */ onDone?: () => void }) {
  const router = useRouter()
  const [rating, setRating] = useState(mine?.rating || 0)
  const [hover, setHover] = useState(0)
  const [body, setBody] = useState(mine?.body || '')
  const [scores, setScores] = useState<ReviewScores>(mine?.scores || {})
  // Until the member picks the stars themselves, they follow the dimension scores.
  const [ratingChosen, setRatingChosen] = useState(!!mine)
  const [editing, setEditing] = useState(!mine || startEditing)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)

  if (!loggedIn) {
    return <div className="rv-login">
      <span className="rv-login-art" aria-hidden="true">★</span>
      <p><b>نظر شما چیست؟</b>برای امتیاز دادن و نوشتن نظر دربارهٔ «{title}» وارد شوید.</p>
      <a href={`/login?next=${encodeURIComponent(`${path}#reviews`)}`} className="btn btn-primary btn-sm">ورود و ثبت نظر</a>
    </div>
  }

  function score(key: string, value: number) {
    const next = { ...scores }
    if (value) next[key] = value
    else delete next[key]
    setScores(next)
    if (!ratingChosen) setRating(suggestedRating(next) || 0)
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!rating) { setMessage({ text: 'ابتدا یک تا پنج ستاره انتخاب کنید', error: true }); return }
    setBusy(true); setMessage(null)
    const response = await fetch('/api/engage/review', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ item, rating, body, ...(dimensions.length ? { scores } : {}) }) }).catch(() => null)
    const data = await response?.json().catch(() => null)
    setBusy(false)
    if (!response?.ok) { setMessage({ text: data?.error || 'ثبت نشد؛ دوباره امتحان کنید', error: true }); return }
    setEditing(false)
    setRatingChosen(true)
    setMessage({ text: data.status === 'PENDING' ? 'امتیاز ثبت شد. متن نظر پس از بررسی نمایش داده می‌شود.' : 'ممنون! نظر شما ثبت شد.', error: false })
    router.refresh()
    onDone?.()
  }

  async function remove() {
    if (!window.confirm('نظر و امتیاز شما حذف شود؟')) return
    setBusy(true)
    const response = await fetch(`/api/engage/review?item=${encodeURIComponent(item)}`, { method: 'DELETE' }).catch(() => null)
    setBusy(false)
    if (response?.ok) { setRating(0); setBody(''); setScores({}); setRatingChosen(false); setEditing(true); setMessage({ text: 'نظر شما حذف شد', error: false }); router.refresh() }
  }

  const badge = isExperienceKind(mine?.verified) ? mine.verified : isExperienceKind(experience) ? experience : null

  if (!editing && mine) {
    return (
      <div className="rv-mine">
        <p className="rv-mine-title">امتیاز شما{mine.status === 'PENDING' && <span className="rv-state is-wait">متن در انتظار تأیید</span>}{mine.status === 'REJECTED' && <span className="rv-state is-no">متن تأیید نشد</span>}</p>
        <span className="rv-stars" aria-label={`امتیاز شما: ${mine.rating} از ۵`}>{'★'.repeat(mine.rating)}<i>{'★'.repeat(5 - mine.rating)}</i></span>
        {badge && <span className="rv-badge">✓ {EXPERIENCE_LABEL[badge].label}</span>}
        <span className="rv-mine-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>ویرایش</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void remove()} disabled={busy}>حذف</button>
        </span>
        {message && <p className={message.error ? 'error-text' : 'rv-ok'} role="status">{message.text}</p>}
      </div>
    )
  }

  const shown = hover || rating
  const scored = Object.keys(scores).length
  return (
    <form className="rv-form" onSubmit={submit}>
      <fieldset className="rv-picker" onMouseLeave={() => setHover(0)}>
        <legend>امتیاز شما به «{title}»</legend>
        {[1, 2, 3, 4, 5].map((value) => (
          <label key={value} className={value <= shown ? 'is-on' : ''} onMouseEnter={() => setHover(value)}>
            <input type="radio" name="rating" value={value} checked={rating === value} onChange={() => { setRating(value); setRatingChosen(true) }} />
            <span aria-hidden="true">★</span><span className="sr-only">{value} ستاره</span>
          </label>
        ))}
        <output aria-live="polite" className={shown ? 'is-set' : ''}>{shown ? LABELS[shown] : 'انتخاب کنید'}</output>
      </fieldset>
      {dimensions.length > 0 && <details className="rv-dims-edit" open={scored > 0 || undefined}>
        <summary>امتیاز تخصصی <small>(اختیاری{scored ? ` · ${scored.toLocaleString('fa-IR')} از ${dimensions.length.toLocaleString('fa-IR')}` : ''})</small></summary>
        <div>
          {dimensions.map((dimension) => (
            <div key={dimension.key} className="rv-dim" role="radiogroup" aria-label={`${dimension.label}: ${dimension.hint}`}>
              <span className="rv-dim-name">{dimension.label}<small>{dimension.hint}</small></span>
              <span className="rv-dim-stars">
                {[1, 2, 3, 4, 5].map((value) => (
                  <label key={value} className={value <= (scores[dimension.key] || 0) ? 'is-on' : ''}>
                    <input type="radio" name={`score-${dimension.key}`} value={value} checked={scores[dimension.key] === value} onChange={() => score(dimension.key, value)} />
                    <span aria-hidden="true">★</span><span className="sr-only">{dimension.label}: {value} از ۵</span>
                  </label>
                ))}
              </span>
              <button type="button" onClick={() => score(dimension.key, 0)} disabled={!scores[dimension.key]} aria-label={`پاک کردن امتیاز ${dimension.label}`}>پاک</button>
            </div>
          ))}
        </div>
      </details>}
      <textarea className="input" rows={3} maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} placeholder="تجربهٔ خود را بنویسید (اختیاری): چه چیزی خوب بود؟ چه مشکلی داشت؟" aria-label="متن نظر" dir="auto" />
      {badge
        ? <p className="rv-experience"><span className="rv-badge">✓ {EXPERIENCE_LABEL[badge].label}</span> نظر شما با این نشان نمایش داده می‌شود.</p>
        : badgeHint && <p className="rv-experience">نشان «تجربهٔ تأییدشده» پس از {badgeHint} در موبوکام به نظر شما افزوده می‌شود.</p>}
      {message && <p className={message.error ? 'error-text' : 'rv-ok'} role={message.error ? 'alert' : 'status'}>{message.text}</p>}
      <div className="rv-form-actions">
        <button className="btn btn-primary btn-sm" disabled={busy || !rating}>{busy ? 'در حال ثبت…' : mine ? 'ذخیرهٔ تغییرات' : 'ثبت امتیاز و نظر'}</button>
        {mine && <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setEditing(false); setRating(mine.rating); setBody(mine.body); setScores(mine.scores || {}); onDone?.() }}>انصراف</button>}
        <small className={`rv-counter${body.length > 1800 ? ' is-near' : ''}`}>{body.length.toLocaleString('fa-IR')} / ۲٬۰۰۰</small>
      </div>
    </form>
  )
}
