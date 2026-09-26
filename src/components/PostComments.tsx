'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useI18n } from '@/i18n/LocaleProvider'

type Reply = { id: number; body: string; createdAt: string; user: { name: string } }
type Comment = Reply & { replies: Reply[] }
type Listing = { comments: Comment[]; total: number; page: number; pages: number }

export default function PostComments({ slug }: { slug: string }) {
  const { locale } = useI18n()
  const { status } = useSession()
  const fa = locale === 'fa'
  const L = (en: string, persian: string) => fa ? persian : en
  const [listing, setListing] = useState<Listing | null>(null)
  const [page, setPage] = useState(1)
  const [body, setBody] = useState('')
  const [replyTo, setReplyTo] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const endpoint = `/api/blog/${encodeURIComponent(slug)}/comments`

  const load = useCallback(async (nextPage: number) => {
    try {
      const response = await fetch(`${endpoint}?page=${nextPage}`, { cache: 'no-store' })
      if (!response.ok) throw Error()
      setListing(await response.json())
      setError('')
    } catch { setError(fa ? 'دریافت دیدگاه‌ها ممکن نشد.' : 'Could not load comments.') }
  }, [endpoint, fa])

  useEffect(() => { void load(page) }, [load, page])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true); setError(''); setNotice('')
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body, parentId: replyTo }) })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw Error(data?.error || L('Could not submit your comment.', 'ثبت دیدگاه ممکن نشد.'))
      setBody(''); setReplyTo(null)
      setNotice(L('Your comment was sent for review.', 'دیدگاه شما برای بررسی ارسال شد.'))
    } catch (cause) { setError(cause instanceof Error ? cause.message : L('Could not submit your comment.', 'ثبت دیدگاه ممکن نشد.')) }
    finally { setBusy(false) }
  }

  const date = (value: string) => new Date(value).toLocaleDateString(fa ? 'fa-IR' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  return <section className="post-comments" aria-labelledby="post-comments-title">
    <div className="post-comments-heading"><span className="content-eyebrow">{L('COMMUNITY', 'گفت‌وگو')}</span><h2 id="post-comments-title">{L('Comments', 'دیدگاه‌ها')}{listing ? ` (${listing.total})` : ''}</h2><p>{L('Share a useful experience or ask a question about this article.', 'تجربه مفیدتان را بنویسید یا درباره این مطلب سؤال کنید.')}</p></div>
    {error && <p className="ticket-alert" role="alert">{error}</p>}
    {notice && <p className="post-comments-notice" role="status">{notice}</p>}
    {status === 'authenticated' ? <form className="post-comment-form" onSubmit={submit}>
      {replyTo && <div className="post-comment-replying">{L('Replying to a comment', 'در حال پاسخ به دیدگاه')} #{replyTo}<button type="button" onClick={() => setReplyTo(null)}>{L('Cancel', 'انصراف')}</button></div>}
      <label htmlFor="post-comment-body">{L('Your comment', 'دیدگاه شما')}</label>
      <textarea id="post-comment-body" className="input" minLength={2} maxLength={2000} required rows={5} value={body} onChange={event => setBody(event.target.value)} placeholder={L('Write your comment…', 'دیدگاه خود را بنویسید…')} />
      <div className="post-comment-form-foot"><small>{L('Comments appear after moderation. Do not share account or subscription details.', 'دیدگاه‌ها پس از تأیید نمایش داده می‌شوند. اطلاعات حساب یا اشتراک را منتشر نکنید.')}</small><button className="btn btn-primary" disabled={busy}>{busy ? L('Sending…', 'در حال ارسال…') : L('Send comment', 'ارسال دیدگاه')}</button></div>
    </form> : <p className="post-comments-signin">{L('Sign in to join the conversation.', 'برای شرکت در گفت‌وگو وارد شوید.')} <Link href={`/login?next=${encodeURIComponent(`/blog/${slug}`)}`}>{L('Sign in', 'ورود')}</Link></p>}
    <div className="post-comment-list">{!listing && !error && <p className="muted">{L('Loading comments…', 'در حال دریافت دیدگاه‌ها…')}</p>}{listing?.comments.length === 0 && <p className="muted">{L('No comments yet. Start the conversation.', 'هنوز دیدگاهی ثبت نشده؛ شما آغاز کنید.')}</p>}{listing?.comments.map(comment => <article className="post-comment" key={comment.id}><div className="post-comment-meta"><strong>{comment.user.name}</strong><time>{date(comment.createdAt)}</time></div><p>{comment.body}</p>{status === 'authenticated' && <button type="button" className="post-comment-reply" onClick={() => { setReplyTo(comment.id); document.getElementById('post-comment-body')?.focus() }}>{L('Reply', 'پاسخ')}</button>}{comment.replies.map(reply => <div className="post-comment post-comment-child" key={reply.id}><div className="post-comment-meta"><strong>{reply.user.name}</strong><time>{date(reply.createdAt)}</time></div><p>{reply.body}</p></div>)}</article>)}</div>
    {listing && listing.pages > 1 && <div className="post-comment-pagination"><button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>{L('Previous', 'قبلی')}</button><span>{page} / {listing.pages}</span><button type="button" disabled={page >= listing.pages} onClick={() => setPage(page + 1)}>{L('Next', 'بعدی')}</button></div>}
  </section>
}
