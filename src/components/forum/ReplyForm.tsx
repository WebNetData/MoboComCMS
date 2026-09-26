'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

export const QUOTE_EVENT = 'forum:quote'

/** Reply box; "quote" buttons append to it through a window event. */
export default function ReplyForm({ threadId, fa }: { threadId: number; fa: boolean }) {
  const router = useRouter()
  const [content, setContent] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const area = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const onQuote = (event: Event) => {
      const { author, text } = (event as CustomEvent<{ author: string; text: string }>).detail
      const quoted = `> ${author}:\n${text.split('\n').slice(0, 12).map((line) => `> ${line}`).join('\n')}\n\n`
      setContent((value) => (value ? `${value.trimEnd()}\n\n${quoted}` : quoted))
      area.current?.focus()
      area.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
    window.addEventListener(QUOTE_EVENT, onQuote)
    return () => window.removeEventListener(QUOTE_EVENT, onQuote)
  }, [])
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true); setError('')
    const response = await fetch(`/api/forum/threads/${threadId}/posts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }) }).catch(() => null)
    const data = await response?.json().catch(() => null)
    setBusy(false)
    if (!response?.ok) { setError(data?.error || (fa ? 'ارسال نشد؛ دوباره تلاش کنید.' : 'Could not send.')); return }
    setContent('')
    router.push(`/forum/t/${threadId}?page=${data.page}#post-${data.id}`)
    router.refresh()
  }
  return <form className="fr-reply card" onSubmit={submit}>
    <label htmlFor="fr-reply-text"><b>{fa ? 'پاسخ شما' : 'Your reply'}</b></label>
    <textarea id="fr-reply-text" ref={area} className="input" rows={6} value={content} onChange={(event) => setContent(event.target.value)} maxLength={20000} required placeholder={fa ? 'متن پاسخ… (برای نقل‌قول، خط را با > شروع کنید)' : 'Write a reply… (start a line with > to quote)'}/>
    {error && <p className="error-text" role="alert">{error}</p>}
    <div className="fr-reply-foot"><small className="muted">{fa ? 'لینک‌ها خودکار فعال می‌شوند. لطفاً محترمانه بنویسید.' : 'Links are detected automatically. Please be respectful.'}</small><button className="btn btn-primary" disabled={busy || content.trim().length < 2}>{busy ? (fa ? 'در حال ارسال…' : 'Sending…') : (fa ? 'ارسال پاسخ' : 'Post reply')}</button></div>
  </form>
}
