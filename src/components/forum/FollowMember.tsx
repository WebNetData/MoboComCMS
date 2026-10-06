'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Follow button of a member's forum profile. Following is the shared identity's, not the forum's: this only
 * calls the same endpoint the feed uses and shows the new count.
 */
export default function FollowMember({ username, initial, followers, signedIn, back }: { username: string; initial: boolean; followers: number; signedIn: boolean; back: string }) {
  const [following, setFollowing] = useState(initial)
  const [count, setCount] = useState(followers)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  async function toggle() {
    if (!signedIn) { router.push(`/login?next=${encodeURIComponent(back)}`); return }
    setBusy(true); setError('')
    try {
      const response = await fetch(`/api/people/${encodeURIComponent(username)}/follow`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ on: !following }) })
      const data = await response.json().catch(() => null)
      if (response.ok && data && typeof data.following === 'boolean') { setFollowing(data.following); if (typeof data.followers === 'number') setCount(data.followers) }
      else setError(data?.error || 'انجام نشد؛ دوباره تلاش کنید')
    } catch { setError('ارتباط برقرار نشد') }
    setBusy(false)
  }

  return <span className="fp-follow-wrap">
    <button type="button" className={`fp-follow${following ? ' is-following' : ''}`} aria-pressed={following} disabled={busy} onClick={() => void toggle()}>
      <span aria-hidden="true">{following ? '✓' : '+'}</span>{following ? 'دنبال می‌کنید' : 'دنبال کردن'}
      <em aria-label={`${count.toLocaleString('fa-IR')} دنبال‌کننده`}>{count.toLocaleString('fa-IR')}</em>
    </button>
    {error && <small role="alert" className="fx-warn">{error}</small>}
  </span>
}
