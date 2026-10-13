'use client'

import { useEffect, useId, useRef, useState } from 'react'
import Link from '@/components/AppLink'
import { useI18n } from '@/i18n/LocaleProvider'
import { useModuleEnabled } from '@/extensions/client/ExtensionProvider'

// Keep a track without leaving what is playing: the heart (favourites) and "add to…" — the member's own
// playlists and collections, with a new playlist made on the spot. It only calls what already exists:
// /api/engage/favorite, /api/music/my-playlists and /api/collections. Who is signed in is the server's answer
// (401 sends a visitor to sign in), never a guess made while the page is still loading the session.

type Playlist = { id: number; title: string; trackCount: number }
type Collection = { id: number; title: string; _count: { items: number } }

const HEART = 'M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2Z'
const json = (method: string, body: unknown): RequestInit => ({ method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
const toLogin = () => window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`)

export default function TrackActions({ trackId, title, heart = true, placement = 'up' }: { trackId: number; title: string; heart?: boolean; placement?: 'up' | 'down' }) {
  const { locale } = useI18n()
  const fa = locale === 'fa'
  const L = (f: string, e: string) => (fa ? f : e)
  const favoritesOn = useModuleEnabled('reviews')
  const item = `track:${trackId}`
  const panelId = useId()
  const root = useRef<HTMLSpanElement>(null)
  const opener = useRef<HTMLButtonElement>(null)
  const [favorite, setFavorite] = useState(false)
  const [open, setOpen] = useState(false)
  const [playlists, setPlaylists] = useState<Playlist[] | null>(null)
  const [collections, setCollections] = useState<Collection[] | null>(null)
  const [busy, setBusy] = useState('')
  const [done, setDone] = useState<Record<string, boolean>>({})
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const [side, setSide] = useState(placement)
  const [room, setRoom] = useState(0)

  // The heart follows the track: a new track in the player asks once whether it is already a favourite.
  useEffect(() => {
    setFavorite(false); setDone({}); setMessage(''); setOpen(false)
    if (!heart || !favoritesOn) return
    let active = true
    fetch(`/api/engage/favorite?item=${item}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((data) => { if (active) setFavorite(!!data?.favorite) }).catch(() => null)
    return () => { active = false }
  }, [item, heart, favoritesOn])

  useEffect(() => {
    if (!open) return
    const away = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); opener.current?.focus() } }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', key, true)
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', key, true) }
  }, [open])

  async function toggleFavorite() {
    const on = !favorite
    setBusy('favorite'); setFavorite(on)
    const response = await fetch('/api/engage/favorite', json('POST', { item, on, notify: false })).catch(() => null)
    setBusy('')
    if (response?.status === 401) { setFavorite(!on); toLogin(); return }
    if (!response?.ok) { setFavorite(!on); setMessage(L('ذخیره نشد؛ دوباره تلاش کنید.', 'Not saved. Try again.')); setOpen(true) }
  }

  async function toggleMenu() {
    if (open) { setOpen(false); return }
    // In a list the menu opens towards the room there is: up when the row sits near the bottom of the screen.
    // …and is never taller than that room (the player bar, when it is there, covers the foot of the screen).
    const box = opener.current?.getBoundingClientRect()
    if (box && placement === 'down') {
      const below = window.innerHeight - box.bottom - (document.querySelector('.mu-player') ? 112 : 0), above = box.top
      const down = below >= 420 || below >= above
      setSide(down ? 'down' : 'up'); setRoom(Math.max(180, Math.floor((down ? below : above) - 20)))
    }
    setOpen(true); setMessage('')
    const [mine, lists] = await Promise.all([
      fetch('/api/music/my-playlists', { cache: 'no-store' }).then((r) => (r.status === 401 ? 'guest' : r.ok ? r.json() : null)).catch(() => null),
      fetch('/api/collections', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ])
    if (mine === 'guest') { toLogin(); return }
    setPlaylists(Array.isArray(mine) ? mine : [])
    setCollections(Array.isArray(lists) ? lists : [])
    if (!Array.isArray(mine) && !Array.isArray(lists)) setMessage(L('فهرست‌ها بارگذاری نشد.', 'Could not load your lists.'))
  }

  async function add(kind: 'playlist' | 'collection', id: number) {
    const key = `${kind}:${id}`
    setBusy(key); setMessage('')
    const response = await (kind === 'playlist'
      ? fetch(`/api/music/my-playlists/${id}/tracks`, json('POST', { trackId }))
      : fetch(`/api/collections/${id}/items`, json('POST', { item }))).catch(() => null)
    const data = await response?.json().catch(() => null)
    setBusy('')
    if (!response?.ok) { setMessage(data?.error || L('اضافه نشد.', 'Not added.')); return }
    setDone((now) => ({ ...now, [key]: true }))
    setMessage(data?.added === false ? L('از قبل در این فهرست بود.', 'Already in this list.') : L('اضافه شد.', 'Added.'))
  }

  async function createPlaylist(event: React.FormEvent) {
    event.preventDefault()
    const wanted = name.trim()
    if (!wanted) return
    setBusy('new'); setMessage('')
    const response = await fetch('/api/music/my-playlists', json('POST', { title: wanted })).catch(() => null)
    const row = await response?.json().catch(() => null)
    if (!response?.ok || !row?.id) { setBusy(''); setMessage(row?.error || L('پلی‌لیست ساخته نشد.', 'Could not create the playlist.')); return }
    setPlaylists((now) => [{ id: row.id, title: row.title, trackCount: 0 }, ...(now || [])])
    setName('')
    await add('playlist', row.id)
  }

  const row = (kind: 'playlist' | 'collection', id: number, label: string, count: number) => {
    const key = `${kind}:${id}`
    return <li key={key}><button type="button" disabled={busy === key || done[key]} onClick={() => void add(kind, id)}><span className="mu-ta-name">{label}</span><small className="num">{done[key] ? '✓' : count.toLocaleString(fa ? 'fa-IR' : 'en-US')}</small></button></li>
  }

  return <span className="mu-ta" ref={root}>
    {heart && favoritesOn && <button type="button" className={`mu-ic mu-ta-heart${favorite ? ' is-on' : ''}`} aria-pressed={favorite} disabled={busy === 'favorite'} onClick={() => void toggleFavorite()} aria-label={favorite ? L(`حذف «${title}» از علاقه‌مندی‌ها`, `Remove ${title} from favourites`) : L(`افزودن «${title}» به علاقه‌مندی‌ها`, `Add ${title} to favourites`)} title={favorite ? L('در علاقه‌مندی‌ها', 'In favourites') : L('علاقه‌مندی', 'Favourite')}>
      <svg viewBox="0 0 24 24" width="19" height="19" fill={favorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={HEART} /></svg>
    </button>}
    <button ref={opener} type="button" className={`mu-ic mu-ta-add${open ? ' is-on' : ''}`} aria-expanded={open} aria-controls={panelId} onClick={() => void toggleMenu()} aria-label={L(`افزودن «${title}» به پلی‌لیست یا مجموعه`, `Add ${title} to a playlist or collection`)} title={L('افزودن به پلی‌لیست یا مجموعه', 'Add to playlist or collection')}>
      <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 6h11M4 11h11M4 16h7M18 12v8M14 16h8" /></svg>
    </button>
    {open && <div id={panelId} className={`mu-ta-panel is-${side}`} style={room ? { maxHeight: room } : undefined} role="dialog" aria-label={L('افزودن به…', 'Add to…')}>
      <form className="mu-ta-new" onSubmit={(event) => void createPlaylist(event)}>
        <input className="input" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} placeholder={L('پلی‌لیست تازه…', 'New playlist…')} aria-label={L('نام پلی‌لیست تازه', 'New playlist name')} />
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy === 'new' || !name.trim()}>{L('بساز و اضافه کن', 'Create & add')}</button>
      </form>
      {playlists === null ? <p className="mu-ta-note">{L('در حال بارگذاری…', 'Loading…')}</p> : <>
        <h4>{L('پلی‌لیست‌های من', 'My playlists')}</h4>
        {playlists.length ? <ul>{playlists.map((entry) => row('playlist', entry.id, entry.title, entry.trackCount))}</ul> : <p className="mu-ta-note">{L('هنوز پلی‌لیستی ندارید؛ همین بالا یکی بسازید.', 'No playlist yet. Make one above.')}</p>}
        {!!collections?.length && <><h4>{L('مجموعه‌های من', 'My collections')}</h4><ul>{collections.map((entry) => row('collection', entry.id, entry.title, entry._count.items))}</ul></>}
      </>}
      {message && <p className="mu-ta-note" role="status">{message}</p>}
      <footer><Link href="/music/my-playlists" onClick={() => setOpen(false)}>{L('مدیریت پلی‌لیست‌ها', 'Manage playlists')}</Link><Link href="/dashboard/collections" onClick={() => setOpen(false)}>{L('مجموعه‌ها', 'Collections')}</Link></footer>
    </div>}
  </span>
}
