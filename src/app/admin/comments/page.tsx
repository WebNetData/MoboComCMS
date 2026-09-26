'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useI18n } from '@/i18n/LocaleProvider'

type Comment = { id: number; body: string; status: string; createdAt: string; parentId: number | null; post: { slug: string; title: string; titleEn: string }; user: { name: string; email: string } }

export default function AdminCommentsPage() {
  const { locale } = useI18n()
  const fa = locale === 'fa'
  const L = (en: string, persian: string) => fa ? persian : en
  const [status, setStatus] = useState('PENDING')
  const [comments, setComments] = useState<Comment[]>([])
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<number | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/admin/comments?status=${status}&page=${page}`, { cache: 'no-store' })
      if (!response.ok) throw Error()
      const data = await response.json()
      setComments(data.comments)
      setPages(data.pages)
      setTotal(data.total)
      setError('')
    } catch { setError(fa ? 'دریافت دیدگاه‌ها ممکن نشد.' : 'Could not load comments.') }
    finally { setLoading(false) }
  }, [status, page, fa])
  useEffect(() => { void load() }, [load])

  async function moderate(id: number, nextStatus: string) {
    setBusy(id); setError('')
    try {
      const response = await fetch('/api/admin/comments', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status: nextStatus }) })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw Error(data?.error || L('Could not update comment.', 'تغییر وضعیت دیدگاه ممکن نشد.'))
      await load()
    } catch (cause) { setError(cause instanceof Error ? cause.message : L('Could not update comment.', 'تغییر وضعیت دیدگاه ممکن نشد.')) }
    finally { setBusy(null) }
  }

  return <section className="admin-comments"><header><span className="ticket-eyebrow">HAPPVPN / JOURNAL</span><h1>{L('Comment moderation', 'مدیریت دیدگاه‌ها')}</h1><p>{L('Review reader comments before they appear under articles.', 'دیدگاه‌های خوانندگان را پیش از نمایش زیر نوشته‌ها بررسی کنید.')}</p></header>
    <div className="admin-comments-filters" role="group" aria-label={L('Filter comments', 'فیلتر دیدگاه‌ها')}>{[['PENDING', L('Pending', 'در انتظار')], ['APPROVED', L('Approved', 'تأییدشده')], ['REJECTED', L('Rejected', 'ردشده')], ['ALL', L('All', 'همه')]].map(([value, label]) => <button type="button" key={value} className={status === value ? 'is-active' : ''} onClick={() => { setStatus(value); setPage(1) }}>{label}</button>)}</div>
    {error && <p className="ticket-alert" role="alert">{error}</p>}
    {loading ? <p className="muted">{L('Loading…', 'در حال دریافت…')}</p> : comments.length === 0 ? <p className="muted">{L('No comments in this view.', 'دیدگاهی در این بخش نیست.')}</p> : <div className="admin-comments-list">{comments.map(comment => <article key={comment.id} className="admin-comment"><div className="admin-comment-top"><div><strong>{comment.user.name || comment.user.email}</strong><span>{new Date(comment.createdAt).toLocaleString(fa ? 'fa-IR' : 'en-US')}</span></div><span className="badge badge-gray">{comment.status}</span></div><Link href={`/blog/${comment.post.slug}`} target="_blank">{fa ? comment.post.title : comment.post.titleEn || comment.post.title} ↗</Link>{comment.parentId && <small>{L('Reply to', 'پاسخ به')} #{comment.parentId}</small>}<p>{comment.body}</p><div className="admin-comment-actions"><button type="button" disabled={busy === comment.id || comment.status === 'APPROVED'} onClick={() => void moderate(comment.id, 'APPROVED')}>{L('Approve', 'تأیید')}</button><button type="button" disabled={busy === comment.id || comment.status === 'REJECTED'} onClick={() => void moderate(comment.id, 'REJECTED')}>{L('Reject', 'رد')}</button>{comment.status !== 'PENDING' && <button type="button" disabled={busy === comment.id} onClick={() => void moderate(comment.id, 'PENDING')}>{L('Return to review', 'بازگشت به بررسی')}</button>}</div></article>)}</div>}
    {pages > 1 && <div className="post-comment-pagination"><button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>{L('Previous', 'قبلی')}</button><span>{page} / {pages} · {total}</span><button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)}>{L('Next', 'بعدی')}</button></div>}
  </section>
}
