'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

/** Moderator toolbar on a thread page. */
export default function ThreadModBar({ thread, boards, fa }: { thread: { id: number; pinned: boolean; locked: boolean; status: string; boardSlug: string }; boards: { id: number; slug: string; title: string }[]; fa: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function call(method: 'PATCH' | 'DELETE', body?: unknown) {
    setBusy(true); setError('')
    const response = await fetch(`/api/forum/threads/${thread.id}`, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }).catch(() => null)
    const data = await response?.json().catch(() => null)
    setBusy(false)
    if (!response?.ok) { setError(data?.error || (fa ? 'انجام نشد.' : 'Failed.')); return false }
    return true
  }
  const update = async (body: unknown) => { if (await call('PATCH', body)) router.refresh() }
  return <div className="fr-modbar" role="toolbar" aria-label={fa ? 'مدیریت موضوع' : 'Moderation'}>
    <span className="fr-modbar-label">{fa ? 'مدیریت:' : 'Moderate:'}</span>
    <button type="button" disabled={busy} onClick={() => void update({ pinned: !thread.pinned })}>{thread.pinned ? (fa ? 'برداشتن سنجاق' : 'Unpin') : (fa ? 'سنجاق' : 'Pin')}</button>
    <button type="button" disabled={busy} onClick={() => void update({ locked: !thread.locked })}>{thread.locked ? (fa ? 'باز کردن' : 'Unlock') : (fa ? 'قفل' : 'Lock')}</button>
    <button type="button" disabled={busy} onClick={() => void update({ status: thread.status === 'VISIBLE' ? 'HIDDEN' : 'VISIBLE' })}>{thread.status === 'VISIBLE' ? (fa ? 'پنهان' : 'Hide') : (fa ? 'نمایش' : 'Show')}</button>
    <select className="input" value="" disabled={busy} aria-label={fa ? 'انتقال به انجمن' : 'Move to board'} onChange={(event) => { if (event.target.value) void update({ categoryId: Number(event.target.value) }) }}>
      <option value="">{fa ? 'انتقال به…' : 'Move to…'}</option>
      {boards.filter((board) => board.slug !== thread.boardSlug).map((board) => <option key={board.id} value={board.id}>{board.title}</option>)}
    </select>
    <button type="button" className="is-danger" disabled={busy} onClick={async () => { if (window.confirm(fa ? 'کل موضوع و پاسخ‌هایش حذف شود؟' : 'Delete the whole thread?') && await call('DELETE')) { router.push(`/forum/c/${thread.boardSlug}`); router.refresh() } }}>{fa ? 'حذف موضوع' : 'Delete thread'}</button>
    {error && <span className="error-text" role="alert">{error}</span>}
  </div>
}
