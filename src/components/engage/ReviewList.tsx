'use client'

import { useEffect, useState } from 'react'

type Review = {
  id: number
  rating: number
  body: string
  createdAt: string
  author: { name: string; color: string }
  mine: boolean
}

/** Pages through the already moderated, publication-gated review API. */
export default function ReviewList({ item, initial, initialTotal, initialPages }: { item: string; initial: Review[]; initialTotal: number; initialPages: number }) {
  const [reviews, setReviews] = useState(initial)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(initialPages)
  const [total, setTotal] = useState(initialTotal)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setReviews(initial)
    setPage(1)
    setPages(initialPages)
    setTotal(initialTotal)
    setError('')
  }, [item, initial, initialPages, initialTotal])

  async function more() {
    if (busy || page >= pages) return
    setBusy(true)
    setError('')
    try {
      const response = await fetch(`/api/engage?item=${encodeURIComponent(item)}&page=${page + 1}`, { cache: 'no-store' })
      if (!response.ok) throw new Error('دریافت نظرهای بیشتر انجام نشد.')
      const data = await response.json()
      if (!Array.isArray(data.reviews)) throw new Error('پاسخ نظرها معتبر نیست.')
      setReviews((current) => {
        const seen = new Set(current.map((review) => review.id))
        return [...current, ...data.reviews.filter((review: Review) => !seen.has(review.id))]
      })
      setPage(data.page)
      setPages(data.pages)
      setTotal(data.total)
    } catch (cause) {
      setError((cause as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return <>
    {reviews.length ? <ul className="rv-list">
      {reviews.map((review) => <li key={review.id} className={review.mine ? 'is-mine' : ''}>
        <span className="rv-avatar" style={{ background: review.author.color }} aria-hidden="true">{review.author.name.slice(0, 1)}</span>
        <div>
          <p className="rv-head"><b>{review.author.name}</b><span className="rv-stars" role="img" aria-label={`${review.rating} از ۵`}>{[1, 2, 3, 4, 5].map((star) => <span key={star} className={review.rating >= star ? 'is-on' : ''} aria-hidden="true">★</span>)}</span><time dateTime={review.createdAt}>{new Date(review.createdAt).toLocaleDateString('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' })}</time></p>
          <p className="rv-body" dir="auto">{review.body}</p>
        </div>
      </li>)}
    </ul> : <p className="muted rv-none">هنوز نظری نوشته نشده است؛ اولین نفر باشید.</p>}
    {error && <p role="alert" className="error-text">{error}</p>}
    {page < pages && <button type="button" className="btn btn-ghost btn-sm rv-more" disabled={busy} onClick={() => void more()}>{busy ? 'در حال دریافت…' : `نمایش نظرهای بیشتر (${Math.max(0, total - reviews.length).toLocaleString('fa-IR')})`}</button>}
  </>
}
