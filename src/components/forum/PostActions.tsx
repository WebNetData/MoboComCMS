'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { QUOTE_EVENT } from './ReplyForm'

/** Per-post actions: quote, edit (author/moderator), hide/show/delete (moderator). */
export default function PostActions({ post, fa, canQuote, moderator }: { post: { id: number; content: string; status: string; first: boolean; editable: boolean; author: string }; fa: boolean; canQuote: boolean; moderator: boolean }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [content, setContent] = useState(post.content)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function call(method: 'PATCH' | 'DELETE', body?: unknown) {
    setBusy(true); setError('')
    const response = await fetch(`/api/forum/posts/${post.id}`, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }).catch(() => null)
    const data = await response?.json().catch(() => null)
    setBusy(false)
    if (!response?.ok) { setError(data?.error || (fa ? 'انجام نشد.' : 'Failed.')); return false }
    router.refresh()
    return true
  }
  return <>
    {editing && <form className="fr-edit" onSubmit={async (event) => { event.preventDefault(); if (await call('PATCH', { content })) setEditing(false) }}>
      <textarea className="input" rows={6} value={content} onChange={(event) => setContent(event.target.value)} maxLength={20000}/>
      <div><button className="btn btn-primary btn-sm" disabled={busy}>{fa ? 'ذخیره' : 'Save'}</button><button type="button" className="btn btn-ghost btn-sm" onClick={() => { setEditing(false); setContent(post.content) }}>{fa ? 'انصراف' : 'Cancel'}</button></div>
    </form>}
    {error && <p className="error-text" role="alert">{error}</p>}
    {!editing && <div className="fr-post-actions">
      {canQuote && post.status === 'VISIBLE' && <button type="button" onClick={() => window.dispatchEvent(new CustomEvent(QUOTE_EVENT, { detail: { author: post.author, text: post.content } }))}>{fa ? 'نقل‌قول' : 'Quote'}</button>}
      {post.editable && <button type="button" onClick={() => setEditing(true)}>{fa ? 'ویرایش' : 'Edit'}</button>}
      {moderator && !post.first && <button type="button" disabled={busy} onClick={() => void call('PATCH', { action: post.status === 'VISIBLE' ? 'hide' : 'show' })}>{post.status === 'VISIBLE' ? (fa ? 'پنهان‌کردن' : 'Hide') : (fa ? 'نمایش' : 'Show')}</button>}
      {moderator && !post.first && <button type="button" className="is-danger" disabled={busy} onClick={() => { if (window.confirm(fa ? 'این پیام برای همیشه حذف شود؟' : 'Delete this post permanently?')) void call('DELETE') }}>{fa ? 'حذف' : 'Delete'}</button>}
    </div>}
  </>
}
