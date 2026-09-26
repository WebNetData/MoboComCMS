'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function NewThreadForm({ boards, initial, fa }: { boards: { id: number; title: string; slug: string }[]; initial?: number; fa: boolean }) {
  const router = useRouter()
  const [categoryId, setCategoryId] = useState(initial || boards[0]?.id || 0)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true); setError('')
    const response = await fetch('/api/forum/threads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ categoryId, title, content }) }).catch(() => null)
    const data = await response?.json().catch(() => null)
    setBusy(false)
    if (!response?.ok) { setError(data?.error || (fa ? 'ارسال نشد؛ دوباره تلاش کنید.' : 'Could not create the thread.')); return }
    router.push(`/forum/t/${data.id}`)
  }
  return <form className="fr-new card" onSubmit={submit}>
    <label className="studio-field"><span>{fa ? 'انجمن' : 'Board'}</span><select className="input" value={categoryId} onChange={(event) => setCategoryId(Number(event.target.value))} required>{boards.map((board) => <option key={board.id} value={board.id}>{board.title}</option>)}</select></label>
    <label className="studio-field"><span>{fa ? 'عنوان' : 'Title'}</span><input className="input" value={title} onChange={(event) => setTitle(event.target.value)} minLength={5} maxLength={150} required placeholder={fa ? 'موضوع را در یک جمله بنویسید' : 'Summarize the topic in one line'}/></label>
    <label className="studio-field"><span>{fa ? 'متن' : 'Message'}</span><textarea className="input" rows={10} value={content} onChange={(event) => setContent(event.target.value)} maxLength={20000} required placeholder={fa ? 'جزئیات، مراحل انجام‌شده یا سؤال خود را بنویسید…' : 'Details, what you tried, your question…'}/></label>
    {error && <p className="error-text" role="alert">{error}</p>}
    <div className="fr-reply-foot"><small className="muted">{fa ? 'پیش از ارسال، جست‌وجو کنید شاید پاسخ قبلاً داده شده باشد.' : 'Search first — your question may already be answered.'}</small><button className="btn btn-primary" disabled={busy || !categoryId}>{busy ? (fa ? 'در حال ارسال…' : 'Posting…') : (fa ? 'ایجاد موضوع' : 'Create thread')}</button></div>
  </form>
}
