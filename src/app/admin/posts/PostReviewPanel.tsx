'use client'

import { useId, useState } from 'react'
import { useI18n } from '@/i18n/LocaleProvider'

/**
 * The manager's decision on an article an author sent for review: approve (it goes live, or on its schedule) or
 * return it to draft with a note the author receives. Shown on the form of a waiting article only.
 */
export default function PostReviewPanel({ id }: { id: number }) {
  const { locale } = useI18n()
  const fa = locale === 'fa'
  const L = (persian: string, english: string) => (fa ? persian : english)
  const noteId = useId()
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  async function decide(review: 'approve' | 'return') {
    if (review === 'approve' && !window.confirm(L('این نوشته تأیید و منتشر شود؟', 'Approve and publish this article?'))) return
    setBusy(review); setError('')
    try {
      const response = await fetch('/api/admin/cms?type=posts', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, review, ...(review === 'return' && note.trim() ? { note: note.trim() } : {}) }) })
      if (!response.ok) throw new Error((await response.json().catch(() => null))?.error || L('ثبت تصمیم ممکن نشد', 'The decision was not saved'))
      // The list behind the form changed; the waiting list is where a reviewer goes next.
      window.location.assign('/admin/posts?state=pending')
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
      setBusy('')
    }
  }

  return <section className="post-review-panel" aria-labelledby={`${noteId}-title`}>
    <h3 id={`${noteId}-title`}>{L('بازبینی سردبیر', 'Editorial review')}</h3>
    <p className="muted text-sm">{L('نویسنده این نوشته را برای بازبینی فرستاده است. اگر تغییری در فرم داده‌اید، پیش از تصمیم ذخیره کنید.', 'The author sent this article for review. Save any changes you made in the form before deciding.')}</p>
    <label className="label" htmlFor={noteId}>{L('یادداشت برای نویسنده (اگر برمی‌گردانید)', 'Note to the author (when returning)')}</label>
    <textarea id={noteId} className="input" rows={3} maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} placeholder={L('چه چیزی باید اصلاح شود؟', 'What should change?')} />
    {error && <p className="error-text" role="alert">{error}</p>}
    <div className="post-review-actions">
      <button type="button" className="btn btn-primary" disabled={!!busy} onClick={() => void decide('approve')}>{busy === 'approve' ? L('در حال انتشار…', 'Publishing…') : L('تأیید و انتشار', 'Approve and publish')}</button>
      <button type="button" className="btn btn-ghost" disabled={!!busy} onClick={() => void decide('return')}>{busy === 'return' ? L('در حال بازگرداندن…', 'Returning…') : L('بازگرداندن به نویسنده', 'Return to the author')}</button>
    </div>
  </section>
}
