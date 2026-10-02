'use client'

import Link from '@/components/AppLink'
import { useEffect, useState } from 'react'
import { useModuleEnabled } from '@/extensions/client/ExtensionProvider'
import { COMPARE_EVENT, readCompare, toggleCompare, type CompareEntry } from '@/components/engage/compare-store'
import AddToCollection from '@/components/engage/AddToCollection'

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
  }

  function compare() {
    const entry: CompareEntry = { key: item, title, image }
    const result = toggleCompare(entry)
    setCompareNote(result === 'full' ? 'حداکثر ۴ مورد هم‌نوع را می‌توانید مقایسه کنید' : result === 'type' ? 'فقط موارد هم‌نوع با هم مقایسه می‌شوند؛ فهرست مقایسه از نو شروع شد' : '')
  }

  return (
    <div className="ea-actions">
      {reviewsOn && canFavorite && (
        <>
          <button type="button" className={`ea-btn${favorite ? ' is-on' : ''}`} aria-pressed={!!favorite} disabled={busy} onClick={() => void save(!favorite)} title={favorite ? favoriteLabels?.on || 'حذف از علاقه‌مندی‌ها' : favoriteLabels?.off || 'افزودن به علاقه‌مندی‌ها'}>
            <span aria-hidden="true">{favoriteLabels ? favorite ? '✓' : '+' : favorite ? '♥' : '♡'}</span>{favorite ? favoriteLabels?.on || 'در علاقه‌مندی‌ها' : favoriteLabels?.off || 'علاقه‌مندی'}{count > 0 && <small>{count.toLocaleString('fa-IR')}</small>}
          </button>
          {favorite && followLabel && (
            <button type="button" className={`ea-btn${favorite.notify ? ' is-on' : ''}`} aria-pressed={favorite.notify} disabled={busy} onClick={() => void save(true, !favorite.notify)} title={`اعلان ${followLabel}`}>
              <span aria-hidden="true">{favorite.notify ? '🔔' : '🔕'}</span>{favorite.notify ? `خبرم می‌کنید (${followLabel})` : `خبرم کن (${followLabel})`}
            </button>
          )}
        </>
      )}
      {compareOn && canCompare && (
        compared
          ? <span className="ea-compare-group"><button type="button" className="ea-btn is-on" aria-pressed="true" onClick={compare}><span aria-hidden="true">⚖</span>در فهرست مقایسه</button><Link href="/compare" className="ea-link">مقایسه ←</Link></span>
          : <button type="button" className="ea-btn" aria-pressed="false" onClick={compare}><span aria-hidden="true">⚖</span>افزودن به مقایسه</button>
      )}
      <AddToCollection item={item} loggedIn={loggedIn} />
      {(error || compareNote) && <p className="ea-note" role="status">{error || compareNote}</p>}
    </div>
  )
}
