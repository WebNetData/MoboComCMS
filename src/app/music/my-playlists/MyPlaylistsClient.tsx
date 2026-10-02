'use client'

import { useRef, useState } from 'react'
import Link from '@/components/AppLink'

type Row = { id: number; title: string; trackCount: number; updatedAt: string | Date }

export default function MyPlaylistsClient({ initial, fa }: { initial: Row[]; fa: boolean }) {
  const [rows, setRows] = useState(initial)
  const [title, setTitle] = useState('')
  const [editing, setEditing] = useState<number | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const creating = useRef(false)

  async function request(url: string, method: string, body?: object) {
    const response = await fetch(url, { method, ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || (fa ? 'درخواست ناموفق بود' : 'Request failed'))
    return data
  }

  async function create(event: React.FormEvent) {
    event.preventDefault()
    if (creating.current) return
    creating.current = true
    setBusy(true); setMessage('')
    try {
      const row = await request('/api/music/my-playlists', 'POST', { title })
      setRows((current) => [{ ...row, trackCount: 0, updatedAt: new Date().toISOString() }, ...current])
      setTitle('')
    } catch (error) { setMessage((error as Error).message) } finally { creating.current = false; setBusy(false) }
  }

  async function rename(id: number) {
    setBusy(true); setMessage('')
    try {
      const row = await request(`/api/music/my-playlists/${id}`, 'PATCH', { title: editTitle })
      setRows((current) => current.map((item) => item.id === id ? { ...item, title: row.title } : item))
      setEditing(null)
    } catch (error) { setMessage((error as Error).message) } finally { setBusy(false) }
  }

  async function remove(id: number) {
    if (!window.confirm(fa ? 'این پلی‌لیست شخصی حذف شود؟' : 'Delete this personal playlist?')) return
    setBusy(true); setMessage('')
    try {
      await request(`/api/music/my-playlists/${id}`, 'DELETE')
      setRows((current) => current.filter((item) => item.id !== id))
    } catch (error) { setMessage((error as Error).message) } finally { setBusy(false) }
  }

  return <div className="mu-personal">
    <form className="mu-personal-create mu-panel" onSubmit={create}>
      <label htmlFor="my-playlist-title">{fa ? 'نام پلی‌لیست تازه' : 'New playlist name'}</label>
      <input id="my-playlist-title" className="input" value={title} minLength={2} maxLength={80} required onChange={(event) => setTitle(event.target.value)} placeholder={fa ? 'مثلاً آهنگ‌های موردعلاقه' : 'For example, favorites'} />
      <button className="btn btn-primary" type="submit" disabled={busy}>{fa ? 'ساخت پلی‌لیست' : 'Create playlist'}</button>
    </form>
    {message && <p className="error-text" role="alert">{message}</p>}
    {rows.length ? <div className="mu-personal-grid">{rows.map((row) => <article className="mu-panel mu-personal-card" key={row.id}>
      {editing === row.id ? <form onSubmit={(event) => { event.preventDefault(); void rename(row.id) }} className="mu-personal-edit"><input className="input" value={editTitle} minLength={2} maxLength={80} onChange={(event) => setEditTitle(event.target.value)} aria-label={fa ? 'نام پلی‌لیست' : 'Playlist name'} /><button className="btn btn-primary btn-sm" disabled={busy}>{fa ? 'ذخیره' : 'Save'}</button><button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(null)}>{fa ? 'لغو' : 'Cancel'}</button></form> : <><Link href={`/music/my-playlists/${row.id}`} className="mu-personal-link"><span className="mu-personal-icon">♫</span><strong>{row.title}</strong></Link><small className="muted">{row.trackCount.toLocaleString(fa ? 'fa-IR' : 'en-US')} {fa ? 'آهنگ' : 'tracks'}</small><div className="mu-personal-actions"><Link className="btn btn-primary btn-sm" href={`/music/my-playlists/${row.id}`}>{fa ? 'باز کردن' : 'Open'}</Link><button className="btn btn-ghost btn-sm" type="button" disabled={busy} onClick={() => { setEditing(row.id); setEditTitle(row.title) }}>{fa ? 'تغییر نام' : 'Rename'}</button><button className="btn btn-ghost btn-sm" type="button" disabled={busy} onClick={() => void remove(row.id)}>{fa ? 'حذف' : 'Delete'}</button></div></>}
    </article>)}</div> : <p className="mu-panel muted">{fa ? 'هنوز پلی‌لیستی نساخته‌اید.' : 'You have not created a playlist yet.'}</p>}
  </div>
}
