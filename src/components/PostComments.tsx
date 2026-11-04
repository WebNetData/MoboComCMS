'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from '@/components/AppLink'
import { useSession } from 'next-auth/react'
import { useI18n } from '@/i18n/LocaleProvider'
import { useHumanCheck } from '@/components/HumanCheck'

type Reply = { id: number; body: string; createdAt: string; user: { name: string; avatar?: string } }
type Comment = Reply & { replies: Reply[]; deleted?: boolean }
type Listing = { comments: Comment[]; total: number; page: number; pages: number; viewer?: { avatar: string } | null }

const MAX = 2000
/** A steady colour for a name, so the same person keeps the same avatar across comments. */
function hueOf(name: string) {
  let hash = 0
  for (const char of name) hash = (hash * 31 + (char.codePointAt(0) || 0)) % 360
  return hash
}
const Avatar = ({ name, src }: { name: string; src?: string }) => src
  ? <img className="pc-avatar is-photo" src={src} alt="" loading="lazy" />
  : <span className="pc-avatar" style={{ ['--pc-hue' as string]: hueOf(name || '?') }} aria-hidden="true">{(name || '?').trim().slice(0, 1)}</span>
const ReplyIcon = () => <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 14 4 9l5-5" /><path d="M4 9h9a7 7 0 0 1 7 7v4" /></svg>

/** Comments of a magazine article: read by everybody, written by members, shown after moderation. */
export default function PostComments({ slug }: { slug: string }) {
  const { locale } = useI18n()
  const { status, data: session } = useSession()
  const fa = locale === 'fa'
  const L = (en: string, persian: string) => fa ? persian : en
  const human = useHumanCheck('comment', locale)
  const [listing, setListing] = useState<Listing | null>(null)
  const [page, setPage] = useState(1)
  const [body, setBody] = useState('')
  const [reply, setReply] = useState('')
  const [replyTo, setReplyTo] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const endpoint = `/api/blog/${encodeURIComponent(slug)}/comments`
  const signedIn = status === 'authenticated'
  const me = String(session?.user?.name || session?.user?.email || '')
  const num = (value: number) => value.toLocaleString(fa ? 'fa-IR' : 'en-US')

  const load = useCallback(async (nextPage: number) => {
    try {
      const response = await fetch(`${endpoint}?page=${nextPage}`, { cache: 'no-store' })
      if (!response.ok) throw Error()
      setListing(await response.json())
      setError('')
    } catch { setError(fa ? 'دریافت دیدگاه‌ها ممکن نشد.' : 'Could not load comments.') }
  }, [endpoint, fa])

  useEffect(() => { void load(page) }, [load, page])

  /** Sends a new comment, or a reply to `parentId`. Both wait for moderation. */
  async function send(text: string, parentId: number | null) {
    if (busy) return
    setBusy(true); setError(''); setNotice('')
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: text, parentId, humanCheck: human.token }) })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw Error(data?.error || L('Could not submit your comment.', 'ثبت دیدگاه ممکن نشد.'))
      if (parentId) { setReply(''); setReplyTo(null) } else setBody('')
      setNotice(parentId ? L('Your reply was sent for review.', 'پاسخ شما برای بررسی ارسال شد.') : L('Your comment was sent for review.', 'دیدگاه شما برای بررسی ارسال شد.'))
    } catch (cause) { setError(cause instanceof Error ? cause.message : L('Could not submit your comment.', 'ثبت دیدگاه ممکن نشد.')) }
    finally { setBusy(false); human.reset() }
  }

  const date = (value: string) => new Date(value).toLocaleDateString(fa ? 'fa-IR' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  const counter = (length: number) => <small className={`pc-counter${length > MAX - 200 ? ' is-near' : ''}`}>{num(length)} / {num(MAX)}</small>
  const entry = (item: Reply) => <>
    <Avatar name={item.user.name} src={item.user.avatar} />
    <div className="pc-bubble">
      <div className="post-comment-meta"><strong>{item.user.name}</strong><time dateTime={item.createdAt}>{date(item.createdAt)}</time></div>
      <p dir="auto">{item.body}</p>
    </div>
  </>

  return <section className="post-comments pc" aria-labelledby="post-comments-title">
    <div className="post-comments-heading">
      <span className="content-eyebrow">{L('COMMUNITY', 'گفت‌وگو')}</span>
      <h2 id="post-comments-title">{L('Comments', 'دیدگاه‌ها')}{listing ? <span className="pc-total">{num(listing.total)}</span> : null}</h2>
      <p>{L('Share a useful experience or ask a question about this article.', 'تجربه مفیدتان را بنویسید یا درباره این مطلب سؤال کنید.')}</p>
    </div>
    {error && <p className="ticket-alert" role="alert">{error}</p>}
    {notice && <p className="post-comments-notice" role="status"><span aria-hidden="true">✓</span>{notice}</p>}
    {signedIn ? <form className="post-comment-form" onSubmit={(event) => { event.preventDefault(); void send(body, null) }}>
      <Avatar name={me} src={listing?.viewer?.avatar} />
      <div className="pc-compose">
        <label htmlFor="post-comment-body">{L('Your comment', 'دیدگاه شما')}</label>
        <textarea id="post-comment-body" className="input" minLength={2} maxLength={MAX} required rows={4} dir="auto" value={body} onChange={event => setBody(event.target.value)} placeholder={L('Write your comment…', 'دیدگاه خود را بنویسید…')} />
        {human.widget}
        <div className="post-comment-form-foot">
          <small>{L('Comments appear after moderation. Do not share account or subscription details.', 'دیدگاه‌ها پس از تأیید نمایش داده می‌شوند. اطلاعات حساب یا اشتراک را منتشر نکنید.')}</small>
          {counter(body.length)}
          <button className="btn btn-primary" disabled={busy || !human.ready || body.trim().length < 2}>{busy && !replyTo ? L('Sending…', 'در حال ارسال…') : L('Send comment', 'ارسال دیدگاه')}</button>
        </div>
      </div>
    </form> : <div className="post-comments-signin"><span aria-hidden="true">✎</span><p>{L('Sign in to join the conversation.', 'برای شرکت در گفت‌وگو وارد شوید.')}</p><Link className="btn btn-primary btn-sm" href={`/login?next=${encodeURIComponent(`/blog/${slug}`)}`}>{L('Sign in', 'ورود')}</Link></div>}
    <div className="post-comment-list">
      {!listing && !error && <div className="pc-skeleton" role="status" aria-label={L('Loading comments…', 'در حال دریافت دیدگاه‌ها…')}><span /><span /><span /></div>}
      {listing?.comments.length === 0 && <div className="pc-empty"><span aria-hidden="true">✦</span><p>{L('No comments yet. Start the conversation.', 'هنوز دیدگاهی ثبت نشده؛ شما آغاز کنید.')}</p></div>}
      {listing?.comments.map(comment => <article className="post-comment" key={comment.id}>
        {comment.deleted
          ? <p className="pc-deleted">{L('This comment was deleted by its author.', 'این دیدگاه را نویسنده‌اش حذف کرده است.')}</p>
          : <div className="pc-row">{entry(comment)}</div>}
        {signedIn && !comment.deleted && <button type="button" className="post-comment-reply" aria-expanded={replyTo === comment.id} onClick={() => { setReply(''); setReplyTo(replyTo === comment.id ? null : comment.id) }}><ReplyIcon />{replyTo === comment.id ? L('Cancel', 'انصراف') : L('Reply', 'پاسخ')}</button>}
        {replyTo === comment.id && <form className="pc-reply-form" onSubmit={(event) => { event.preventDefault(); void send(reply, comment.id) }}>
          <label className="sr-only" htmlFor={`post-reply-${comment.id}`}>{L(`Reply to ${comment.user.name}`, `پاسخ به ${comment.user.name}`)}</label>
          <textarea id={`post-reply-${comment.id}`} className="input" minLength={2} maxLength={MAX} required rows={3} dir="auto" autoFocus value={reply} onChange={event => setReply(event.target.value)} placeholder={L(`Reply to ${comment.user.name}…`, `پاسخ به ${comment.user.name}…`)} />
          <div className="post-comment-form-foot">{counter(reply.length)}<button className="btn btn-primary btn-sm" disabled={busy || !human.ready || reply.trim().length < 2}>{busy ? L('Sending…', 'در حال ارسال…') : L('Send reply', 'ارسال پاسخ')}</button></div>
        </form>}
        {comment.replies.length > 0 && <div className="pc-replies">{comment.replies.map(item => <div className="post-comment post-comment-child pc-row" key={item.id}>{entry(item)}</div>)}</div>}
      </article>)}
    </div>
    {listing && listing.pages > 1 && <nav className="post-comment-pagination" aria-label={L('Comment pages', 'صفحه‌های دیدگاه')}><button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>{L('Previous', 'قبلی')}</button><span>{num(page)} / {num(listing.pages)}</span><button type="button" disabled={page >= listing.pages} onClick={() => setPage(page + 1)}>{L('Next', 'بعدی')}</button></nav>}
  </section>
}
