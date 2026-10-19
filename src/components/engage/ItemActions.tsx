'use client'

import Link from '@/components/AppLink'
import { useEffect, useState } from 'react'
import { useModuleEnabled } from '@/extensions/client/ExtensionProvider'
import { COMPARE_EVENT, readCompare, toggleCompare, type CompareEntry } from '@/components/engage/compare-store'
import AddToCollection from '@/components/engage/AddToCollection'
import { memberListsChanged } from './member-list-events'

type Props = {
  item: string
  title: string
  image?: string
  loggedIn: boolean
  favorite: { notify: boolean } | null
  favorites?: number
  canFavorite?: boolean
  canCompare?: boolean
  /** Wording for the notify switch, e.g. "نسخهٔ جدید"; without it there is nothing to follow. */
  followLabel?: string
  favoriteLabels?: { off: string; on: string }
}

/** Favorite (with "tell me about updates") and compare toggles for an item page. */
export default function ItemActions({ item, title, image = '', loggedIn, favorite: initial, favorites = 0, canFavorite = true, canCompare = false, followLabel, favoriteLabels }: Props) {
  const reviewsOn = useModuleEnabled('reviews')
  const compareOn = useModuleEnabled('compare')
  const [favorite, setFavorite] = useState(initial)
  const [count, setCount] = useState(favorites)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [compared, setCompared] = useState(false)
  const [compareNote, setCompareNote] = useState('')
  // A list command refreshes the server props; retain the owner's notification preference.
  useEffect(() => { setFavorite(initial); setCount(favorites) }, [initial, favorites])

  useEffect(() => {
    const sync = () => setCompared(readCompare().some((entry) => entry.key === item))
    sync()
    window.addEventListener(COMPARE_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => { window.removeEventListener(COMPARE_EVENT, sync); window.removeEventListener('storage', sync) }
  }, [item])

  async function save(on: boolean, notify = true) {
    if (!loggedIn) { window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`; return }
    setBusy(true); setError('')
    const response = await fetch('/api/engage/favorite', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ item, on, notify }) }).catch(() => null)
    const data = await response?.json().catch(() => null)
    setBusy(false)
    if (!response?.ok) { setError(data?.error || 'انجام نشد'); return }
    setCount((value) => Math.max(0, value + (on && !favorite ? 1 : !on && favorite ? -1 : 0)))
    setFavorite(data.favorite)
    memberListsChanged(item)
  }

  function compare() {
    const entry: CompareEntry = { key: item, title, image }
    const result = toggleCompare(entry)
    setCompareNote(result === 'full' ? 'حداکثر ۴ مورد هم‌نوع را می‌توانید مقایسه کنید' : result === 'type' ? 'فقط موارد هم‌نوع با هم مقایسه می‌شوند؛ فهرست مقایسه از نو شروع شد' : '')
  }

  const icon = (path: string, filled = false) => <svg className="ea-icon" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={path} /></svg>
  const HEART = 'M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2Z'
  return (
    <div className="ea-actions">
      {reviewsOn && canFavorite && (
        <>
          <button type="button" className={`ea-btn${favorite ? ' is-on' : ''}`} aria-pressed={!!favorite} disabled={busy} onClick={() => void save(!favorite)} title={favorite ? favoriteLabels?.on || 'حذف از علاقه‌مندی‌ها' : favoriteLabels?.off || 'افزودن به علاقه‌مندی‌ها'}>
            {favoriteLabels ? icon(favorite ? 'M5 12.5 10 17.5 19 7' : 'M12 5v14M5 12h14') : icon(HEART, !!favorite)}{favorite ? favoriteLabels?.on || 'در علاقه‌مندی‌ها' : favoriteLabels?.off || 'علاقه‌مندی'}{count > 0 && <small>{count.toLocaleString('fa-IR')}</small>}
          </button>
          {favorite && followLabel && (
            <button type="button" className={`ea-btn${favorite.notify ? ' is-on' : ''}`} aria-pressed={favorite.notify} disabled={busy} onClick={() => void save(true, !favorite.notify)} title={`اعلان ${followLabel}`}>
              {icon(favorite.notify ? 'M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Zm4 4a2 2 0 0 0 4 0' : 'M6 16V11a6 6 0 0 1 9.5-4.9M18 11v5l1.5 2H8M10 20a2 2 0 0 0 4 0M4 4l16 16', !!favorite.notify)}{favorite.notify ? `خبرم می‌کنید (${followLabel})` : `خبرم کن (${followLabel})`}
            </button>
          )}
        </>
      )}
      {compareOn && canCompare && (
        compared
          ? <span className="ea-compare-group"><button type="button" className="ea-btn is-on" aria-pressed="true" onClick={compare}>{icon('M12 4v16M5 8h14M7 8l-3 6a3 3 0 0 0 6 0L7 8Zm10 0-3 6a3 3 0 0 0 6 0l-3-6ZM8 20h8')}در فهرست مقایسه</button><Link href="/compare" className="ea-link">مقایسه ←</Link></span>
          : <button type="button" className="ea-btn" aria-pressed="false" onClick={compare}>{icon('M12 4v16M5 8h14M7 8l-3 6a3 3 0 0 0 6 0L7 8Zm10 0-3 6a3 3 0 0 0 6 0l-3-6ZM8 20h8')}افزودن به مقایسه</button>
      )}
      <AddToCollection item={item} loggedIn={loggedIn} />
      {(error || compareNote) && <p className="ea-note" role="status">{error || compareNote}</p>}
    </div>
  )
}
