'use client'

import Link from '@/components/AppLink'
import { useRouter } from '@/platform/routing/navigation'
import { useEffect, useState } from 'react'
import Composer from '@/components/forum/Composer'

type Author = { id: number; username: string; name: string; avatar: string; avatarColor: string; staff: boolean; left?: boolean }
export type ConversationData = {
  id: number; title: string; archived: boolean; page: number; pages: number; total: number; lastRead: number
  participants: Author[]
  messages: { id: number; number: number; createdAt: string; author: Author; own: boolean; html: string }[]
}

const fa = (n: number) => n.toLocaleString('fa-IR')

function Avatar({ author, size = 40 }: { author: Pick<Author, 'name' | 'avatar' | 'avatarColor'>; size?: number }) {
  if (author.avatar) return <img className="fx-avatar" src={author.avatar} alt="" width={size} height={size} style={{ width: size, height: size }} />
  return <span className="fx-avatar" style={{ width: size, height: size, fontSize: Math.round(size * 0.42), background: author.avatarColor }} aria-hidden="true">{author.name.trim().slice(0, 1)}</span>
}

async function send(url: string, method: string, body: unknown) {
  const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null)
  const data = await response?.json().catch(() => null)
  return { ok: !!response?.ok, data: response?.ok ? data : { error: data?.error || 'انجام نشد؛ دوباره تلاش کنید' } }
}

/** New personal message: recipients, subject and body. */
export function NewMessage({ to: initialTo = '' }: { to?: string }) {
  const router = useRouter()
  const [to, setTo] = useState(initialTo)
  const [title, setTitle] = useState('')
  return <div className="fx-pm-new">
    <div className="fx-pm-fields">
      <label className="fx-field"><span>گیرندگان</span><input className="input" dir="ltr" value={to} onChange={(e) => setTo(e.target.value)} placeholder="@username, @another" aria-describedby="fx-pm-to-hint" required /></label>
      <small id="fx-pm-to-hint" className="fx-muted">نام کاربری‌ها را با فاصله یا ویرگول جدا کنید (حداکثر ۱۰ نفر).</small>
      <label className="fx-field"><span>موضوع</span><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} minLength={5} maxLength={150} required placeholder="موضوع پیام" /></label>
    </div>
    <Composer
      mode="reply"
      draftKey="forum:draft:pm"
      submitLabel="ارسال پیام"
      busyLabel="در حال ارسال…"
      onSubmit={async (value) => {
        if (title.trim().length < 5) return 'موضوع پیام دست‌کم ۵ نویسه باشد'
        const { ok, data } = await send('/api/forum/messages', 'POST', { to, title, content: value.content })
        if (!ok) return data.error
        router.push(`/forum/messages/${data.id}`)
        return null
      }}
    />
  </div>
}

/** A conversation: messages, reply box, archive / leave / invite. */
export function Conversation({ data }: { data: ConversationData }) {
  const router = useRouter()
  const [toast, setToast] = useState('')
  const [invite, setInvite] = useState('')
  const [inviting, setInviting] = useState(false)
  const active = data.participants.filter((p) => !p.left)
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 3500); return () => clearTimeout(timer) }, [toast])

  async function act(action: 'archive' | 'unarchive' | 'leave') {
    if (action === 'leave' && !window.confirm('از این گفت‌وگو خارج شوید؟ دیگر پیام‌های تازهٔ آن را نمی‌بینید.')) return
    const { ok, data: result } = await send(`/api/forum/messages/${data.id}`, 'PATCH', { action })
    if (!ok) { setToast(result.error); return }
    if (action === 'leave') router.push('/forum/messages')
    else { setToast(action === 'archive' ? 'به بایگانی رفت' : 'به صندوق برگشت'); router.refresh() }
  }

  async function sendInvite(event: React.FormEvent) {
    event.preventDefault()
    const { ok, data: result } = await send(`/api/forum/messages/${data.id}`, 'PATCH', { action: 'invite', to: invite })
    if (!ok) { setToast(result.error); return }
    setInvite(''); setInviting(false); setToast(`${fa(result.invited)} نفر دعوت شد`); router.refresh()
  }

  return <div className="fx-pm">
    <header className="fx-pm-head">
      <div>
        <Link href="/forum/messages" className="fx-muted">✉ پیام‌های خصوصی</Link>
        <h1>{data.title}</h1>
        <div className="fx-pm-people" aria-label="شرکت‌کنندگان">{active.map((p) => <Link key={p.id} href={`/forum/u/${p.username}`} title={p.name}><Avatar author={p} size={28} /><span>{p.name}</span></Link>)}</div>
      </div>
      <div className="fx-pm-actions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setInviting(!inviting)} aria-expanded={inviting}>+ دعوت</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void act(data.archived ? 'unarchive' : 'archive')}>{data.archived ? 'بازگرداندن' : 'بایگانی'}</button>
        <button type="button" className="btn btn-ghost btn-sm is-danger" onClick={() => void act('leave')}>خروج</button>
      </div>
    </header>
    {inviting && <form className="fx-pm-invite" onSubmit={sendInvite}><input className="input" dir="ltr" value={invite} onChange={(e) => setInvite(e.target.value)} placeholder="@username" required aria-label="نام کاربری" /><button className="btn btn-primary btn-sm">دعوت</button></form>}
    {data.page > 1 && <Link className="fx-load" href={`/forum/messages/${data.id}?page=${data.page - 1}`}>↑ پیام‌های قبلی</Link>}
    <ol className="fx-pm-stream">
      {data.messages.map((message) => <li key={message.id} id={`m-${message.number}`} className={`fx-pm-msg${message.own ? ' is-own' : ''}${message.number > data.lastRead ? ' is-new' : ''}`}>
        <Link href={`/forum/u/${message.author.username}`} aria-hidden="true" tabIndex={-1}><Avatar author={message.author} size={36} /></Link>
        <div className="fx-pm-bubble">
          <header><Link href={`/forum/u/${message.author.username}`}>{message.author.name}</Link>{message.author.staff && <span title="تیم موبوکام"> 🛡</span>}<time>{new Date(message.createdAt).toLocaleString('fa-IR', { dateStyle: 'medium', timeStyle: 'short' })}</time></header>
          <div className="fx-cooked" dangerouslySetInnerHTML={{ __html: message.html }} />
        </div>
      </li>)}
    </ol>
    {data.page < data.pages && <Link className="fx-load" href={`/forum/messages/${data.id}?page=${data.page + 1}`}>پیام‌های بعدی ↓</Link>}
    <Composer
      mode="reply"
      heading="پاسخ"
      draftKey={`forum:draft:pm:${data.id}`}
      submitLabel="ارسال"
      onSubmit={async (value) => {
        const { ok, data: result } = await send(`/api/forum/messages/${data.id}`, 'POST', { content: value.content })
        if (!ok) return result.error
        router.push(`/forum/messages/${data.id}#m-${result.number}`)
        router.refresh()
        return null
      }}
    />
    {toast && <div className="fx-toast" role="status">{toast}</div>}
  </div>
}

type ReviewItem = {
  id: number; number: number; excerpt: string; content: string; reason: string; createdAt: string; newTopic: boolean; approvedPosts: number
  thread: { id: number; title: string; category: { title: string; color: string } }
  author: { username: string; name: string; avatar: string; avatarColor: string; trustLevel: number }
}

/** Staff review queue: approve or reject held posts. */
export function ReviewQueue({ items: initial }: { items: ReviewItem[] }) {
  const [items, setItems] = useState(initial)
  const [open, setOpen] = useState<number | null>(null)
  const [error, setError] = useState('')
  async function decide(item: ReviewItem, decision: 'approve' | 'reject') {
    const note = decision === 'reject' ? window.prompt('دلیل رد (برای نویسنده ارسال می‌شود، اختیاری):') ?? null : ''
    if (note === null) return
    const { ok, data } = await send('/api/forum/review', 'POST', { postId: item.id, decision, note })
    if (!ok) { setError(data.error); return }
    setItems((list) => list.filter((row) => row.id !== item.id))
  }
  if (!items.length) return <div className="fx-empty"><b>صف بررسی خالی است ✅</b><p className="fx-muted">پیام‌هایی که به تأیید نیاز دارند (کاربران تازه‌وارد یا واژه‌های تحت نظر) اینجا می‌آیند.</p></div>
  return <div className="fx-review">
    {error && <p className="error-text" role="alert">{error}</p>}
    {items.map((item) => <article key={item.id} className="fx-review-item">
      <header>
        <Avatar author={item.author} size={36} />
        <div>
          <b>{item.author.name}</b> <bdi dir="ltr" className="fx-handle">@{item.author.username}</bdi>
          <small className="fx-muted"> · {fa(item.approvedPosts)} پیام تأییدشده · {new Date(item.createdAt).toLocaleString('fa-IR', { dateStyle: 'medium', timeStyle: 'short' })}</small>
          <div className="fx-review-where">{item.newTopic ? 'موضوع تازه' : `پاسخ #${fa(item.number)}`} در <Link href={`/forum/t/${item.thread.id}${item.newTopic ? '' : `?post=${item.number}`}`}>«{item.thread.title}»</Link> <span className="fx-cat"><i style={{ background: item.thread.category.color }} />{item.thread.category.title}</span></div>
        </div>
        <span className="fx-review-reason">{item.reason}</span>
      </header>
      {open === item.id ? <pre className="fx-review-raw" dir="auto">{item.content}</pre> : <p>{item.excerpt}</p>}
      <footer>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => void decide(item, 'approve')}>✓ تأیید و انتشار</button>
        <button type="button" className="btn btn-ghost btn-sm is-danger" onClick={() => void decide(item, 'reject')}>✕ رد و حذف</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(open === item.id ? null : item.id)}>{open === item.id ? 'خلاصه' : 'متن کامل'}</button>
      </footer>
    </article>)}
  </div>
}
