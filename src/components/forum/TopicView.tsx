'use client'

import Link from '@/components/AppLink'
import { CLUBS_SECTION, categoryTree } from '@/modules/forum/domain/tree'
import { useRouter } from '@/platform/routing/navigation'
import { useEffect, useRef, useState } from 'react'
import Composer, { type ComposerCategory } from '@/components/forum/Composer'
import { CookedWithPolls, type PollData } from '@/components/forum/Poll'
import ShortcutHelp, { useForumShortcuts } from '@/components/forum/Shortcuts'
import { REACTION_EMOJI } from '@/modules/forum/domain/community'
import { FORUM_RANK_LABELS, TRUST_NAMES, type ForumRank } from '@/modules/forum/domain/community'

type Author = { id: number; username: string; name: string; avatar: string; avatarColor: string; title: string; trustLevel: number; staff: boolean; posts: number; reputation: number; joinedAt?: string | Date; rank?: ForumRank; flair: { icon: string; color: string; name: string } | null }
/** «مهر ۱۴۰۵»: month then year, built from parts because runtimes order the Persian date differently. */
function joinedLabel(value: string | Date) {
  const parts = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: 'long', timeZone: 'Asia/Tehran' }).formatToParts(new Date(value))
  const part = (type: string) => parts.find((item) => item.type === type)?.value || ''
  return `${part('month')} ${part('year')}`
}
type Reaction = { emoji: string; count: number; mine: boolean }
export type TopicPost = {
  id: number; number: number; html: string; raw: string | null; status: string; createdAt: string; editedAt: string | null; editCount: number
  author: Author; replyTo: { number: number; username: string } | null; reactions: Reaction[]; bookmarked: boolean; canEdit: boolean; own: boolean; solution: boolean; flags: number
  wiki: boolean; pendingReason: string; polls: PollData[]
}
export type TopicData = {
  thread: { id: number; title: string; pinned: boolean; locked: boolean; status: string; views: number; replyCount: number; likeCount: number; postCount: number; createdAt: string; lastPostAt: string; userId: number; tags: string[]; closeAt: string | null; slowModeSeconds: number; listed: boolean }
  lastRead: number
  category: { id: number; slug: string; title: string; color: string; icon: string; parent: { slug: string; title: string; color: string } | null }
  access: { see: boolean; reply: boolean; create: boolean }; moderator: boolean; signedIn: boolean; canSolve: boolean
  solution: { id: number; number: number; excerpt: string; author: Author } | null
  level: string; participants: (Author & { posts: number })[]; suggested: { id: number; title: string; replyCount: number; lastPostAt: string }[]
  posts: TopicPost[]; reactionsAllowed: string[]; page: number; pages: number; total: number
}

const LEVELS: { id: string; label: string; hint: string }[] = [
  { id: 'WATCHING', label: '🔔 دنبال‌کردن', hint: 'برای هر پاسخ تازه اعلان بگیرید' },
  { id: 'TRACKING', label: '👁 پیگیری', hint: 'تعداد پاسخ‌های خوانده‌نشده را ببینید' },
  { id: 'NORMAL', label: '○ عادی', hint: 'فقط وقتی کسی به شما پاسخ دهد یا نامتان را بیاورد' },
  { id: 'MUTED', label: '🔕 بی‌صدا', hint: 'این موضوع در فهرست خوانده‌نشده‌ها نیاید' },
]
const FLAG_REASONS = [{ id: 'SPAM', label: 'هرزنامه یا تبلیغ' }, { id: 'INAPPROPRIATE', label: 'توهین‌آمیز یا نامناسب' }, { id: 'OFF_TOPIC', label: 'خارج از موضوع' }, { id: 'OTHER', label: 'دلیل دیگر' }]
const fa = (n: number) => n.toLocaleString('fa-IR')
const SLOW_MODES: [number, string][] = [[0, 'خاموش'], [60, '۱ دقیقه'], [300, '۵ دقیقه'], [600, '۱۰ دقیقه'], [1800, '۳۰ دقیقه'], [3600, '۱ ساعت'], [10800, '۳ ساعت'], [21600, '۶ ساعت'], [43200, '۱۲ ساعت'], [86400, '۲۴ ساعت']]
const TIMERS: [number, string][] = [[1, '۱ ساعت'], [6, '۶ ساعت'], [24, '۱ روز'], [72, '۳ روز'], [168, '۱ هفته'], [720, '۱ ماه']]

function ago(date: string) {
  const s = Math.max(0, (Date.now() - new Date(date).getTime()) / 1000)
  if (s < 60) return 'همین حالا'
  const units: [number, string][] = [[3600, 'دقیقه'], [86400, 'ساعت'], [2592000, 'روز'], [31536000, 'ماه']]
  const divs = [60, 3600, 86400, 2592000]
  for (let i = 0; i < units.length; i++) if (s < units[i][0]) return `${fa(Math.floor(s / divs[i]))} ${units[i][1]} پیش`
  return `${fa(Math.floor(s / 31536000))} سال پیش`
}

function Avatar({ author, size = 44 }: { author: Pick<Author, 'name' | 'avatar' | 'avatarColor'>; size?: number }) {
  if (author.avatar) return <img className="fx-avatar" src={author.avatar} alt="" width={size} height={size} style={{ width: size, height: size }} loading="lazy" />
  return <span className="fx-avatar" style={{ width: size, height: size, fontSize: Math.round(size * 0.42), background: author.avatarColor }} aria-hidden="true">{author.name.trim().slice(0, 1)}</span>
}

async function api(url: string, method: string, body?: unknown): Promise<{ ok: boolean; data: any }> {
  const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }).catch(() => null)
  const data = await response?.json().catch(() => null)
  return { ok: !!response?.ok, data: response?.ok ? data : { error: data?.error || 'انجام نشد؛ دوباره تلاش کنید' } }
}

type ComposerState = { mode: 'reply' | 'edit'; replyTo?: TopicPost; edit?: TopicPost; initial?: string; key: number } | null

export default function TopicView({ data, categories, focusPost, trail = [] }: { data: TopicData; categories: ComposerCategory[]; focusPost?: number; trail?: { slug: string; title: string }[] }) {
  const router = useRouter()
  const { thread } = data
  const [posts, setPosts] = useState(data.posts)
  const [composer, setComposer] = useState<ComposerState>(null)
  const [toast, setToast] = useState('')
  const [level, setLevel] = useState(data.level)
  // Posts picked to be quoted together, by post number.
  const [quoted, setQuoted] = useState<number[]>([])
  const [menu, setMenu] = useState<string>('')
  const [flagging, setFlagging] = useState<TopicPost | null>(null)
  const [history, setHistory] = useState<{ post: TopicPost; items: { id: number; content: string; createdAt: string; editor: string }[]; current: string } | null>(null)
  const [current, setCurrent] = useState(posts[0]?.number || 1)
  const stream = useRef<HTMLDivElement>(null)
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<number[]>([])
  const [moveTarget, setMoveTarget] = useState<{ mode: 'new' | 'existing'; title: string; categoryId: number; topic: string } | null>(null)
  const [help, setHelp] = useState(false)
  const [focusIndex, setFocusIndex] = useState(-1)

  useEffect(() => { setPosts(data.posts) }, [data.posts])
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(''), 3500); return () => clearTimeout(t) } }, [toast])
  useEffect(() => {
    if (!focusPost) return
    const el = document.getElementById(`post-${focusPost}`)
    if (el) { el.scrollIntoView({ block: 'start' }); el.classList.add('is-highlight'); setTimeout(() => el.classList.remove('is-highlight'), 2200) }
  }, [focusPost])
  // Timeline: which post is on screen.
  useEffect(() => {
    const nodes = stream.current?.querySelectorAll<HTMLElement>('[data-post-number]')
    if (!nodes?.length) return
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).map((entry) => Number((entry.target as HTMLElement).dataset.postNumber))
      if (visible.length) setCurrent(Math.min(...visible))
    }, { rootMargin: '-20% 0px -60% 0px' })
    nodes.forEach((node) => observer.observe(node))
    return () => observer.disconnect()
  }, [posts])
  useEffect(() => {
    if (!menu) return
    const close = (event: MouseEvent) => { if (!(event.target as HTMLElement).closest('.fx-pop')) setMenu('') }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [menu])

  useForumShortcuts({
    next: () => moveFocus(1), prev: () => moveFocus(-1), help: () => setHelp((open) => !open),
    reply: () => { if (canReplyNow() && !requireLogin()) setComposer({ mode: 'reply', key: Date.now() }) },
    replyToPost: () => { const post = posts[focusIndex]; if (post && canReplyNow() && !requireLogin()) setComposer({ mode: 'reply', replyTo: post, key: Date.now() }) },
    like: () => { const post = posts[focusIndex]; if (post && !post.own) void react(post, 'heart') },
    bookmark: () => { const post = posts[focusIndex]; if (post) void toggleBookmark(post) },
    quote: () => { const post = posts[focusIndex]; if (post && canReplyNow()) quote(post) },
    top: () => router.push(`/forum/t/${thread.id}`), bottom: () => router.push(`/forum/t/${thread.id}?post=${thread.postCount}`),
    escape: () => { setHelp(false); setMenu('') },
  }, !composer && !flagging && !history)

  function moveFocus(step: number) {
    const next = Math.max(0, Math.min(posts.length - 1, focusIndex + step))
    setFocusIndex(next)
    const el = document.getElementById(`post-${posts[next]?.number}`)
    if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.focus({ preventScroll: true }) }
  }
  const canReplyNow = () => data.access.reply && (!thread.locked || data.moderator)

  async function movePosts() {
    if (!moveTarget) return
    const body = moveTarget.mode === 'existing'
      ? { postNumbers: selected, target: Number(/(\d+)/.exec(moveTarget.topic)?.[1] || 0) }
      : { postNumbers: selected, title: moveTarget.title, categoryId: moveTarget.categoryId }
    const { ok, data: result } = await api(`/api/forum/threads/${thread.id}/move`, 'POST', body)
    if (!ok) { setToast(result.error); return }
    setMoveTarget(null); setSelecting(false); setSelected([])
    setToast(`${fa(result.moved)} پیام منتقل شد`)
    router.push(`/forum/t/${result.id}`)
  }

  async function mergeTopic() {
    const target = window.prompt('شناسه یا نشانی موضوع مقصد (همهٔ پیام‌های این موضوع به آن منتقل می‌شود):')
    const id = Number(/(\d+)/.exec(target || '')?.[1] || 0)
    if (!id) return
    const { ok, data: result } = await api(`/api/forum/threads/${thread.id}/move`, 'POST', { all: true, target: id })
    if (ok) router.push(`/forum/t/${result.id}`); else setToast(result.error)
  }

  async function topicSettings(patch: Record<string, unknown>) {
    const { ok, data: result } = await api(`/api/forum/threads/${thread.id}/settings`, 'PATCH', patch)
    if (ok) { setToast('تنظیمات موضوع ذخیره شد'); router.refresh() } else setToast(result.error)
  }

  const requireLogin = () => { if (!data.signedIn) { router.push(`/login?next=${encodeURIComponent(`/forum/t/${thread.id}`)}`); return true } return false }
  const patchPost = (id: number, patch: Partial<TopicPost>) => setPosts((list) => list.map((post) => (post.id === id ? { ...post, ...patch } : post)))

  async function react(post: TopicPost, emoji: string) {
    if (requireLogin()) return
    const mine = post.reactions.find((r) => r.emoji === emoji)?.mine
    // Optimistic update, reconciled with the server's counts.
    patchPost(post.id, { reactions: mergeReaction(post.reactions, emoji, !mine) })
    setMenu('')
    const { ok, data: result } = await api(`/api/forum/posts/${post.id}/actions`, 'POST', { action: mine ? 'unreact' : 'react', emoji })
    if (!ok) { patchPost(post.id, { reactions: post.reactions }); setToast(result.error); return }
    patchPost(post.id, { reactions: data.reactionsAllowed.map((name) => result.reactions.find((r: Reaction) => r.emoji === name) || { emoji: name, count: 0, mine: false }).filter((r: Reaction) => r.count > 0 || r.emoji === 'heart') })
  }

  async function toggleBookmark(post: TopicPost) {
    if (requireLogin()) return
    const { ok, data: result } = await api(`/api/forum/posts/${post.id}/actions`, 'POST', { action: post.bookmarked ? 'unbookmark' : 'bookmark' })
    if (ok) { patchPost(post.id, { bookmarked: result.bookmarked }); setToast(result.bookmarked ? 'نشان شد؛ در «نشان‌شده‌ها» پیدایش می‌کنید' : 'نشان برداشته شد') } else setToast(result.error)
  }

  async function share(post: TopicPost) {
    const url = `${window.location.origin}/forum/t/${thread.id}?post=${post.number}`
    try { await navigator.clipboard.writeText(url); setToast('پیوند پیام کپی شد') } catch { setToast(url) }
  }

  function quote(post: TopicPost) {
    if (requireLogin()) return
    const selection = window.getSelection()
    const inPost = selection && selection.rangeCount && document.getElementById(`post-${post.number}`)?.contains(selection.anchorNode)
    const text = (inPost ? selection!.toString() : '').trim() || plainOf(post)
    setComposer({ mode: 'reply', replyTo: post, initial: quoteBlock(post, text), key: Date.now() })
  }

  const quoteBlock = (post: TopicPost, text: string) => `[quote="${post.author.username}, post:${post.number}, topic:${thread.id}"]\n${text}\n[/quote]\n\n`
  const plainOf = (post: TopicPost) => new DOMParser().parseFromString(post.html, 'text/html').body.textContent?.trim().slice(0, 600) || ''
  /** One reply that quotes every picked post, in the order they were written. */
  function quoteSelected() {
    if (requireLogin()) return
    const picked = posts.filter((post) => quoted.includes(post.number))
    if (!picked.length) { setQuoted([]); return }
    setComposer({ mode: 'reply', replyTo: picked.length === 1 ? picked[0] : undefined, initial: picked.map((post) => quoteBlock(post, plainOf(post))).join(''), key: Date.now() })
    setQuoted([])
  }

  async function solve(post: TopicPost) {
    const { ok, data: result } = await api(`/api/forum/posts/${post.id}/actions`, 'POST', { action: post.solution ? 'unsolve' : 'solve' })
    if (ok) { setToast(post.solution ? 'انتخاب راه‌حل برداشته شد' : 'به‌عنوان راه‌حل انتخاب شد ✅'); router.refresh() } else setToast(result.error)
  }

  async function moderatePost(post: TopicPost, action: 'hide' | 'show' | 'delete') {
    if (action === 'delete' && !window.confirm('این پیام برای همیشه حذف شود؟')) return
    const { ok, data: result } = action === 'delete' ? await api(`/api/forum/posts/${post.id}`, 'DELETE') : await api(`/api/forum/posts/${post.id}`, 'PATCH', { action })
    setMenu('')
    if (ok) { setToast('انجام شد'); router.refresh() } else setToast(result.error)
  }

  async function moderateTopic(patch: Record<string, unknown>) {
    const { ok, data: result } = await api(`/api/forum/threads/${thread.id}`, 'PATCH', patch)
    setMenu('')
    if (ok) { setToast('انجام شد'); router.refresh() } else setToast(result.error)
  }

  async function deleteTopic() {
    if (!window.confirm('کل موضوع و همهٔ پاسخ‌ها برای همیشه حذف شود؟')) return
    const { ok, data: result } = await api(`/api/forum/threads/${thread.id}`, 'DELETE')
    if (ok) router.push(`/forum/c/${data.category.slug}`)
    else setToast(result.error)
  }

  async function changeLevel(next: string) {
    const { ok, data: result } = await api(`/api/forum/threads/${thread.id}/state`, 'PUT', { level: next })
    if (ok) { setLevel(result.level); setToast(LEVELS.find((l) => l.id === result.level)?.hint || '') } else setToast(result.error)
    setMenu('')
  }

  async function showHistory(post: TopicPost) {
    const { ok, data: result } = await api(`/api/forum/posts/${post.id}/revisions`, 'GET')
    if (ok) setHistory({ post, items: result.revisions, current: result.current }); else setToast(result.error)
  }

  async function submitComposer(value: { title: string; content: string; categoryId: number; tags: string[] }) {
    if (!composer) return null
    if (composer.mode === 'edit' && composer.edit) {
      const body: Record<string, unknown> = { content: value.content }
      if (composer.edit.number === 1) Object.assign(body, { title: value.title, tags: value.tags, categoryId: value.categoryId })
      const { ok, data: result } = await api(`/api/forum/posts/${composer.edit.id}`, 'PATCH', body)
      if (!ok) return result.error as string
      setComposer(null); setToast('ویرایش ذخیره شد'); router.refresh()
      return null
    }
    const { ok, data: result } = await api(`/api/forum/threads/${thread.id}/posts`, 'POST', { content: value.content, replyToId: composer.replyTo?.id })
    if (!ok) return result.error as string
    setComposer(null)
    if (result.pending) setToast('پاسخ شما ثبت شد و پس از تأیید ناظران برای همه نمایش داده می‌شود')
    router.push(`/forum/t/${thread.id}?post=${result.number}`)
    router.refresh()
    return null
  }

  async function submitFlag(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!flagging) return
    const form = new FormData(event.currentTarget)
    const { ok, data: result } = await api(`/api/forum/posts/${flagging.id}/actions`, 'POST', { action: 'flag', reason: form.get('reason'), note: form.get('note') })
    setFlagging(null)
    setToast(ok ? (result.hidden ? 'گزارش ثبت شد و پیام تا بررسی تیم پنهان شد' : 'گزارش شما ثبت شد؛ ممنون که کمک می‌کنید') : result.error)
    if (ok && result.hidden) router.refresh()
  }

  const canReply = data.access.reply && (!thread.locked || data.moderator)
  // Who opened the topic: the first post when this page holds it, else found among those who took part.
  const starter = posts.find((post) => post.number === 1)?.author || data.participants.find((person) => person.id === thread.userId) || null

  return (
    <div className="fx-topic">
      <nav className="fc-crumbs" aria-label="مسیر">
        <Link href="/forum">انجمن‌ها</Link>
        {(trail.length ? trail : [data.category]).map((step) => <Link key={step.slug} href={step.slug === CLUBS_SECTION ? '/forum/clubs' : `/forum/c/${step.slug}`}>{step.title}</Link>)}
      </nav>
      <header className="tp-head" style={{ ['--cat' as string]: data.category.color }}>
        {(thread.pinned || thread.locked || data.solution || thread.status !== 'VISIBLE' || !thread.listed) && <p className="tp-flags">
          {thread.pinned && <span className="tl-flag is-pin">سنجاق‌شده</span>}
          {data.solution && <span className="tl-flag is-ok">✓ حل‌شده</span>}
          {thread.locked && <span className="tl-flag is-lock">بسته‌شده</span>}
          {thread.status === 'PENDING' ? <span className="tl-flag is-warn">در انتظار تأیید</span> : thread.status !== 'VISIBLE' && <span className="tl-flag is-warn">پنهان</span>}
          {!thread.listed && <span className="tl-flag is-warn" title="فقط با پیوند در دسترس است">فهرست‌نشده</span>}
        </p>}
        <h1>{thread.title}</h1>
        <div className="tp-by">
          {starter && <Link href={`/forum/u/${starter.username}`} className="tp-starter"><Avatar author={starter} size={44} /><span><b>{starter.name}</b><small>شروع‌کنندهٔ موضوع · {ago(thread.createdAt)}</small></span></Link>}
          <span className="tp-where">
            <Link href={`/forum/c/${data.category.slug}`} className="fx-cat"><i style={{ background: data.category.color }} />{data.category.title}</Link>
            {thread.tags.map((tag) => <Link key={tag} href={`/forum/tag/${encodeURIComponent(tag)}`} className="fx-tag">#{tag}</Link>)}
          </span>
        </div>
        {(data.signedIn || canReply) && <div className="tp-actions">
          {canReply && <button type="button" className="btn btn-primary btn-sm" onClick={() => { if (!requireLogin()) setComposer({ mode: 'reply', key: Date.now() }) }}>↩ پاسخ</button>}
          {data.signedIn && <button type="button" className={`tp-follow${level === 'WATCHING' ? ' is-on' : ''}`} aria-pressed={level === 'WATCHING'} onClick={() => void changeLevel(level === 'WATCHING' ? 'NORMAL' : 'WATCHING')} title={level === 'WATCHING' ? 'برای هر پاسخ تازه اعلان می‌گیرید' : 'با دنبال‌کردن، برای هر پاسخ تازه اعلان می‌گیرید'}>
            <span aria-hidden="true">{level === 'WATCHING' ? '🔔' : '🔕'}</span>{level === 'WATCHING' ? 'دنبال می‌کنید' : 'دنبال‌کردن موضوع'}
          </button>}
        </div>}
        <dl className="tp-stats">
          <div><dd>{fa(thread.replyCount)}</dd><dt>پاسخ</dt></div>
          <div><dd>{fa(thread.views)}</dd><dt>بازدید</dt></div>
          <div><dd>{fa(thread.likeCount)}</dd><dt>پسند</dt></div>
          <div><dd>{fa(data.participants.length)}</dd><dt>مشارکت‌کننده</dt></div>
          <div className="tp-last"><dd>{ago(thread.lastPostAt)}</dd><dt>آخرین پاسخ</dt></div>
        </dl>
      </header>

      {(thread.closeAt || thread.slowModeSeconds > 0) && <div className="fx-notices">
        {thread.closeAt && !thread.locked && <p>⏱ این موضوع {new Date(thread.closeAt).toLocaleString('fa-IR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Tehran' })} به‌طور خودکار بسته می‌شود.</p>}
        {thread.slowModeSeconds > 0 && <p>🐢 حالت کند: هر عضو هر {SLOW_MODES.find(([s]) => s === thread.slowModeSeconds)?.[1] || `${fa(thread.slowModeSeconds)} ثانیه`} یک پاسخ می‌تواند بفرستد.</p>}
      </div>}

      {data.solution && data.page > 0 && (
        <aside className="fx-solution">
          <strong>✓ راه‌حل</strong> از <Link href={`/forum/u/${data.solution.author.username}`}>{data.solution.author.name}</Link> — <Link href={`/forum/t/${thread.id}?post=${data.solution.number}`}>رفتن به پاسخ</Link>
          <p>{data.solution.excerpt}</p>
        </aside>
      )}

      <div className="fx-topic-body">
        <div className="fx-stream" ref={stream}>
          {data.page > 1 && <Link className="fx-load" href={`/forum/t/${thread.id}?page=${data.page - 1}`}>↑ پیام‌های قبلی</Link>}
          {posts.map((post) => (
            <article key={post.id} id={`post-${post.number}`} tabIndex={-1} data-post-number={post.number} className={`fx-post${post.status !== 'VISIBLE' ? ' is-hidden' : ''}${post.solution ? ' is-solution' : ''}${post.author.id === thread.userId && post.number > 1 ? ' is-op' : ''}${posts[focusIndex]?.id === post.id ? ' is-focused' : ''}${selected.includes(post.number) ? ' is-selected' : ''}`}>
              {selecting && post.number > 1 && <label className="fx-select-post"><input type="checkbox" checked={selected.includes(post.number)} onChange={() => setSelected((list) => list.includes(post.number) ? list.filter((n) => n !== post.number) : [...list, post.number])} aria-label={`انتخاب پیام ${fa(post.number)}`} /></label>}
              {/* Who is speaking: avatar, group and rank, and their standing in the forum. */}
              <aside className="fx-post-author ax" aria-label={`نویسنده: ${post.author.name}`} style={post.author.level ? { ['--lv' as string]: post.author.level.color } : undefined}>
                <Link href={`/forum/u/${post.author.username}`} className="fx-post-avatar" tabIndex={-1} aria-hidden="true"><Avatar author={post.author} size={76} /></Link>
                <Link href={`/forum/u/${post.author.username}`} className="fx-author-name">{post.author.name}{post.author.staff && <span className="fx-staff" title="تیم موبوکام">🛡</span>}</Link>
                {post.author.rank && <span className={`tp-rank is-${post.author.rank}`}>{FORUM_RANK_LABELS[post.author.rank]}</span>}
                {/* The level their activity earned (forum settings → levels). */}
                {post.author.level && <span className="ax-level">{post.author.level.icon && <i aria-hidden="true">{post.author.level.icon}</i>}{post.author.level.name}</span>}
                {post.author.flair
                  ? <span className="fx-author-group" style={{ ['--group' as string]: post.author.flair.color }}>{post.author.flair.icon && <span aria-hidden="true">{post.author.flair.icon}</span>}{post.author.flair.name}</span>
                  : <span className="fx-author-group">{TRUST_NAMES[post.author.trustLevel] || TRUST_NAMES[0]}</span>}
                {post.author.title && post.author.title !== (post.author.flair?.name || TRUST_NAMES[post.author.trustLevel]) && <span className="fx-author-title">{post.author.title}</span>}
                {post.author.id === thread.userId && <span className="tp-op">نویسندهٔ موضوع</span>}
                <dl className="fx-author-stats">
                  <div><dt>پیام</dt><dd>{fa(post.author.posts)}</dd></div>
                  <div><dt>لایک</dt><dd>{fa(post.author.likes)}</dd></div>
                  <div><dt>اعتبار</dt><dd>{fa(post.author.reputation)}</dd></div>
                </dl>
                {post.author.badges.length > 0 && <ul className="ax-badges" aria-label="نشان‌ها">{post.author.badges.map((badge) => <li key={badge.name} className={`is-${badge.tier.toLowerCase()}`} title={badge.name}><span aria-hidden="true">{badge.icon}</span><span className="sr-only">{badge.name}</span></li>)}</ul>}
                {post.author.joinedAt && <small className="fx-author-joined">عضو از {joinedLabel(post.author.joinedAt)}</small>}
              </aside>
              <div className="fx-post-main">
                <header className="fx-post-head">
                  <span className="fx-user">
                    <Link href={`/forum/u/${post.author.username}`} className="fx-user-name">{post.author.name}</Link>
                    {post.author.staff && <span className="fx-staff" title="تیم موبوکام">🛡</span>}
                    {post.author.flair && <span className="fx-flair" style={{ background: post.author.flair.color }} title={post.author.flair.name}>{post.author.flair.icon}</span>}
                    <bdi className="fx-handle" dir="ltr">@{post.author.username}</bdi>
                    {post.author.title && <span className="fx-user-title">{post.author.title}</span>}
                  </span>
                  <span className="fx-post-when">
                    {post.replyTo && <Link href={`/forum/t/${thread.id}?post=${post.replyTo.number}`} className="fx-reply-to" title="در پاسخ به">↩ <bdi dir="ltr">@{post.replyTo.username}</bdi></Link>}
                    {post.editCount > 0 && <button type="button" className="fx-edited" onClick={() => void showHistory(post)} title="تاریخچهٔ ویرایش">✎ {fa(post.editCount)}</button>}
                    <Link href={`/forum/t/${thread.id}?post=${post.number}`} title={new Date(post.createdAt).toLocaleString('fa-IR', { timeZone: 'Asia/Tehran' })}>{ago(post.createdAt)}</Link>
                    <Link href={`/forum/t/${thread.id}?post=${post.number}`} className="tp-num" title="پیوند این پیام">#{fa(post.number)}</Link>
                  </span>
                </header>
                {post.solution && <div className="fx-solution-mark">✓ راه‌حل انتخاب‌شده</div>}
                {post.status === 'PENDING' ? <div className="fx-pending-note">⏳ این پیام در صف بررسی ناظران است و فعلاً فقط {post.own ? 'شما' : 'نویسنده و ناظران'} آن را می‌بینید{data.moderator && post.pendingReason ? ` — ${post.pendingReason}` : ''}.</div>
                  : post.status !== 'VISIBLE' && <div className="fx-hidden-note">این پیام پنهان است{post.flags ? ` — ${fa(post.flags)} گزارش در انتظار بررسی` : ''}</div>}
                {post.wiki && <div className="fx-wiki-note">📝 ویکی — اعضا از سطح اعتماد ۱ می‌توانند این پیام را ویرایش کنند</div>}
                <CookedWithPolls html={post.html} polls={post.polls} signedIn={data.signedIn} canManage={data.moderator || post.own} onLogin={() => { requireLogin() }} onError={setToast} />
                <footer className="fx-post-actions">
                  <div className="fx-reactions">
                    {post.reactions.map((reaction) => (
                      <button key={reaction.emoji} type="button" className={`fx-react${reaction.mine ? ' is-mine' : ''}`} onClick={() => void react(post, reaction.emoji)} disabled={post.own} aria-pressed={reaction.mine} title={post.own ? 'به پیام خودتان نمی‌توانید واکنش بدهید' : 'واکنش'}>
                        <span aria-hidden="true">{REACTION_EMOJI[reaction.emoji] || reaction.emoji}</span>{reaction.count > 0 && <b>{fa(reaction.count)}</b>}
                      </button>
                    ))}
                    {!post.own && data.reactionsAllowed.length > 1 && (
                      <span className="fx-pop">
                        <button type="button" className="fx-react is-more" aria-label="واکنش‌های دیگر" aria-expanded={menu === `react-${post.id}`} onClick={() => setMenu(menu === `react-${post.id}` ? '' : `react-${post.id}`)}>☺+</button>
                        {menu === `react-${post.id}` && <span className="fx-menu fx-emoji-picker">{data.reactionsAllowed.map((emoji) => <button key={emoji} type="button" onClick={() => void react(post, emoji)} aria-label={emoji}>{REACTION_EMOJI[emoji]}</button>)}</span>}
                      </span>
                    )}
                  </div>
                  <div className="fx-post-buttons">
                    {data.canSolve && post.number > 1 && post.status === 'VISIBLE' && <button type="button" className={`fx-act${post.solution ? ' is-on' : ''}`} onClick={() => void solve(post)} title="انتخاب به‌عنوان راه‌حل">✓<span>{post.solution ? 'راه‌حل' : 'راه‌حل است'}</span></button>}
                    <button type="button" className={`fx-act${post.bookmarked ? ' is-on' : ''}`} onClick={() => void toggleBookmark(post)} aria-pressed={post.bookmarked} title="نشان‌کردن">🔖</button>
                    <button type="button" className="fx-act" onClick={() => void share(post)} title="کپی پیوند">🔗</button>
                    {post.canEdit && <button type="button" className="fx-act" onClick={() => setComposer({ mode: 'edit', edit: post, key: Date.now() })} title="ویرایش">✎</button>}
                    {!post.own && data.signedIn && <button type="button" className="fx-act" onClick={() => setFlagging(post)} title="گزارش به تیم">⚑</button>}
                    {data.moderator && (
                      <span className="fx-pop">
                        <button type="button" className="fx-act" aria-label="ابزار ناظر" aria-expanded={menu === `mod-${post.id}`} onClick={() => setMenu(menu === `mod-${post.id}` ? '' : `mod-${post.id}`)}>🛡</button>
                        {menu === `mod-${post.id}` && (
                          <span className="fx-menu fx-menu-list">
                            {post.number > 1 && <button type="button" onClick={() => void moderatePost(post, post.status === 'VISIBLE' ? 'hide' : 'show')}>{post.status === 'VISIBLE' ? 'پنهان‌کردن پیام' : 'نمایش پیام'}</button>}
                            {post.flags > 0 && <><button type="button" onClick={() => void api(`/api/forum/posts/${post.id}/actions`, 'POST', { action: 'disagree' }).then(() => router.refresh())}>رد گزارش‌ها و نمایش</button><button type="button" onClick={() => void api(`/api/forum/posts/${post.id}/actions`, 'POST', { action: 'agree' }).then(() => router.refresh())}>تأیید گزارش‌ها</button></>}
                            <button type="button" onClick={() => void api(`/api/forum/posts/${post.id}/actions`, 'POST', { action: post.wiki ? 'unwiki' : 'wiki' }).then(({ ok, data: r }) => { setMenu(''); if (ok) { patchPost(post.id, { wiki: r.wiki }); setToast(r.wiki ? 'پیام ویکی شد' : 'ویکی برداشته شد') } else setToast(r.error) })}>{post.wiki ? 'برداشتن ویکی' : '📝 ویکی کردن'}</button>
                            {post.number > 1 && <button type="button" className="is-danger" onClick={() => void moderatePost(post, 'delete')}>حذف پیام</button>}
                          </span>
                        )}
                      </span>
                    )}
                    {canReply && <button type="button" className="fx-act" onClick={() => quote(post)} title="نقل‌قول (متن را انتخاب کنید)">❝</button>}
                    {canReply && <button type="button" className={`fx-act tp-mq${quoted.includes(post.number) ? ' is-on' : ''}`} aria-pressed={quoted.includes(post.number)} onClick={() => setQuoted((list) => list.includes(post.number) ? list.filter((n) => n !== post.number) : [...list, post.number])} title={quoted.includes(post.number) ? 'برداشتن از نقل‌قول‌ها' : 'افزودن به نقل‌قول چندتایی'}>＋❝</button>}
                    {canReply && <button type="button" className="fx-act is-reply" onClick={() => { if (!requireLogin()) setComposer({ mode: 'reply', replyTo: post, key: Date.now() }) }}>↩<span>پاسخ</span></button>}
                  </div>
                </footer>
              </div>
            </article>
          ))}
          {data.page < data.pages && <Link className="fx-load" href={`/forum/t/${thread.id}?page=${data.page + 1}`}>پیام‌های بعدی ↓</Link>}

          {quoted.length > 0 && <div className="tp-mq-bar" role="status">
            <span>{fa(quoted.length)} پیام برای نقل‌قول انتخاب شده</span>
            <button type="button" className="btn btn-primary btn-sm" onClick={quoteSelected}>❝ پاسخ با نقل‌قول</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setQuoted([])}>پاک‌کردن</button>
          </div>}
          <div className="fx-topic-foot">
            {canReply ? <button type="button" className="btn btn-primary" onClick={() => { if (!requireLogin()) setComposer({ mode: 'reply', key: Date.now() }) }}>↩ پاسخ به موضوع</button>
              : !data.signedIn ? <Link href={`/login?next=${encodeURIComponent(`/forum/t/${thread.id}`)}`} className="btn btn-primary">برای پاسخ وارد شوید</Link>
                : <p className="fx-muted">{thread.locked ? '🔒 این موضوع بسته شده و پاسخ تازه نمی‌پذیرد.' : 'پاسخ در این دسته برای شما مجاز نیست.'}</p>}
            {data.signedIn && (
              <span className="fx-pop">
                <button type="button" className="btn btn-ghost" aria-expanded={menu === 'level'} onClick={() => setMenu(menu === 'level' ? '' : 'level')}>{LEVELS.find((l) => l.id === level)?.label}</button>
                {menu === 'level' && <span className="fx-menu fx-menu-list fx-levels">{LEVELS.map((item) => <button key={item.id} type="button" className={item.id === level ? 'is-active' : ''} onClick={() => void changeLevel(item.id)}><b>{item.label}</b><small>{item.hint}</small></button>)}</span>}
              </span>
            )}
          </div>

          {data.suggested.length > 0 && (
            <section className="fx-suggested">
              <h2>موضوع‌های دیگر در «{data.category.title}»</h2>
              <ul>{data.suggested.map((topic) => <li key={topic.id}><Link href={`/forum/t/${topic.id}`}>{topic.title}</Link><small>{fa(topic.replyCount)} پاسخ · {ago(topic.lastPostAt)}</small></li>)}</ul>
            </section>
          )}
        </div>

        <aside className="fx-timeline" aria-label="خط زمانی موضوع">
          <div className="fx-timeline-card">
            <Link href={`/forum/t/${thread.id}`} className="fx-timeline-edge">{new Date(thread.createdAt).toLocaleDateString('fa-IR', { month: 'short', year: 'numeric' })}</Link>
            <div className="fx-timeline-track" aria-hidden="true"><span style={{ height: `${Math.max(8, Math.min(100, (current / Math.max(1, thread.postCount)) * 100))}%` }} /></div>
            <p className="fx-timeline-pos"><b>{fa(current)}</b> / {fa(thread.postCount)}</p>
            {data.lastRead > 0 && data.lastRead < thread.postCount && <Link href={`/forum/t/${thread.id}?post=${data.lastRead + 1}`} className="fx-timeline-unread">↓ {fa(thread.postCount - data.lastRead)} پیام خوانده‌نشده</Link>}
            <Link href={`/forum/t/${thread.id}?post=${thread.postCount}`} className="fx-timeline-edge">{ago(thread.lastPostAt)}</Link>
          </div>
          <dl className="fx-topic-stats">
            <div><dt>پاسخ</dt><dd>{fa(thread.replyCount)}</dd></div>
            <div><dt>بازدید</dt><dd>{fa(thread.views)}</dd></div>
            <div><dt>واکنش</dt><dd>{fa(thread.likeCount)}</dd></div>
          </dl>
          {data.participants.length > 0 && <div className="fx-participants" aria-label="شرکت‌کنندگان">{data.participants.map((user) => <Link key={user.id} href={`/forum/u/${user.username}`} title={`${user.name} — ${fa(user.posts)} پیام`}><Avatar author={user} size={30} />{user.posts > 1 && <small>{fa(user.posts)}</small>}</Link>)}</div>}
          {data.moderator && (
            <div className="fx-mod-tools">
              <strong>ابزار ناظر</strong>
              <button type="button" onClick={() => void moderateTopic({ pinned: !thread.pinned })}>{thread.pinned ? 'برداشتن سنجاق' : '📌 سنجاق‌کردن'}</button>
              <button type="button" onClick={() => void moderateTopic({ locked: !thread.locked })}>{thread.locked ? '🔓 باز کردن' : '🔒 بستن موضوع'}</button>
              <button type="button" onClick={() => void moderateTopic({ status: thread.status === 'VISIBLE' ? 'HIDDEN' : 'VISIBLE' })}>{thread.status === 'VISIBLE' ? 'پنهان‌کردن موضوع' : 'نمایش موضوع'}</button>
              <select className="select" value={data.category.id} onChange={(e) => void moderateTopic({ categoryId: Number(e.target.value) })} aria-label="انتقال به دستهٔ دیگر">
                {categoryTree(categories).map(({ category: c, depth }) => <option key={c.id} value={c.id}>{'— '.repeat(depth)}{c.title}</option>)}
              </select>
              <button type="button" onClick={() => void topicSettings({ listed: !thread.listed })}>{thread.listed ? '🙈 فهرست‌نکردن' : '👁 فهرست‌کردن'}</button>
              <label className="fx-mod-field"><span>⏱ بستن خودکار</span>
                <select className="select" value="" onChange={(e) => { const v = e.target.value; if (v === 'clear') void topicSettings({ closeHours: null }); else if (v) void topicSettings({ closeHours: Number(v) }) }}>
                  <option value="">{thread.closeAt ? `تا ${new Date(thread.closeAt).toLocaleDateString('fa-IR')}` : 'انتخاب…'}</option>
                  {TIMERS.map(([hours, label]) => <option key={hours} value={hours}>پس از {label}</option>)}
                  {thread.closeAt && <option value="clear">لغو زمان‌بندی</option>}
                </select>
              </label>
              <label className="fx-mod-field"><span>🐢 حالت کند</span>
                <select className="select" value={thread.slowModeSeconds} onChange={(e) => void topicSettings({ slowMode: Number(e.target.value) })}>
                  {SLOW_MODES.map(([seconds, label]) => <option key={seconds} value={seconds}>{label}</option>)}
                </select>
              </label>
              <button type="button" aria-pressed={selecting} onClick={() => { setSelecting(!selecting); setSelected([]) }}>{selecting ? 'پایان انتخاب' : '✂ انتخاب و انتقال پیام‌ها'}</button>
              {selecting && <div className="fx-move">
                <small>{fa(selected.length)} پیام انتخاب شد</small>
                <button type="button" disabled={!selected.length} onClick={() => setMoveTarget({ mode: 'new', title: '', categoryId: data.category.id, topic: '' })}>به موضوع جدید</button>
                <button type="button" disabled={!selected.length} onClick={() => setMoveTarget({ mode: 'existing', title: '', categoryId: data.category.id, topic: '' })}>به موضوع موجود</button>
              </div>}
              <button type="button" onClick={() => void mergeTopic()}>🔀 ادغام در موضوع دیگر</button>
              <button type="button" className="is-danger" onClick={() => void deleteTopic()}>حذف موضوع</button>
            </div>
          )}
          <button type="button" className="fx-shortcut-hint" onClick={() => setHelp(true)}>⌨ میان‌برها <kbd>?</kbd></button>
        </aside>
      </div>

      {composer && (
        <div className="fx-dock" role="region" aria-label="ویرایشگر">
          <div className="container">
            <Composer
              key={composer.key}
              mode={composer.mode}
              autoFocus
              heading={composer.mode === 'edit' ? `ویرایش پیام #${fa(composer.edit!.number)}` : composer.replyTo ? `پاسخ به @${composer.replyTo.author.username}` : `پاسخ به «${thread.title}»`}
              editTopic={composer.mode === 'edit' && composer.edit?.number === 1}
              categories={composer.mode === 'edit' && composer.edit?.number === 1 ? categories : []}
              initial={composer.mode === 'edit' ? { content: composer.edit?.raw || '', title: thread.title, categoryId: data.category.id, tags: thread.tags } : { content: composer.initial }}
              draftKey={composer.mode === 'reply' ? `forum:draft:reply:${thread.id}` : undefined}
              submitLabel={composer.mode === 'edit' ? 'ذخیرهٔ ویرایش' : 'ارسال پاسخ'}
              onSubmit={submitComposer}
              onCancel={() => setComposer(null)}
            />
          </div>
        </div>
      )}

      {flagging && (
        <div className="fx-modal" role="dialog" aria-modal="true" aria-label="گزارش پیام" onClick={(e) => { if (e.target === e.currentTarget) setFlagging(null) }}>
          <form className="fx-modal-card" onSubmit={submitFlag}>
            <h2>گزارش پیام به تیم</h2>
            <p className="fx-muted">گزارش‌ها محرمانه‌اند. اگر چند کاربر مورد اعتماد گزارش دهند، پیام تا بررسی تیم پنهان می‌شود.</p>
            {FLAG_REASONS.map((reason, index) => <label key={reason.id} className="fx-radio"><input type="radio" name="reason" value={reason.id} defaultChecked={index === 0} />{reason.label}</label>)}
            <textarea className="textarea" name="note" rows={3} maxLength={500} placeholder="توضیح (برای «دلیل دیگر» لازم است)" />
            <div className="fx-modal-actions"><button className="btn btn-primary">ثبت گزارش</button><button type="button" className="btn btn-ghost" onClick={() => setFlagging(null)}>انصراف</button></div>
          </form>
        </div>
      )}

      {history && (
        <div className="fx-modal" role="dialog" aria-modal="true" aria-label="تاریخچهٔ ویرایش" onClick={(e) => { if (e.target === e.currentTarget) setHistory(null) }}>
          <div className="fx-modal-card is-wide">
            <h2>تاریخچهٔ ویرایش پیام #{fa(history.post.number)}</h2>
            <ol className="fx-revisions">
              <li><b>نسخهٔ فعلی</b><pre dir="auto">{history.current}</pre></li>
              {history.items.map((item) => <li key={item.id}><b>پیش از ویرایش {item.editor && <>توسط <bdi dir="ltr">@{item.editor}</bdi></>} · {ago(item.createdAt)}</b><pre dir="auto">{item.content}</pre></li>)}
            </ol>
            <div className="fx-modal-actions"><button type="button" className="btn btn-ghost" onClick={() => setHistory(null)}>بستن</button></div>
          </div>
        </div>
      )}

      {moveTarget && (
        <div className="fx-modal" role="dialog" aria-modal="true" aria-label="انتقال پیام‌ها" onClick={(e) => { if (e.target === e.currentTarget) setMoveTarget(null) }}>
          <form className="fx-modal-card" onSubmit={(e) => { e.preventDefault(); void movePosts() }}>
            <h2>انتقال {fa(selected.length)} پیام {moveTarget.mode === 'new' ? 'به موضوع جدید' : 'به موضوع موجود'}</h2>
            {moveTarget.mode === 'new' ? <>
              <label className="fx-field"><span>عنوان موضوع جدید</span><input className="input" required minLength={5} maxLength={150} value={moveTarget.title} onChange={(e) => setMoveTarget({ ...moveTarget, title: e.target.value })} /></label>
              <label className="fx-field"><span>دسته</span><select className="select" value={moveTarget.categoryId} onChange={(e) => setMoveTarget({ ...moveTarget, categoryId: Number(e.target.value) })}>{categoryTree(categories).map(({ category: c, depth }) => <option key={c.id} value={c.id}>{'— '.repeat(depth)}{c.title}</option>)}</select></label>
            </> : <label className="fx-field"><span>شناسه یا نشانی موضوع مقصد</span><input className="input" dir="ltr" required value={moveTarget.topic} onChange={(e) => setMoveTarget({ ...moveTarget, topic: e.target.value })} placeholder="/forum/t/123" /></label>}
            <p className="fx-muted">پیام‌ها با همان نویسنده و تاریخ، به انتهای موضوع مقصد اضافه می‌شوند و به نویسندگان اطلاع داده می‌شود.</p>
            <div className="fx-modal-actions"><button className="btn btn-primary">انتقال</button><button type="button" className="btn btn-ghost" onClick={() => setMoveTarget(null)}>انصراف</button></div>
          </form>
        </div>
      )}

      {help && <ShortcutHelp onClose={() => setHelp(false)} />}

      {toast && <div className="fx-toast" role="status">{toast}</div>}
    </div>
  )
}

function mergeReaction(list: Reaction[], emoji: string, on: boolean): Reaction[] {
  const found = list.find((r) => r.emoji === emoji)
  if (!found) return [...list, { emoji, count: on ? 1 : 0, mine: on }]
  return list.map((r) => (r.emoji === emoji ? { ...r, mine: on, count: Math.max(0, r.count + (on ? 1 : -1)) } : r))
}
