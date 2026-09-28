'use client'

import Link from '@/components/AppLink'
import { useState } from 'react'

// GameUp-style "played / playing / want to play" shelf buttons with live counts.

type Status = 'PLAYING' | 'PLAYED' | 'WANT' | 'DROPPED'
type Mine = { status: Status; hours: number } | null
const LABELS: [Status, string, string][] = [['PLAYED', 'بازی کرده‌ام', '✓'], ['PLAYING', 'در حال بازی', '▶'], ['WANT', 'می‌خواهم بازی کنم', '★'], ['DROPPED', 'رها کردم', '⏸']]
const fa = (n: number) => n.toLocaleString('fa-IR')

export default function LibraryButtons({ gameId, initial, counts: initialCounts, loggedIn, next, upcoming }: { gameId: number; initial: Mine; counts: Record<Status, number>; loggedIn: boolean; next: string; upcoming: boolean }) {
  const [mine, setMine] = useState<Mine>(initial)
  const [counts, setCounts] = useState(initialCounts)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [hours, setHours] = useState(initial?.hours ? String(initial.hours) : '')

  async function save(status: Status | null, extra?: { hours: string }) {
    setBusy(true); setError('')
    const response = await fetch('/api/games/library', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ gameId, status, ...(extra ? { hours: extra.hours || 0 } : {}) }) }).catch(() => null)
    const data = await response?.json().catch(() => null)
    setBusy(false)
    if (!response?.ok) { setError(data?.error || 'ذخیره نشد؛ دوباره تلاش کنید'); return }
    setMine(data.mine); setCounts(data.counts)
  }

  // Upcoming games can only be wanted (you cannot have played them yet).
  const options = upcoming ? LABELS.filter(([status]) => status === 'WANT') : LABELS
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  return <div className="gv-library" role="group" aria-label="کتابخانهٔ بازی من">
    <div className="gv-library-buttons">
      {options.map(([status, label, icon]) => {
        const on = mine?.status === status
        const body = <><span aria-hidden="true">{icon}</span>{label}{counts[status] > 0 && <small className="num">{fa(counts[status])}</small>}</>
        return loggedIn
          ? <button key={status} type="button" className={on ? 'is-on' : ''} aria-pressed={on} disabled={busy} onClick={() => void save(on ? null : status)}>{body}</button>
          : <Link key={status} href={`/login?next=${encodeURIComponent(next)}`}>{body}</Link>
      })}
    </div>
    {mine && (mine.status === 'PLAYED' || mine.status === 'PLAYING') && <form className="gv-library-hours" onSubmit={(event) => { event.preventDefault(); void save(mine.status, { hours }) }}>
      <label><span>ساعت بازی من</span><input className="input" inputMode="numeric" value={hours} onChange={(event) => setHours(event.target.value)} placeholder="مثلاً ۴۰" aria-label="ساعت بازی" /></label>
      <button type="submit" className="gx-btn" disabled={busy}>ثبت</button>
    </form>}
    {error && <p className="gv-error" role="alert">{error}</p>}
    {total > 0 && <small className="gv-library-note">{fa(total)} نفر این بازی را در کتابخانه‌شان دارند{mine ? <> · <Link href="/dashboard/games">کتابخانهٔ من</Link></> : null}</small>}
  </div>
}
