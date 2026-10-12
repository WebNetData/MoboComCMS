'use client'

import { useEffect, useState } from 'react'
import { EXPERIENCE_LABEL, isExperienceKind, type ReviewSort } from '@/modules/reviews/domain/dimensions'
import { RatingChip, RatingMeter } from '@/components/engage/RatingMeter'

type Review = {
  id: number
  rating: number
  body: string
  createdAt: string
  author: { name: string; color: string }
  mine: boolean
  helpfulCount: number
  helpfulByMe: boolean
  verified?: string
  scores?: Record<string, number>
}
const SORTS: { key: ReviewSort; label: string }[] = [{ key: 'new', label: 'تازه‌ترین' }, { key: 'helpful', label: 'مفیدترین' }, { key: 'high', label: 'بیشترین امتیاز' }, { key: 'low', label: 'کمترین امتیاز' }]
/** A review longer than this is folded; its reader opens it. */
const FOLD_AT = 420

const ThumbIcon = () => <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 10v11H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h3Zm0 0 4.2-7.3a1.6 1.6 0 0 1 3 .9L13.5 8H19a2 2 0 0 1 2 2.3l-1.2 8A2 2 0 0 1 17.8 20H7" /></svg>

/** Pages through the already moderated, publication-gated review API. */
export default function ReviewList({ item, initial, initialTotal, initialPages, loggedIn, dimensions = [], verifiedCount = 0 }: { item: string; initial: Review[]; initialTotal: number; initialPages: number; loggedIn: boolean; dimensions?: { key: string; label: string }[]; verifiedCount?: number }) {
  const [reviews, setReviews] = useState(initial)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(initialPages)
  const [total, setTotal] = useState(initialTotal)
  const [sort, setSort] = useState<ReviewSort>('new')
  const [verifiedOnly, setVerifiedOnly] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [busyReview, setBusyReview] = useState(0)
  const [opened, setOpened] = useState<number[]>([])

  useEffect(() => {
    setReviews(initial)
    setPage(1)
    setPages(initialPages)
    setTotal(initialTotal)
    setSort('new')
    setVerifiedOnly(false)
    setError('')
    setOpened([])
  }, [item, initial, initialPages, initialTotal])

  /** Page 1 replaces the list (new order or filter); later pages are appended. */
  async function load(nextPage: number, nextSort: ReviewSort, nextVerified: boolean) {
    if (busy) return
    const previous = { sort, verifiedOnly }
    setBusy(true)
    setError('')
    // The controls answer at once; they go back if the request fails.
    setSort(nextSort)
    setVerifiedOnly(nextVerified)
    try {
      const response = await fetch(`/api/engage?item=${encodeURIComponent(item)}&page=${nextPage}&sort=${nextSort}${nextVerified ? '&verified=1' : ''}`, { cache: 'no-store' })
      if (!response.ok) throw new Error('دریافت نظرها انجام نشد.')
      const data = await response.json()
      if (!Array.isArray(data.reviews)) throw new Error('پاسخ نظرها معتبر نیست.')
      setReviews((current) => {
        if (nextPage === 1) return data.reviews
        const seen = new Set(current.map((review) => review.id))
        return [...current, ...data.reviews.filter((review: Review) => !seen.has(review.id))]
      })
      setPage(data.page)
      setPages(data.pages)
      setTotal(data.total)
    } catch (cause) {
      setSort(previous.sort)
      setVerifiedOnly(previous.verifiedOnly)
      setError((cause as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function helpful(review: Review) {
    if (!loggedIn || review.mine || busyReview) return
    setBusyReview(review.id)
    setError('')
    try {
      const response = await fetch('/api/engage/review/helpful', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reviewId: review.id, on: !review.helpfulByMe }) })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || 'ثبت رأی انجام نشد.')
      setReviews((current) => current.map((entry) => entry.id === review.id ? { ...entry, helpfulByMe: data.on, helpfulCount: data.count } : entry))
    } catch (cause) {
      setError((cause as Error).message)
    } finally {
      setBusyReview(0)
    }
  }

  const showTools = initialTotal > 1 || verifiedOnly
  return <div className="rv-feed">
    {showTools && <div className="rv-tools">
      <div className="rv-seg" role="group" aria-label="ترتیب نظرها">
        {SORTS.map((option) => <button key={option.key} type="button" aria-pressed={sort === option.key} disabled={busy} onClick={() => { if (sort !== option.key) void load(1, option.key, verifiedOnly) }}>{option.label}</button>)}
      </div>
      {(verifiedCount > 0 || verifiedOnly) && <label className="rv-switch"><input type="checkbox" checked={verifiedOnly} disabled={busy} onChange={(event) => void load(1, sort, event.target.checked)} /><span aria-hidden="true" />فقط تجربهٔ تأییدشده</label>}
      <span className="rv-count" role="status">{busy ? 'در حال دریافت…' : `${total.toLocaleString('fa-IR')} نظر`}</span>
    </div>}
    {reviews.length ? <ul className={`rv-list${busy ? ' is-loading' : ''}`} aria-busy={busy}>
      {reviews.map((review) => {
        const scores = dimensions.filter((dimension) => review.scores?.[dimension.key])
        const long = review.body.length > FOLD_AT
        const open = opened.includes(review.id)
        return <li key={review.id} className={review.mine ? 'is-mine' : ''}>
          <span className="rv-avatar" style={{ background: review.author.color }} aria-hidden="true">{review.author.name.slice(0, 1)}</span>
          <div className="rv-entry">
            <p className="rv-head">
              <b>{review.author.name}</b>
              {review.mine && <span className="rv-you">نظر شما</span>}
              {isExperienceKind(review.verified) && <span className="rv-badge" title="بر پایهٔ سابقهٔ خود موبوکام">✓ {EXPERIENCE_LABEL[review.verified].label}</span>}
              <time dateTime={review.createdAt}>{new Date(review.createdAt).toLocaleDateString('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' })}</time>
            </p>
            <p className="rv-rate"><RatingChip value={review.rating} /><RatingMeter size="sm" value={review.rating} label={`${review.rating} از ۵`} /></p>
            {review.body && <p className={`rv-body${long && !open ? ' is-folded' : ''}`} dir="auto" id={`rv-body-${review.id}`}>{review.body}</p>}
            {long && <button type="button" className="rv-fold" aria-expanded={open} aria-controls={`rv-body-${review.id}`} onClick={() => setOpened((current) => open ? current.filter((id) => id !== review.id) : [...current, review.id])}>{open ? 'بستن' : 'ادامهٔ نظر'}</button>}
            {scores.length > 0 && <ul className="rv-scores" aria-label="امتیازهای تخصصی">{scores.map((dimension) => <li key={dimension.key}>{dimension.label} <b>{review.scores![dimension.key].toLocaleString('fa-IR')}</b></li>)}</ul>}
            <button type="button" className="rv-helpful" aria-pressed={review.helpfulByMe} disabled={!loggedIn || review.mine || busyReview === review.id} title={!loggedIn ? 'برای رأی دادن وارد شوید' : review.mine ? 'به نظر خودتان نمی‌توانید رأی دهید' : undefined} onClick={() => void helpful(review)}><ThumbIcon />مفید بود · {review.helpfulCount.toLocaleString('fa-IR')}</button>
          </div>
        </li>
      })}
    </ul> : <div className="rv-none"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" /><path d="M9 11h6M9 14h4" /></svg><p>{verifiedOnly ? 'هنوز نظری با تجربهٔ تأییدشده ثبت نشده است.' : 'هنوز نظری نوشته نشده است؛ اولین نفر باشید.'}</p></div>}
    {error && <p role="alert" className="error-text">{error}</p>}
    {page < pages && <button type="button" className="btn btn-ghost btn-sm rv-more" disabled={busy} onClick={() => void load(page + 1, sort, verifiedOnly)}>{busy ? 'در حال دریافت…' : `نمایش نظرهای بیشتر (${Math.max(0, total - reviews.length).toLocaleString('fa-IR')})`}</button>}
  </div>
}
