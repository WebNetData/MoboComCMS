'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

type Review = { id: number; rating: number; body: string; status: string; createdAt: string; user: { id: number; name: string; email: string }; item: { key: string; title: string; url: string; label: string } }
type Data = { total: number; page: number; pages: number; pending: number; reviews: Review[] }
const STATUSES = [{ key: 'PENDING', label: 'در انتظار تأیید' }, { key: 'APPROVED', label: 'منتشرشده' }, { key: 'REJECTED', label: 'ردشده' }, { key: 'ALL', label: 'همهٔ نظرهای متنی' }]

/** Moderation queue for item reviews (software, games, films, music). */
export default function AdminReviewsPage() {
  const [status, setStatus] = useState('PENDING')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<Data | null>(null)
  const [busy, setBusy] = useState(0)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)

  const load = useCallback(async () => {
    const response = await fetch(`/api/admin/reviews?status=${status}&page=${page}`, { cache: 'no-store' }).catch(() => null)
    const body = await response?.json().catch(() => null)
    if (response?.ok) setData(body)
    else setMessage({ text: body?.error || 'دریافت اطلاعات ناموفق بود', error: true })
  }, [status, page])
  useEffect(() => { void load() }, [load])

  async function act(id: number, action: 'approve' | 'reject' | 'delete') {
    if (action === 'delete' && !window.confirm('این نظر و امتیاز آن کاملاً حذف شود؟')) return
    setBusy(id); setMessage(null)
    const response = await fetch('/api/admin/reviews', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action }) }).catch(() => null)
    const body = await response?.json().catch(() => null)
    setBusy(0)
    if (!response?.ok) { setMessage({ text: body?.error || 'انجام نشد', error: true }); return }
    setMessage({ text: action === 'approve' ? 'نظر منتشر شد و به نویسنده اطلاع داده شد' : action === 'reject' ? 'نظر رد شد (امتیاز آن هم حساب نمی‌شود)' : 'نظر حذف شد', error: false })
    await load()
  }

  return <div className="xm-page" dir="rtl">
    <header className="tb-hero"><div><span className="tb-eyebrow">REVIEWS</span><h1>امتیازها و نظرهای کاربران</h1><p>امتیاز ستاره‌ای بدون متن فوراً ثبت می‌شود؛ نظرهای متنی (اگر در تنظیمات ماژول فعال باشد) پیش از نمایش اینجا تأیید می‌شوند. نظر ردشده در میانگین امتیاز حساب نمی‌شود.</p></div></header>
    <nav className="tb-tabs" role="tablist" aria-label="وضعیت">
      {STATUSES.map((item) => <button key={item.key} type="button" role="tab" aria-selected={status === item.key} className={status === item.key ? 'is-active' : ''} onClick={() => { setStatus(item.key); setPage(1) }}>{item.label}{item.key === 'PENDING' && data ? <span>{data.pending.toLocaleString('fa-IR')}</span> : null}</button>)}
    </nav>
    {message && <div className={`xm-notice${message.error ? ' is-error' : ''}`} role="status">{message.text}</div>}
    <div className="fa-list">
      {data?.reviews.map((review) => <article key={review.id} className="card fa-flag">
        <header>
          <div><span className="badge">{review.item.label}</span> {review.item.url ? <Link href={review.item.url} target="_blank"><b>{review.item.title}</b></Link> : <b>{review.item.title}</b>}</div>
          <span className="rv-stars" aria-label={`${review.rating} از ۵`}>{'★'.repeat(review.rating)}<i>{'★'.repeat(5 - review.rating)}</i></span>
        </header>
        <p className="fa-excerpt" dir="auto">{review.body || <span className="muted">(فقط امتیاز)</span>}</p>
        <small className="muted">{review.user.name || 'بی‌نام'} · <bdi>{review.user.email}</bdi> · {new Date(review.createdAt).toLocaleString('fa-IR')} · {review.status === 'PENDING' ? 'در انتظار' : review.status === 'APPROVED' ? 'منتشرشده' : 'ردشده'}</small>
        <div className="fa-inline fa-wrap">
          {review.status !== 'APPROVED' && <button type="button" className="btn btn-primary btn-sm" disabled={busy === review.id} onClick={() => void act(review.id, 'approve')}>✓ انتشار</button>}
          {review.status !== 'REJECTED' && <button type="button" className="btn btn-ghost btn-sm" disabled={busy === review.id} onClick={() => void act(review.id, 'reject')}>رد</button>}
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy === review.id} onClick={() => void act(review.id, 'delete')}>حذف</button>
        </div>
      </article>)}
      {data && !data.reviews.length && <div className="tb-empty">{status === 'PENDING' ? 'نظری در انتظار تأیید نیست ✓' : 'موردی نیست.'}</div>}
      {!data && !message && <div className="tb-empty">در حال بارگذاری…</div>}
    </div>
    {data && data.pages > 1 && <div className="fa-inline" style={{ justifyContent: 'center', marginTop: 16 }}>
      <button type="button" className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>قبلی</button>
      <span>صفحهٔ {page.toLocaleString('fa-IR')} از {data.pages.toLocaleString('fa-IR')}</span>
      <button type="button" className="btn btn-ghost btn-sm" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>بعدی</button>
    </div>}
  </div>
}
