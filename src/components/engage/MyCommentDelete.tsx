'use client'

import { useState } from 'react'
import { useRouter } from '@/platform/routing/navigation'

/** Delete for one of the member's own article comments, from the account list. */
export default function MyCommentDelete({ id, fa }: { id: number; fa: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function remove() {
    if (!window.confirm(fa ? 'این دیدگاه حذف شود؟ متن آن پاک می‌شود و قابل بازگشت نیست.' : 'Delete this comment? Its text is erased and cannot be brought back.')) return
    setBusy(true); setError('')
    const response = await fetch(`/api/account/article-comments/${id}`, { method: 'DELETE' }).catch(() => null)
    if (response?.ok) { router.refresh(); return }
    setBusy(false)
    setError(fa ? 'حذف نشد؛ دوباره امتحان کنید' : 'Could not delete; try again')
  }

  return <div className="myrev-actions">
    <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void remove()}>{busy ? (fa ? 'در حال حذف…' : 'Deleting…') : (fa ? 'حذف' : 'Delete')}</button>
    {error && <span className="error-text" role="alert">{error}</span>}
  </div>
}
