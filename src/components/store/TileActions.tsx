'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useModuleEnabled } from '@/extensions/client/ExtensionProvider'
import { COMPARE_EVENT, readCompare, toggleCompare } from '@/components/engage/compare-store'
import { memberListsChanged } from '@/components/engage/member-list-events'

const Heart = ({ on }: { on: boolean }) => <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false" fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20.5s-7.5-4.6-9.2-9.6C1.6 7.3 4 4 7.4 4c2 0 3.6 1.1 4.6 2.7C13 5.1 14.6 4 16.6 4 20 4 22.4 7.3 21.2 10.9 19.5 15.9 12 20.5 12 20.5Z" /></svg>
const Scales = () => <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M7 4v16M17 4v16M4 8h6M14 16h6M4 8l3 6 3-6M14 16l3-6 3 6" /></svg>

/**
 * A product card's quick actions: save to favourites (the member's list, the same call as the product page) and add
 * to the comparison (kept in this browser). Each follows its module being on.
 */
export default function TileActions({ item, title, image }: { item: string; title: string; image: string }) {
  const reviewsOn = useModuleEnabled('reviews'), compareOn = useModuleEnabled('compare')
  const { status } = useSession()
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [compared, setCompared] = useState(false)
  const [note, setNote] = useState('')

  useEffect(() => {
    if (!compareOn) return
    const sync = () => setCompared(readCompare().some((entry) => entry.key === item))
    sync()
    window.addEventListener(COMPARE_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => { window.removeEventListener(COMPARE_EVENT, sync); window.removeEventListener('storage', sync) }
  }, [item, compareOn])

  async function save() {
    if (status !== 'authenticated') { window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`; return }
    setBusy(true); setNote('')
    const response = await fetch('/api/engage/favorite', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ item, on: !saved, notify: true }) }).catch(() => null)
    setBusy(false)
    if (!response?.ok) { setNote('ذخیره نشد'); return }
    setSaved(!saved); setNote(saved ? 'از علاقه‌مندی‌ها برداشته شد' : 'به علاقه‌مندی‌ها اضافه شد')
    memberListsChanged(item)
  }

  function compare() {
    const result = toggleCompare({ key: item, title, image })
    setNote(result === 'full' ? 'حداکثر ۴ کالا را می‌توانید مقایسه کنید' : result === 'type' ? 'فقط کالاها با هم مقایسه می‌شوند' : result === 'added' ? 'به مقایسه اضافه شد' : 'از مقایسه برداشته شد')
  }

  if (!reviewsOn && !compareOn) return null
  return <div className="sx-tile-actions">
    {reviewsOn && <button type="button" className={`sx-tile-act${saved ? ' is-on' : ''}`} aria-pressed={saved} aria-label={saved ? `برداشتن ${title} از علاقه‌مندی‌ها` : `افزودن ${title} به علاقه‌مندی‌ها`} title="علاقه‌مندی" disabled={busy} onClick={() => void save()}><Heart on={saved} /></button>}
    {compareOn && <button type="button" className={`sx-tile-act${compared ? ' is-on' : ''}`} aria-pressed={compared} aria-label={compared ? `برداشتن ${title} از مقایسه` : `افزودن ${title} به مقایسه`} title="مقایسه" onClick={compare}><Scales /></button>}
    <span className="sx-sr" role="status">{note}</span>
  </div>
}
