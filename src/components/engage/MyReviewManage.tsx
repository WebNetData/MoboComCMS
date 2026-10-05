'use client'

import { useState } from 'react'
import { useRouter } from '@/platform/routing/navigation'
import ReviewForm from '@/components/engage/ReviewForm'

type Mine = { rating: number; body: string; status: string; verified?: string; scores?: Record<string, number> }

/**
 * Edit and delete for one of the member's own shared reviews, from the account list. Both go
 * through the same review API as the item page. An item that is no longer public can only be
 * deleted: `editable` is false and its title is not known here.
 */
export default function MyReviewManage({ item, mine, editable, title, path, dimensions, fa }: { item: string; mine: Mine; editable: boolean; title: string; path: string; dimensions: { key: string; label: string; hint: string }[]; fa: boolean }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function remove() {
    if (!window.confirm(fa ? 'نظر و امتیاز شما حذف شود؟' : 'Delete your rating and review?')) return
    setBusy(true); setError('')
    const response = await fetch(`/api/engage/review?item=${encodeURIComponent(item)}`, { method: 'DELETE' }).catch(() => null)
    if (response?.ok) { router.refresh(); return }
    setBusy(false)
    setError(fa ? 'حذف نشد؛ دوباره امتحان کنید' : 'Could not delete; try again')
  }

  if (editing) return <div className="myrev-edit"><ReviewForm item={item} mine={mine} loggedIn title={title} path={path} dimensions={dimensions} startEditing onDone={() => setEditing(false)} /></div>
  return <div className="myrev-actions">
    {editable && <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setEditing(true)}>{fa ? 'ویرایش' : 'Edit'}</button>}
    <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void remove()}>{busy ? (fa ? 'در حال حذف…' : 'Deleting…') : (fa ? 'حذف' : 'Delete')}</button>
    {error && <span className="error-text" role="alert">{error}</span>}
  </div>
}
