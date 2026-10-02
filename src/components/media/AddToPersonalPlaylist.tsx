'use client'

import { useState } from 'react'
import Link from '@/components/AppLink'

type Playlist = { id: number; title: string; trackCount: number }

export default function AddToPersonalPlaylist({ trackId, trackSlug, loggedIn, fa }: { trackId: number; trackSlug: string; loggedIn: boolean; fa: boolean }) {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<Playlist[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  if (!loggedIn) return <Link className="btn btn-ghost" href={`/login?next=${encodeURIComponent(`/music/track/${trackSlug}`)}`}>{fa ? 'ورود برای ذخیره در پلی‌لیست' : 'Sign in to save to a playlist'}</Link>

  async function show() {
    if (open) { setOpen(false); return }
    setOpen(true); setMessage('')
    try {
      const response = await fetch('/api/music/my-playlists')
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || (fa ? 'بارگذاری ناموفق بود' : 'Could not load'))
      setRows(data)
    } catch (error) { setMessage((error as Error).message) }
  }

  async function add(id: number) {
    setBusy(true); setMessage('')
    try {
      const response = await fetch(`/api/music/my-playlists/${id}/tracks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trackId }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || (fa ? 'افزودن ناموفق بود' : 'Could not add'))
      setMessage(fa ? (data.added ? 'آهنگ به پلی‌لیست اضافه شد.' : 'این آهنگ از قبل در پلی‌لیست است.') : (data.added ? 'Added to playlist.' : 'Already in this playlist.'))
    } catch (error) { setMessage((error as Error).message) } finally { setBusy(false) }
  }

  return <div className="mu-add-playlist"><button type="button" className="btn btn-ghost" aria-expanded={open} onClick={() => void show()}>{fa ? '+ افزودن به پلی‌لیست' : '+ Add to playlist'}</button>{open && <div className="mu-add-popover"><strong>{fa ? 'پلی‌لیست‌های من' : 'My playlists'}</strong>{rows?.length ? rows.map((row) => <button type="button" key={row.id} disabled={busy} onClick={() => void add(row.id)}>{row.title}</button>) : rows && <p className="muted">{fa ? 'هنوز پلی‌لیستی نساخته‌اید.' : 'No playlists yet.'}</p>}<Link href="/music/my-playlists">{fa ? 'ساخت پلی‌لیست تازه ←' : 'Create a new playlist →'}</Link>{message && <p role="status">{message}</p>}</div>}</div>
}
