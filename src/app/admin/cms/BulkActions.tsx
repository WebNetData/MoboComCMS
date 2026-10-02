'use client'

import { useState } from 'react'

export type BulkAction = 'publish' | 'draft' | 'delete'

/** Send bounded batches; the server retains the same permissions and content hooks. */
export async function runBulkAction(api: string, type: string, ids: number[], action: BulkAction, onProgress: (done: number) => void) {
  const succeeded: number[] = []
  const failed: { id: number; reason: string }[] = []
  const batches: number[][] = []
  for (let index = 0; index < ids.length; index += 100) batches.push(ids.slice(index, index + 100))
  let cursor = 0
  let done = 0
  const workers = Array.from({ length: Math.min(2, batches.length) }, async () => {
    while (cursor < batches.length) {
      const batch = batches[cursor++]
      try {
        const response = await fetch(`${api}/bulk?type=${encodeURIComponent(type)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: batch, action }),
        })
        const body = await response.json().catch(() => null)
        if (response.ok && Array.isArray(body?.failed) && Number(body.changed) === batch.length - body.failed.length) {
          const rejected = new Set<number>()
          for (const item of body.failed) {
            const id = Number(item?.id)
            if (batch.includes(id)) { rejected.add(id); failed.push({ id, reason: String(item.reason || 'Failed') }) }
          }
          for (const id of batch) if (!rejected.has(id)) succeeded.push(id)
        } else {
          for (const id of batch) failed.push({ id, reason: String(body?.error || `HTTP ${response.status}`) })
        }
      } catch {
        for (const id of batch) failed.push({ id, reason: 'Network error' })
      }
      onProgress(done += batch.length)
    }
  })
  await Promise.all(workers)
  return { succeeded, failed }
}

export default function BulkActions({ count, canPublish, fa, busy, progress, onApply, onClear }: {
  count: number
  canPublish: boolean
  fa: boolean
  busy: boolean
  progress: number
  onApply: (action: BulkAction) => Promise<void>
  onClear: () => void
}) {
  const [action, setAction] = useState<BulkAction | ''>('')

  if (!count) return null
  async function apply() {
    if (!action || busy) return
    const verb = action === 'delete' ? (fa ? 'حذف' : 'delete') : action === 'draft' ? (fa ? 'پیش‌نویس' : 'move to draft') : (fa ? 'انتشار' : 'publish')
    const question = fa
      ? `عملیات «${verb}» روی ${count.toLocaleString('fa-IR')} مورد انتخاب‌شده انجام شود؟${action === 'delete' ? ' حذف قابل بازگشت نیست.' : ''}`
      : `${verb} ${count.toLocaleString('en-US')} selected items?${action === 'delete' ? ' Deletion cannot be undone.' : ''}`
    if (!window.confirm(question)) return
    await onApply(action)
    setAction('')
  }

  return <div className="cms-bulk" role="region" aria-label={fa ? 'عملیات گروهی' : 'Bulk actions'}>
    <strong>{count.toLocaleString(fa ? 'fa-IR' : 'en-US')} {fa ? 'مورد انتخاب‌شده' : 'selected'}</strong>
    <select className="select" value={action} disabled={busy} onChange={(event) => setAction(event.target.value as BulkAction | '')} aria-label={fa ? 'نوع عملیات گروهی' : 'Bulk action'}>
      <option value="">{fa ? 'انتخاب عملیات…' : 'Choose action…'}</option>
      {canPublish && <><option value="publish">{fa ? 'انتشار' : 'Publish'}</option><option value="draft">{fa ? 'انتقال به پیش‌نویس' : 'Move to draft'}</option></>}
      <option value="delete">{fa ? 'حذف' : 'Delete'}</option>
    </select>
    <button type="button" className="btn btn-primary btn-sm" disabled={busy || !action} onClick={() => void apply()}>{busy ? `${progress}/${count}` : (fa ? 'اعمال' : 'Apply')}</button>
    <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={onClear}>{fa ? 'لغو انتخاب' : 'Clear selection'}</button>
  </div>
}
