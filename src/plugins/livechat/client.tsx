'use client'

import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import type { PluginClientModule, PluginProps } from '../types'

type Message = { id: number; sender: 'VISITOR' | 'BOT' | 'AGENT' | 'SYSTEM'; body: string; at: string }
type State = { botName: string; welcome: string; online: boolean; offlineMessage: string; askContact: boolean; conversation: { status: string; rated: boolean; hasContact: boolean } | null; messages: Message[] }

const STATUS: Record<string, string> = { BOT: 'پاسخ‌گویی با دستیار هوشمند', WAITING: 'در انتظار اپراتور', OPEN: 'اپراتور در گفت‌وگوست', CLOSED: 'گفت‌وگو بسته شد' }
const time = (value: string) => new Date(value).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })

/** Links to this site in chat text become clickable; everything else stays plain text. */
function Text({ body }: { body: string }) {
  const parts = body.split(/(\s\/[a-z0-9/_?=&#-]+|https?:\/\/[^\s]+)/gi)
  return <>{parts.map((part, index) => {
    const url = part.trim()
    if (url.startsWith('/') || (/^https?:\/\//.test(url) && typeof window !== 'undefined' && url.startsWith(window.location.origin))) return <a key={index} href={url}> {url}</a>
    return <span key={index}>{part}</span>
  })}</>
}

function LiveChat(_props: PluginProps) {
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<State | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [status, setStatus] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [unread, setUnread] = useState(0)
  const [contact, setContact] = useState({ name: '', contact: '' })
  const [contactSaved, setContactSaved] = useState(false)
  const [rated, setRated] = useState(false)
  const [live, setLive] = useState(false)
  const [agentTyping, setAgentTyping] = useState(false)
  const list = useRef<HTMLDivElement>(null)
  const lastId = useRef(0)
  const openRef = useRef(open)
  const typingSent = useRef(0)
  useEffect(() => { openRef.current = open }, [open])

  /** Adds new messages once (the stream, the send response and polling may all deliver the same one). */
  const merge = useCallback((incoming: Message[]) => {
    if (!incoming.length) return
    lastId.current = Math.max(lastId.current, ...incoming.map((m) => m.id))
    setMessages((current) => {
      const fresh = incoming.filter((m) => !current.some((c) => c.id === m.id))
      // The visitor's own message may arrive on the stream before the send finishes: drop its placeholder.
      const kept = current.filter((c) => !(c.id < 0 && fresh.some((m) => m.sender === 'VISITOR' && m.body === c.body)))
      return fresh.length || kept.length !== current.length ? [...kept, ...fresh] : current
    })
    const replies = incoming.filter((m) => m.sender !== 'VISITOR').length
    if (replies && !openRef.current) setUnread((count) => count + replies)
  }, [])

  const load = useCallback(async () => {
    const response = await fetch('/api/chat', { cache: 'no-store' }).catch(() => null)
    if (!response?.ok) return
    const data: State = await response.json()
    setState(data)
    setMessages(data.messages)
    setStatus(data.conversation?.status || null)
    setRated(!!data.conversation?.rated)
    setContactSaved(!!data.conversation?.hasContact)
    lastId.current = data.messages.at(-1)?.id || 0
  }, [])

  useEffect(() => {
    void load()
    if (new URLSearchParams(window.location.search).get('chat') === '1') setOpen(true)
  }, [load])

  // Live updates over server-sent events once a conversation exists; the browser reconnects by itself.
  const hasConversation = status !== null
  useEffect(() => {
    if (!hasConversation || typeof EventSource === 'undefined') return
    let failures = 0
    let typingTimer: ReturnType<typeof setTimeout> | undefined
    const source = new EventSource(`/api/chat/stream?since=${lastId.current}`)
    source.addEventListener('ready', () => { failures = 0; setLive(true) })
    source.addEventListener('message', (event) => { merge([JSON.parse((event as MessageEvent).data)]); setAgentTyping(false) })
    source.addEventListener('status', (event) => setStatus(JSON.parse((event as MessageEvent).data).status))
    source.addEventListener('typing', () => { setAgentTyping(true); clearTimeout(typingTimer); typingTimer = setTimeout(() => setAgentTyping(false), 4000) })
    source.onerror = () => {
      setLive(false)
      // Three failed connections in a row: fall back to polling.
      if (++failures >= 3) source.close()
    }
    return () => { source.close(); clearTimeout(typingTimer); setLive(false) }
  }, [hasConversation, merge])

  // Fallback polling (no EventSource, or the stream keeps failing): every 3 s while open, 25 s for the badge.
  useEffect(() => {
    if (!status || live) return
    const timer = setInterval(async () => {
      const response = await fetch(`/api/chat?since=${lastId.current}`, { cache: 'no-store' }).catch(() => null)
      if (!response?.ok) return
      const data: { status: string | null; messages: Message[] } = await response.json()
      if (data.status) setStatus(data.status)
      merge(data.messages)
    }, open ? 3000 : 25_000)
    return () => clearInterval(timer)
  }, [status, open, live, merge])

  /** Lets the operator see "typing…" (at most every 3 s, only when a person is on the other side). */
  function onType(value: string) {
    setText(value)
    if (!value.trim() || (status !== 'OPEN' && status !== 'WAITING') || Date.now() - typingSent.current < 3000) return
    typingSent.current = Date.now()
    void fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'typing' }) }).catch(() => null)
  }

  useEffect(() => { if (open) { setUnread(0); list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' }) } }, [open, messages.length, sending])

  async function send(event?: FormEvent) {
    event?.preventDefault()
    const body = text.trim()
    if (!body || sending) return
    setSending(true); setError(''); setText('')
    const optimistic: Message = { id: -Date.now(), sender: 'VISITOR', body, at: new Date().toISOString() }
    setMessages((current) => [...current, optimistic])
    const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body, pageUrl: window.location.pathname }) }).catch(() => null)
    const data = await response?.json().catch(() => null)
    setSending(false)
    if (!response?.ok) { setError(data?.error || 'ارسال نشد؛ دوباره تلاش کنید'); setMessages((current) => current.filter((m) => m.id !== optimistic.id)); setText(body); return }
    setMessages((current) => current.filter((m) => m.id !== optimistic.id))
    merge(data.messages)
    setStatus(data.status)
  }

  async function operator() {
    setSending(true)
    const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'operator' }) }).catch(() => null)
    const data = await response?.json().catch(() => null)
    setSending(false)
    if (response?.ok) { merge(data.messages || []); setStatus('WAITING') }
  }

  async function saveContact(event: FormEvent) {
    event.preventDefault()
    const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'contact', ...contact }) }).catch(() => null)
    const data = await response?.json().catch(() => null)
    if (response?.ok) setContactSaved(true); else setError(data?.error || 'ثبت نشد')
  }

  async function rate(value: number) {
    const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'rate', rating: value }) }).catch(() => null)
    if (response?.ok) setRated(true)
  }

  const onKey = (event: KeyboardEvent<HTMLTextAreaElement>) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send() } }
  if (!state) return null
  const current = status || 'NEW'
  const showContact = !contactSaved && state.askContact && (current === 'WAITING' || current === 'OPEN')

  return <div className="lc-root" dir="rtl">
    {open && <section className="lc-panel" role="dialog" aria-label="گفت‌وگوی آنلاین">
      <header className="lc-head">
        <span className="lc-avatar" aria-hidden="true">{current === 'OPEN' ? '👤' : '✦'}</span>
        <div><b>{current === 'OPEN' || current === 'WAITING' ? 'پشتیبانی آنلاین' : state.botName}</b><small><i className={`lc-dot${state.online ? ' is-on' : ''}`} />{STATUS[current] || (state.online ? 'آنلاین — معمولاً در چند ثانیه پاسخ می‌دهیم' : 'اپراتورها آفلاین؛ دستیار پاسخ می‌دهد')}</small></div>
        <button type="button" className="lc-close" onClick={() => setOpen(false)} aria-label="بستن گفت‌وگو">✕</button>
      </header>
      <div className="lc-list" ref={list} aria-live="polite">
        <div className="lc-msg is-bot"><p>{state.welcome}</p></div>
        {messages.map((message) => message.sender === 'SYSTEM'
          ? <p key={message.id} className="lc-system">{message.body}</p>
          : <div key={message.id} className={`lc-msg ${message.sender === 'VISITOR' ? 'is-me' : message.sender === 'AGENT' ? 'is-agent' : 'is-bot'}`}>
            {message.sender !== 'VISITOR' && <small className="lc-who">{message.sender === 'AGENT' ? 'اپراتور' : state.botName}</small>}
            <p><Text body={message.body} /></p><time>{time(message.at)}</time>
          </div>)}
        {(sending || agentTyping) && <div className="lc-msg is-bot lc-typing" aria-label={agentTyping ? 'اپراتور در حال نوشتن است' : 'در حال نوشتن'}><span /><span /><span /></div>}
        {showContact && <form className="lc-contact" onSubmit={saveContact}>
          <b>برای اینکه پاسخ را از دست ندهید</b>
          <input className="input" value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} placeholder="نام شما" aria-label="نام" />
          <input className="input" dir="ltr" value={contact.contact} onChange={(e) => setContact({ ...contact, contact: e.target.value })} placeholder="موبایل یا ایمیل" aria-label="موبایل یا ایمیل" required />
          <button type="submit" className="btn btn-primary btn-sm">ثبت</button>
        </form>}
        {current === 'CLOSED' && !rated && <div className="lc-rate"><b>از این گفت‌وگو راضی بودید؟</b><div className="rv-tiles is-sm">{[1, 2, 3, 4, 5].map((star) => <button key={star} type="button" className={`tone-${star}`} onClick={() => void rate(star)} aria-label={`${star.toLocaleString('fa-IR')} از ۵`}><b aria-hidden="true">{star.toLocaleString('fa-IR')}</b></button>)}</div></div>}
        {current === 'CLOSED' && rated && <p className="lc-system">سپاس از بازخورد شما 🌷</p>}
      </div>
      {error && <p className="lc-error" role="alert">{error}</p>}
      {current === 'BOT' && <button type="button" className="lc-human" onClick={() => void operator()} disabled={sending}>👤 گفت‌وگو با اپراتور</button>}
      <form className="lc-input" onSubmit={send}>
        <textarea value={text} onChange={(e) => onType(e.target.value)} onKeyDown={onKey} rows={1} maxLength={2000} placeholder={current === 'CLOSED' ? 'برای شروع گفت‌وگوی تازه بنویسید…' : 'پیام خود را بنویسید…'} aria-label="پیام" />
        <button type="submit" disabled={sending || !text.trim()} aria-label="ارسال"><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M3.4 20.4 21 12 3.4 3.6l.1 6.5L15 12l-11.5 1.9z" transform="rotate(180 12 12)" /></svg></button>
      </form>
    </section>}
    <button type="button" className={`lc-bubble${open ? ' is-open' : ''}`} onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label={open ? 'بستن گفت‌وگو' : 'گفت‌وگوی آنلاین'}>
      {open ? '✕' : <><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M5 18.5 3.5 21l.8-4A8 8 0 1 1 7 19.2" /><path d="M8 10h8M8 14h5" /></svg><span>پشتیبانی آنلاین</span></>}
      {unread > 0 && !open && <i className="lc-badge">{unread.toLocaleString('fa-IR')}</i>}
    </button>
  </div>
}

export const plugin: PluginClientModule = { ui: [{ slot: 'site.after-footer', Component: LiveChat, order: 5 }] }
