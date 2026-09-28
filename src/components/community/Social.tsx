'use client'

import Link from '@/components/AppLink'
import { useRouter } from '@/platform/routing/navigation'
import { useEffect, useRef, useState } from 'react'
import { Avatar, CmIcon, Verified } from './CommunityIcons'

// Social layer: follow, profile actions, posts (like, comment, edit, pin,
// report, delete), the composer and the infinite feed.

export type Card = { userId: number; username: string; name: string; avatar: string; avatarColor: string; headline: string; verified: boolean; staff: boolean; followers?: number }
export type Comment = { id: number; html: string; createdAt: string; author: Card; own: boolean }
export type Post = {
  id: number; html: string; content: string; images: string[]; visibility: string; createdAt: string; editedAt: string | null; editable: boolean
  author: Card; likes: number; comments: number; liked: boolean; own: boolean; pinned: boolean
  item: { type: string; title: string; subtitle: string; url: string; image: string } | null
  preview: Comment[]; all?: Comment[]
}

const fa = (n: number) => n.toLocaleString('fa-IR')
export function ago(iso: string) {
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (s < 60) return 'همین حالا'
  if (s < 3600) return `${fa(Math.floor(s / 60))} دقیقه پیش`
  if (s < 86400) return `${fa(Math.floor(s / 3600))} ساعت پیش`
  if (s < 86400 * 7) return `${fa(Math.floor(s / 86400))} روز پیش`
  return new Date(iso).toLocaleDateString('fa-IR', { day: 'numeric', month: 'long', year: 'numeric' })
}

async function call<T = any>(url: string, method: string, body?: unknown): Promise<{ ok: true; data: T } | { ok: false; error: string; status: number }> {
  try {
    const response = await fetch(url, { method, headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined, body: body !== undefined ? JSON.stringify(body) : undefined })
    const data = await response.json().catch(() => null)
    return response.ok ? { ok: true, data } : { ok: false, error: data?.error || 'انجام نشد؛ دوباره تلاش کنید', status: response.status }
  } catch { return { ok: false, error: 'ارتباط برقرار نشد', status: 0 } }
}

function useToast() {
  const [toast, setToast] = useState('')
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 3200); return () => clearTimeout(t) }, [toast])
  return { toast, show: setToast, node: toast ? <div className="cm-toast" role="status">{toast}</div> : null }
}

// ------------------------------------------------------------------ people

export function NameLine({ person, small = false }: { person: Card; small?: boolean }) {
  return <span className={`cm-name${small ? ' is-small' : ''}`}>
    <Link href={`/u/${person.username}`} className="cm-name-link">{person.name}</Link>
    {person.verified && <Verified size={small ? 14 : 16} />}
    {person.staff && <span className="cm-staff" title="تیم سایت">تیم</span>}
    <bdi dir="ltr" className="cm-handle">@{person.username}</bdi>
  </span>
}

export function FollowButton({ username, initial, signedIn, onChange, compact = false }: { username: string; initial: boolean; signedIn: boolean; onChange?: (following: boolean, followers: number) => void; compact?: boolean }) {
  const [following, setFollowing] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [hover, setHover] = useState(false)
  const router = useRouter()
  async function toggle() {
    if (!signedIn) { router.push(`/login?next=${encodeURIComponent(`/u/${username}`)}`); return }
    setBusy(true)
    const result = await call<{ following: boolean; followers: number }>(`/api/people/${username}/follow`, 'POST', { on: !following })
    setBusy(false)
    if (result.ok) { setFollowing(result.data.following); onChange?.(result.data.following, result.data.followers) }
    else window.alert(result.error)
  }
  return <button type="button" className={`cm-follow${following ? ' is-following' : ''}${compact ? ' is-compact' : ''}`} aria-pressed={following} disabled={busy} onClick={() => void toggle()} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
    {following ? (hover ? 'لغو دنبال کردن' : <><CmIcon name="check" size={15} />دنبال می‌کنید</>) : <><CmIcon name="plus" size={15} />دنبال کردن</>}
  </button>
}

export function FollowerCount({ username, initial }: { username: string; initial: number }) {
  return <Link href={`/u/${username}?tab=followers`} className="cm-stat"><b className="num" data-followers>{fa(initial)}</b><small>دنبال‌کننده</small></Link>
}

/** Follow + message + more menu (copy link, block, report user) for someone else's profile. */
export function ProfileActions({ username, name, following, signedIn, canMessage, blocked, messagesOn }: { username: string; name: string; following: boolean; signedIn: boolean; canMessage: boolean; blocked: boolean; messagesOn: boolean }) {
  const [open, setOpen] = useState(false)
  const [isBlocked, setBlocked] = useState(blocked)
  const menu = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const { node, show } = useToast()
  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => { if (!menu.current?.contains(event.target as Node)) setOpen(false) }
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close); document.addEventListener('keydown', key)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', key) }
  }, [open])
  async function toggleBlock() {
    setOpen(false)
    if (!signedIn) { router.push('/login'); return }
    if (!isBlocked && !window.confirm(`${name} مسدود شود؟ دیگر پست‌ها و پیام‌های همدیگر را نمی‌بینید و دنبال کردن‌ها لغو می‌شود.`)) return
    const result = await call<{ blocked: boolean }>(`/api/people/${username}/block`, 'POST', { on: !isBlocked })
    if (!result.ok) { show(result.error); return }
    setBlocked(result.data.blocked); show(result.data.blocked ? 'کاربر مسدود شد' : 'از مسدودی خارج شد'); router.refresh()
  }
  async function copy() {
    setOpen(false)
    await navigator.clipboard?.writeText(window.location.origin + window.location.pathname).catch(() => undefined)
    show('نشانی پروفایل کپی شد')
  }
  return <div className="cm-actions">
    {!isBlocked && <FollowButton username={username} initial={following} signedIn={signedIn} onChange={(_, followers) => { const el = document.querySelector('[data-followers]'); if (el) el.textContent = fa(followers) }} />}
    {messagesOn && canMessage && !isBlocked && <Link href={`/forum/messages/new?to=${username}`} className="cm-btn"><CmIcon name="message" size={16} />پیام</Link>}
    <div className="cm-menu" ref={menu}>
      <button type="button" className="cm-btn is-icon" aria-label="گزینه‌های بیشتر" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}><CmIcon name="more" size={18} /></button>
      {open && <div className="cm-menu-list" role="menu">
        <button type="button" role="menuitem" onClick={() => void copy()}><CmIcon name="link" size={16} />کپی نشانی پروفایل</button>
        <button type="button" role="menuitem" className="is-danger" onClick={() => void toggleBlock()}><CmIcon name="block" size={16} />{isBlocked ? 'رفع مسدودی' : `مسدود کردن @${username}`}</button>
      </div>}
    </div>
    {node}
  </div>
}

// ------------------------------------------------------------------ posts

const REASONS: [string, string][] = [['SPAM', 'هرزنامه یا تبلیغ'], ['ABUSE', 'توهین یا آزار'], ['INAPPROPRIATE', 'محتوای نامناسب'], ['COPYRIGHT', 'نقض حق نشر'], ['OTHER', 'دلیل دیگر']]

function ReportDialog({ target, onClose, onDone }: { target: { postId?: number; commentId?: number }; onClose: () => void; onDone: (text: string) => void }) {
  const [reason, setReason] = useState('SPAM')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  async function send() {
    setBusy(true)
    const result = await call<{ duplicate: boolean }>('/api/community/reports', 'POST', { ...target, reason, note })
    setBusy(false)
    onDone(result.ok ? (result.data.duplicate ? 'این مورد را قبلاً گزارش کرده‌اید' : 'گزارش شما ثبت شد؛ ممنون') : result.error)
  }
  return <div className="cm-modal" role="dialog" aria-modal="true" aria-label="گزارش" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
    <div className="cm-modal-card">
      <h2>گزارش {target.commentId ? 'دیدگاه' : 'پست'}</h2>
      <fieldset className="cm-reasons"><legend className="sr-only">دلیل</legend>{REASONS.map(([key, label]) => <label key={key} className={reason === key ? 'is-on' : ''}><input type="radio" name="reason" checked={reason === key} onChange={() => setReason(key)} />{label}</label>)}</fieldset>
      <textarea className="input" rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="توضیح (اختیاری)" aria-label="توضیح" />
      <div className="cm-modal-actions"><button type="button" className="btn btn-ghost" onClick={onClose}>انصراف</button><button type="button" className="btn btn-primary" disabled={busy} onClick={() => void send()}>ارسال گزارش</button></div>
    </div>
  </div>
}

function Images({ list }: { list: string[] }) {
  const [zoom, setZoom] = useState<string | null>(null)
  if (!list.length) return null
  return <>
    <div className={`cm-images is-${Math.min(list.length, 4)}`}>{list.map((src) => <button key={src} type="button" onClick={() => setZoom(src)} aria-label="بزرگ‌نمایی تصویر"><img src={src} alt="" loading="lazy" /></button>)}</div>
    {zoom && <div className="cm-lightbox" role="dialog" aria-modal="true" aria-label="تصویر" onClick={() => setZoom(null)}><img src={zoom} alt="" /><button type="button" className="cm-lightbox-close" aria-label="بستن" onClick={() => setZoom(null)}><CmIcon name="x" size={22} /></button></div>}
  </>
}

export function PostCard({ post: initial, signedIn, meId, onRemoved, expanded = false }: { post: Post; signedIn: boolean; meId: number | null; onRemoved?: (id: number) => void; expanded?: boolean }) {
  const [post, setPost] = useState(initial)
  const [comments, setComments] = useState<Comment[]>(initial.all || initial.preview)
  const [showAll, setShowAll] = useState(expanded)
  const [reply, setReply] = useState('')
  const [menu, setMenu] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(initial.content)
  const [reporting, setReporting] = useState<{ postId?: number; commentId?: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const router = useRouter()
  const { node, show } = useToast()
  const need = () => { if (!signedIn) { router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`); return true } return false }

  async function like() {
    if (need()) return
    const next = !post.liked
    setPost((p) => ({ ...p, liked: next, likes: p.likes + (next ? 1 : -1) }))
    const result = await call<{ liked: boolean; likes: number }>(`/api/community/posts/${post.id}/like`, 'POST', { on: next })
    if (result.ok) setPost((p) => ({ ...p, liked: result.data.liked, likes: result.data.likes }))
    else { setPost((p) => ({ ...p, liked: !next, likes: p.likes + (next ? -1 : 1) })); show(result.error) }
  }
  async function loadAll() {
    const result = await call<{ post: Post }>(`/api/community/posts/${post.id}`, 'GET')
    if (result.ok) { setComments(result.data.post.all || []); setShowAll(true) }
  }
  async function sendComment(event: React.FormEvent) {
    event.preventDefault()
    if (need() || !reply.trim()) return
    setBusy(true)
    const result = await call<{ comment: Comment }>(`/api/community/posts/${post.id}/comments`, 'POST', { content: reply })
    setBusy(false)
    if (!result.ok) { show(result.error); return }
    setComments((list) => [...list, result.data.comment]); setReply(''); setPost((p) => ({ ...p, comments: p.comments + 1 }))
  }
  async function removeComment(id: number) {
    if (!window.confirm('این دیدگاه حذف شود؟')) return
    const result = await call(`/api/community/comments/${id}`, 'DELETE')
    if (!result.ok) { show(result.error); return }
    setComments((list) => list.filter((c) => c.id !== id)); setPost((p) => ({ ...p, comments: Math.max(0, p.comments - 1) }))
  }
  async function remove() {
    setMenu(false)
    if (!window.confirm('این پست حذف شود؟')) return
    const result = await call(`/api/community/posts/${post.id}`, 'DELETE')
    if (!result.ok) { show(result.error); return }
    onRemoved?.(post.id); show('پست حذف شد')
  }
  async function pin() {
    setMenu(false)
    const result = await call(`/api/community/posts/${post.id}`, 'PATCH', { pin: !post.pinned })
    if (!result.ok) { show(result.error); return }
    setPost((p) => ({ ...p, pinned: !p.pinned })); show(post.pinned ? 'از بالای پروفایل برداشته شد' : 'در بالای پروفایل سنجاق شد'); router.refresh()
  }
  async function saveEdit() {
    const result = await call<{ post: Post }>(`/api/community/posts/${post.id}`, 'PATCH', { content: draft })
    if (!result.ok) { show(result.error); return }
    setPost((p) => ({ ...p, html: result.data.post.html, content: result.data.post.content, editedAt: result.data.post.editedAt })); setEditing(false)
  }
  async function share() {
    const url = `${window.location.origin}/feed/p/${post.id}`
    if (navigator.share) await navigator.share({ url, title: `پست ${post.author.name}` }).catch(() => undefined)
    else { await navigator.clipboard?.writeText(url).catch(() => undefined); show('نشانی پست کپی شد') }
  }

  const list = showAll ? comments : comments.slice(-2)
  return <article className={`cm-post${post.pinned ? ' is-pinned' : ''}`} aria-labelledby={`post-${post.id}-by`}>
    {post.pinned && <div className="cm-pinned"><CmIcon name="pin" size={14} />سنجاق‌شده</div>}
    <header className="cm-post-head">
      <Link href={`/u/${post.author.username}`} tabIndex={-1} aria-hidden="true"><Avatar person={post.author} size={44} /></Link>
      <div className="cm-post-who" id={`post-${post.id}-by`}>
        <NameLine person={post.author} />
        <span className="cm-post-meta"><Link href={`/feed/p/${post.id}`}><time dateTime={post.createdAt} title={new Date(post.createdAt).toLocaleString('fa-IR')}>{ago(post.createdAt)}</time></Link>{post.editedAt && ' · ویرایش‌شده'}{post.visibility === 'FOLLOWERS' && <span title="فقط دنبال‌کنندگان"> · <CmIcon name="users" size={13} /></span>}</span>
      </div>
      <div className="cm-menu">
        <button type="button" className="cm-btn is-icon is-ghost" aria-label="گزینه‌های پست" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(!menu)}><CmIcon name="more" size={18} /></button>
        {menu && <div className="cm-menu-list" role="menu" onMouseLeave={() => setMenu(false)}>
          <button type="button" role="menuitem" onClick={() => { setMenu(false); void share() }}><CmIcon name="share" size={16} />اشتراک‌گذاری</button>
          {post.own && <button type="button" role="menuitem" onClick={() => void pin()}><CmIcon name="pin" size={16} />{post.pinned ? 'برداشتن سنجاق' : 'سنجاق در پروفایل'}</button>}
          {post.editable && <button type="button" role="menuitem" onClick={() => { setMenu(false); setEditing(true) }}><CmIcon name="edit" size={16} />ویرایش</button>}
          {!post.own && signedIn && <button type="button" role="menuitem" onClick={() => { setMenu(false); setReporting({ postId: post.id }) }}><CmIcon name="flag" size={16} />گزارش</button>}
          {post.own && <button type="button" role="menuitem" className="is-danger" onClick={() => void remove()}><CmIcon name="trash" size={16} />حذف</button>}
        </div>}
      </div>
    </header>
    {editing ? <div className="cm-edit"><textarea className="input" rows={4} value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="ویرایش پست" /><div className="cm-row"><button type="button" className="btn btn-primary btn-sm" onClick={() => void saveEdit()}>ذخیره</button><button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>انصراف</button></div></div>
      : post.html && <div className="cm-body" dir="auto" dangerouslySetInnerHTML={{ __html: post.html }} />}
    <Images list={post.images} />
    {post.item && <Link href={post.item.url} className="cm-item">{post.item.image && <img src={post.item.image} alt="" loading="lazy" />}<span><small>{post.item.subtitle}</small><b>{post.item.title}</b></span><CmIcon name="arrow" size={16} /></Link>}
    <footer className="cm-post-bar">
      <button type="button" className={`cm-act${post.liked ? ' is-liked' : ''}`} aria-pressed={post.liked} onClick={() => void like()}><CmIcon name="heart" size={18} filled={post.liked} /><span className="num">{post.likes ? fa(post.likes) : ''}</span><span className="sr-only">پسند</span></button>
      <button type="button" className="cm-act" onClick={() => { if (!showAll && post.comments > comments.length) void loadAll(); else document.getElementById(`reply-${post.id}`)?.focus() }}><CmIcon name="comment" size={18} /><span className="num">{post.comments ? fa(post.comments) : ''}</span><span className="sr-only">دیدگاه</span></button>
      <button type="button" className="cm-act" onClick={() => void share()}><CmIcon name="share" size={18} /><span className="sr-only">اشتراک</span></button>
    </footer>
    {(list.length > 0 || signedIn) && <div className="cm-comments">
      {!showAll && post.comments > comments.length && <button type="button" className="cm-more" onClick={() => void loadAll()}>مشاهدهٔ همهٔ {fa(post.comments)} دیدگاه</button>}
      {list.map((comment) => <div key={comment.id} className="cm-comment">
        <Link href={`/u/${comment.author.username}`} tabIndex={-1} aria-hidden="true"><Avatar person={comment.author} size={30} /></Link>
        <div className="cm-comment-bubble"><NameLine person={comment.author} small /><div className="cm-body is-small" dir="auto" dangerouslySetInnerHTML={{ __html: comment.html }} />
          <span className="cm-comment-meta"><time dateTime={comment.createdAt}>{ago(comment.createdAt)}</time>
            {(comment.own || post.own) && <button type="button" className="cm-link" onClick={() => void removeComment(comment.id)}>حذف</button>}
            {!comment.own && signedIn && <button type="button" className="cm-link" onClick={() => setReporting({ commentId: comment.id })}>گزارش</button>}
          </span>
        </div>
      </div>)}
      {signedIn && <form className="cm-reply" onSubmit={sendComment}><input id={`reply-${post.id}`} className="input" value={reply} onChange={(e) => setReply(e.target.value)} placeholder="دیدگاه بنویسید…" maxLength={1000} aria-label="دیدگاه" /><button type="submit" className="cm-btn is-icon is-accent" disabled={busy || !reply.trim()} aria-label="ارسال دیدگاه"><CmIcon name="send" size={17} /></button></form>}
    </div>}
    {reporting && <ReportDialog target={reporting} onClose={() => setReporting(null)} onDone={(text) => { setReporting(null); show(text) }} />}
    {node}
  </article>
}

// ------------------------------------------------------------------ composer

export function Composer({ me, onPosted, allowFollowers = true, allowImages = true, maxLength = 2000, placeholder = 'چه خبر؟ از بازی، فیلم، نرم‌افزار یا هر چیزی که دوست دارید بنویسید…' }: { me: Card; onPosted: (post: Post) => void; allowFollowers?: boolean; allowImages?: boolean; maxLength?: number; placeholder?: string }) {
  const [text, setText] = useState('')
  const [images, setImages] = useState<string[]>([])
  const [visibility, setVisibility] = useState<'PUBLIC' | 'FOLLOWERS'>('PUBLIC')
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const file = useRef<HTMLInputElement>(null)
  const area = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { const el = area.current; if (el) { el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 360)}px` } }, [text])

  async function upload(files: FileList | null) {
    if (!files?.length) return
    setUploading(true); setError('')
    for (const f of [...files].slice(0, 4 - images.length)) {
      const form = new FormData(); form.append('file', f)
      const response = await fetch('/api/profile/media', { method: 'POST', body: form }).catch(() => null)
      const data = await response?.json().catch(() => null)
      if (!response?.ok) { setError(data?.error || 'بارگذاری تصویر انجام نشد'); break }
      setImages((list) => [...list, data.url].slice(0, 4))
    }
    setUploading(false)
    if (file.current) file.current.value = ''
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!text.trim() && !images.length) return
    setBusy(true); setError('')
    const result = await call<{ post: Post }>('/api/community/posts', 'POST', { content: text, images, visibility })
    setBusy(false)
    if (!result.ok) { setError(result.error); return }
    setText(''); setImages([]); onPosted(result.data.post)
  }
  const left = maxLength - text.length
  return <form className="cm-composer" onSubmit={submit}>
    <Avatar person={me} size={46} />
    <div className="cm-composer-main">
      <textarea ref={area} className="cm-composer-text" value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} maxLength={maxLength} rows={2} aria-label="متن پست" dir="auto" onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') void submit(e as unknown as React.FormEvent) }} />
      {images.length > 0 && <div className="cm-composer-images">{images.map((src) => <span key={src}><img src={src} alt="" /><button type="button" aria-label="حذف تصویر" onClick={() => setImages((list) => list.filter((x) => x !== src))}><CmIcon name="x" size={14} /></button></span>)}</div>}
      {error && <p className="cm-error" role="alert">{error}</p>}
      <div className="cm-composer-bar">
        {allowImages && <><input ref={file} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(e) => void upload(e.target.files)} /><button type="button" className="cm-btn is-icon is-ghost" onClick={() => file.current?.click()} disabled={uploading || images.length >= 4} aria-label="افزودن تصویر" title="افزودن تصویر (حداکثر ۴)"><CmIcon name="image" size={19} /></button></>}
        {allowFollowers && <label className="cm-visibility"><CmIcon name={visibility === 'PUBLIC' ? 'globe' : 'users'} size={15} /><select value={visibility} onChange={(e) => setVisibility(e.target.value as 'PUBLIC' | 'FOLLOWERS')} aria-label="چه کسانی ببینند"><option value="PUBLIC">همه</option><option value="FOLLOWERS">فقط دنبال‌کنندگان</option></select></label>}
        <span className={`cm-count num${left < 50 ? ' is-low' : ''}`} aria-live="polite">{left < 200 ? fa(left) : ''}</span>
        <button type="submit" className="btn btn-primary cm-publish" disabled={busy || uploading || (!text.trim() && !images.length)}>{uploading ? 'در حال بارگذاری…' : busy ? 'در حال انتشار…' : 'انتشار'}</button>
      </div>
    </div>
  </form>
}

// ------------------------------------------------------------------ feed

export function Feed({ initial, next: initialNext, source, signedIn, me, composer, empty }: {
  initial: Post[]; next: string | null; source: string; signedIn: boolean; me: Card | null
  composer?: { allowFollowers: boolean; allowImages: boolean; maxLength: number } | null; empty: React.ReactNode
}) {
  const [posts, setPosts] = useState(initial)
  const [next, setNext] = useState(initialNext)
  const [busy, setBusy] = useState(false)
  const sentinel = useRef<HTMLDivElement>(null)
  useEffect(() => { setPosts(initial); setNext(initialNext) }, [initial, initialNext])
  async function more() {
    if (!next || busy) return
    setBusy(true)
    const result = await call<{ posts: Post[]; next: string | null }>(`${source}${source.includes('?') ? '&' : '?'}cursor=${encodeURIComponent(next)}`, 'GET')
    setBusy(false)
    if (result.ok) { setPosts((list) => [...list, ...result.data.posts.filter((p) => !list.some((x) => x.id === p.id))]); setNext(result.data.next) }
  }
  useEffect(() => {
    const el = sentinel.current
    if (!el || !next) return
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) void more() }, { rootMargin: '600px' })
    io.observe(el)
    return () => io.disconnect()
  })
  return <div className="cm-feed">
    {composer && me && <Composer me={me} {...composer} onPosted={(post) => setPosts((list) => [post, ...list])} />}
    {posts.length ? posts.map((post) => <PostCard key={post.id} post={post} signedIn={signedIn} meId={me?.userId ?? null} onRemoved={(id) => setPosts((list) => list.filter((p) => p.id !== id))} />) : empty}
    {next && <div ref={sentinel} className="cm-sentinel"><button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void more()}>{busy ? 'در حال بارگذاری…' : 'پست‌های بیشتر'}</button></div>}
  </div>
}

// ------------------------------------------------------------------ people list

export function PeopleList({ people, signedIn, variant = 'grid' }: { people: (Card & { following?: boolean; self?: boolean })[]; signedIn: boolean; variant?: 'grid' | 'list' }) {
  if (!people.length) return <p className="cm-muted">کسی اینجا نیست.</p>
  return <ul className={`cm-people is-${variant}`}>{people.map((person) => <li key={person.userId}>
    <Link href={`/u/${person.username}`} className="cm-person-link" tabIndex={-1} aria-hidden="true"><Avatar person={person} size={variant === 'grid' ? 64 : 42} /></Link>
    <div className="cm-person-copy"><NameLine person={person} small={variant === 'list'} />{person.headline && <p>{person.headline}</p>}{variant === 'grid' && person.followers !== undefined && <small className="cm-muted num">{fa(person.followers)} دنبال‌کننده</small>}</div>
    {!person.self && <FollowButton username={person.username} initial={!!person.following} signedIn={signedIn} compact />}
  </li>)}</ul>
}
