'use client'

import { useState } from 'react'
import { contentPath } from '@/platform/routing/aliases'
import { sized } from '@/shared/media/image'
import Link from '@/components/AppLink'
import { useRouter } from '@/platform/routing/navigation'
import { PlayButton } from '@/components/media/PlayButton'
import type { PlayerTrack } from '@/components/media/player-types'

export default function PlaylistTracksEditor({ id, tracks, matches, fa }: { id: number; tracks: PlayerTrack[]; matches: PlayerTrack[]; fa: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState<number | null>(null)
  const [message, setMessage] = useState('')

  async function change(trackId: number, method: 'POST' | 'DELETE') {
    setBusy(trackId); setMessage('')
    try {
      const url = `/api/music/my-playlists/${id}/tracks${method === 'DELETE' ? `?trackId=${trackId}` : ''}`
      const response = await fetch(url, { method, ...(method === 'POST' ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trackId }) } : {}) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || (fa ? 'درخواست ناموفق بود' : 'Request failed'))
      router.refresh()
    } catch (error) { setMessage((error as Error).message) } finally { setBusy(null) }
  }

  const row = (track: PlayerTrack, index: number, queue: PlayerTrack[], action: 'POST' | 'DELETE') => <li key={track.id}>
    <PlayButton tracks={queue} index={index} />
    {track.cover ? <img className="mu-tl-cover" src={sized(track.cover, 120)} alt="" loading="lazy" /> : <span className="mu-tl-cover mu-noart">♫</span>}
    <span className="mu-tl-meta"><Link href={contentPath('track', track.slug, { artist: track.artistSlug })}><b>{track.title}</b></Link><Link className="muted" href={`/music/artist/${track.artistSlug}`}>{track.artist}</Link></span>
    <button className={`btn btn-sm ${action === 'POST' ? 'btn-primary' : 'btn-ghost'}`} type="button" disabled={busy !== null} onClick={() => void change(track.id, action)}>{action === 'POST' ? (fa ? 'افزودن' : 'Add') : (fa ? 'برداشتن' : 'Remove')}</button>
  </li>

  return <>
    {message && <p className="error-text" role="alert">{message}</p>}
    <section className="mu-panel"><header className="md-shelf-head"><h2>{fa ? 'آهنگ‌های پلی‌لیست' : 'Playlist tracks'}</h2><span className="muted">{tracks.length.toLocaleString(fa ? 'fa-IR' : 'en-US')}</span></header>
      {tracks.length ? <ol className="mu-tracklist mu-personal-tracks">{tracks.map((track, index) => row(track, index, tracks, 'DELETE'))}</ol> : <p className="muted">{fa ? 'هنوز آهنگی اضافه نشده است. از جست‌وجوی پایین استفاده کنید.' : 'No tracks yet. Use the search below.'}</p>}
    </section>
    {matches.length > 0 && <section className="mu-panel"><header className="md-shelf-head"><h2>{fa ? 'نتیجه‌های جست‌وجو' : 'Search results'}</h2></header>{matches.some((track) => !tracks.some((current) => current.id === track.id)) ? <ol className="mu-tracklist mu-personal-tracks">{matches.filter((track) => !tracks.some((current) => current.id === track.id)).map((track) => row(track, matches.findIndex((item) => item.id === track.id), matches, 'POST'))}</ol> : <p className="muted">{fa ? 'همهٔ نتیجه‌ها در این پلی‌لیست هستند.' : 'All results are already in this playlist.'}</p>}</section>}
  </>
}
