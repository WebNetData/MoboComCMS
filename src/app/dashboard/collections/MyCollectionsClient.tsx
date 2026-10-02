'use client'

import { useState, type FormEvent } from 'react'
import Link from '@/components/AppLink'

type Row = { id: number; ownerId: number; title: string; description: string; cover: string; visibility: string; updatedAt: Date | string; _count: { items: number } }
type Saved = { id: number; title: string; description: string; cover: string; visibility: string; shareToken: string | null; owner: { name: string }; _count: { items: number } }

export default function MyCollectionsClient({ initial, saved, ownerId, fa }: { initial: Row[]; saved: Saved[]; ownerId: number; fa: boolean }) {
  const [rows, setRows] = useState(initial)
  const [title, setTitle] = useState('')
  const [visibility, setVisibility] = useState('PRIVATE')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setBusy(true); setError('')
    try {
      const response = await fetch('/api/collections', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title, visibility }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Request failed')
      window.location.assign(`/collections/${result.id}`)
    } catch (cause) { setError((cause as Error).message); setBusy(false) }
  }

  return <div className="collections-manage"><form className="ud-card collections-create" onSubmit={create}><h2>{fa ? 'مجموعهٔ تازه' : 'New collection'}</h2><label htmlFor="collection-title">{fa ? 'عنوان' : 'Title'}</label><input className="input" id="collection-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} required /><label htmlFor="collection-visibility">{fa ? 'نمایش' : 'Visibility'}</label><select id="collection-visibility" className="input" value={visibility} onChange={(event) => setVisibility(event.target.value)}><option value="PRIVATE">{fa ? 'خصوصی' : 'Private'}</option><option value="UNLISTED">{fa ? 'فقط با لینک' : 'Unlisted'}</option><option value="PUBLIC">{fa ? 'عمومی' : 'Public'}</option></select><button className="btn btn-primary" disabled={busy}>{fa ? 'ساخت مجموعه' : 'Create collection'}</button>{error && <p role="alert" className="error-text">{error}</p>}</form>
    <section className="collections-owned" aria-label={fa ? 'فهرست مجموعه‌ها' : 'Collection list'}>{rows.length ? rows.map((row) => <Link href={`/collections/${row.id}`} key={row.id} className="collections-card"><span className="collections-cover" aria-hidden="true">{row.cover ? <img src={row.cover} alt="" loading="lazy" /> : '▦'}</span><span className="collections-card-body"><strong>{row.title}</strong><small>{row.ownerId !== ownerId ? (fa ? 'همکار · ' : 'Collaborator · ') : ''}{row.visibility === 'PUBLIC' ? (fa ? 'عمومی' : 'Public') : row.visibility === 'UNLISTED' ? (fa ? 'فقط با لینک' : 'Unlisted') : (fa ? 'خصوصی' : 'Private')} · {row._count.items.toLocaleString(fa ? 'fa-IR' : 'en-US')} {fa ? 'مورد' : 'items'}</small><span>{row.description}</span></span></Link>) : <p className="collections-empty">{fa ? 'هنوز مجموعه‌ای نساخته‌اید.' : 'You have not created a collection yet.'}</p>}</section>{saved.length > 0 && <section className="collections-saved"><h2>{fa ? 'مجموعه‌های ذخیره‌شده' : 'Saved collections'}</h2><div className="collections-grid">{saved.map((row) => <Link href={`/collections/${row.id}${row.visibility === 'UNLISTED' && row.shareToken ? `?share=${encodeURIComponent(row.shareToken)}` : ''}`} key={row.id} className="collections-card"><span className="collections-cover" aria-hidden="true">{row.cover ? <img src={row.cover} alt="" loading="lazy" /> : '▦'}</span><span className="collections-card-body"><strong>{row.title}</strong><small>{row.owner.name} · {row._count.items.toLocaleString(fa ? 'fa-IR' : 'en-US')} {fa ? 'مورد' : 'items'}</small><span>{row.description}</span></span></Link>)}</div></section>}</div>
}
