'use client'

import { useState, type FormEvent } from 'react'

type Collection = { id: number; title: string; description: string; cover: string; shareToken: string | null; visibility: string; reactionCount: number; isOwner: boolean; canEdit: boolean; members: { userId: number; name: string; email: string }[] }

async function request(url: string, method: string, body?: object) {
  const response = await fetch(url, { method, ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}) })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'Request failed')
  return data
}

export default function CollectionControls({ collection, loggedIn, followed: initialFollowed, saved: initialSaved, reacted: initialReacted, fa }: { collection: Collection; loggedIn: boolean; followed: boolean; saved: boolean; reacted: boolean; fa: boolean }) {
  const [followed, setFollowed] = useState(initialFollowed)
  const [saved, setSaved] = useState(initialSaved)
  const [reacted, setReacted] = useState(initialReacted)
  const [reactionCount, setReactionCount] = useState(collection.reactionCount)
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(collection.title)
  const [description, setDescription] = useState(collection.description)
  const [cover, setCover] = useState(collection.cover)
  const [visibility, setVisibility] = useState(collection.visibility)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [email, setEmail] = useState('')

  async function follow() {
    if (!loggedIn) { window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`); return }
    setBusy(true); setError('')
    try { await request(`/api/collections/${collection.id}/follow`, followed ? 'DELETE' : 'PUT'); setFollowed(!followed) } catch (cause) { setError((cause as Error).message) } finally { setBusy(false) }
  }

  async function saveList() {
    if (!loggedIn) { window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`); return }
    setBusy(true); setError('')
    try { await request(`/api/collections/${collection.id}/save${collection.shareToken ? `?share=${encodeURIComponent(collection.shareToken)}` : ''}`, saved ? 'DELETE' : 'PUT'); setSaved(!saved) } catch (cause) { setError((cause as Error).message) } finally { setBusy(false) }
  }

  async function react() {
    if (!loggedIn) { window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`); return }
    setBusy(true); setError('')
    try {
      const result = await request(`/api/collections/${collection.id}/reaction`, reacted ? 'DELETE' : 'PUT')
      setReacted(result.reacted)
      setReactionCount(result.count)
    } catch (cause) { setError((cause as Error).message) } finally { setBusy(false) }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('')
    try { await request(`/api/collections/${collection.id}`, 'PATCH', { title, description, cover, visibility }); window.location.reload() } catch (cause) { setError((cause as Error).message); setBusy(false) }
  }

  async function remove() {
    if (!window.confirm(fa ? 'این مجموعه حذف شود؟' : 'Delete this collection?')) return
    setBusy(true); setError('')
    try { await request(`/api/collections/${collection.id}`, 'DELETE'); window.location.assign('/dashboard/collections') } catch (cause) { setError((cause as Error).message); setBusy(false) }
  }

  async function addMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('')
    try { await request(`/api/collections/${collection.id}/collaborators`, 'POST', { email }); window.location.reload() } catch (cause) { setError((cause as Error).message); setBusy(false) }
  }

  async function removeMember(userId: number) {
    setBusy(true); setError('')
    try { await request(`/api/collections/${collection.id}/collaborators?userId=${userId}`, 'DELETE'); window.location.reload() } catch (cause) { setError((cause as Error).message); setBusy(false) }
  }

  return <div className="collections-controls">
    {['PUBLIC', 'EDITORIAL'].includes(collection.visibility) && <button type="button" className="btn btn-ghost" disabled={busy} aria-pressed={reacted} onClick={() => void react()}><span aria-hidden="true">{reacted ? '♥' : '♡'}</span> {fa ? 'پسندیدن' : 'Like'} {reactionCount.toLocaleString(fa ? 'fa-IR' : 'en-US')}</button>}
    {collection.canEdit && collection.visibility === 'UNLISTED' && collection.shareToken && <button type="button" className="btn btn-ghost" onClick={() => { void navigator.clipboard.writeText(`${window.location.origin}/collections/${collection.id}?share=${encodeURIComponent(collection.shareToken!)}`).then(() => setError(fa ? 'لینک کپی شد.' : 'Link copied.')).catch(() => setError(fa ? 'کپی لینک انجام نشد.' : 'Could not copy link.')) }}>{fa ? 'کپی لینک خصوصی' : 'Copy unlisted link'}</button>}
    {!collection.isOwner && <button type="button" className="btn btn-ghost" disabled={busy} aria-pressed={saved} onClick={() => void saveList()}>{saved ? (fa ? 'ذخیره‌شده' : 'Saved') : (fa ? 'ذخیرهٔ مجموعه' : 'Save collection')}</button>}
    {!collection.canEdit && collection.visibility === 'PUBLIC' && <button type="button" className="btn btn-primary" disabled={busy} aria-pressed={followed} onClick={() => void follow()}>{followed ? (fa ? 'دنبال می‌کنید' : 'Following') : (fa ? 'دنبال‌کردن' : 'Follow')}</button>}
    {collection.isOwner && <button type="button" className="btn btn-ghost" onClick={() => setEditing(!editing)}>{fa ? 'ویرایش' : 'Edit'}</button>}
    {editing && collection.isOwner && <div className="collections-editor"><form onSubmit={save}><label>{fa ? 'عنوان' : 'Title'}<input className="input" value={title} maxLength={120} required onChange={(event) => setTitle(event.target.value)} /></label><label>{fa ? 'توضیح' : 'Description'}<textarea className="input" value={description} maxLength={2000} onChange={(event) => setDescription(event.target.value)} /></label><label>{fa ? 'نشانی تصویر جلد' : 'Cover image URL'}<input className="input" type="text" inputMode="url" value={cover} maxLength={1000} onChange={(event) => setCover(event.target.value)} placeholder="https://…" /></label><label>{fa ? 'نمایش' : 'Visibility'}<select className="input" value={visibility} onChange={(event) => setVisibility(event.target.value)}><option value="PRIVATE">{fa ? 'خصوصی' : 'Private'}</option><option value="UNLISTED">{fa ? 'فقط با لینک' : 'Unlisted'}</option><option value="PUBLIC">{fa ? 'عمومی' : 'Public'}</option></select></label><div><button className="btn btn-primary" disabled={busy}>{fa ? 'ذخیره' : 'Save'}</button><button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void remove()}>{fa ? 'حذف مجموعه' : 'Delete collection'}</button></div></form><form onSubmit={addMember}><label>{fa ? 'افزودن همکار با ایمیل' : 'Add collaborator by email'}<input className="input" type="email" value={email} maxLength={254} required onChange={(event) => setEmail(event.target.value)} /></label><button className="btn btn-ghost btn-sm" disabled={busy}>{fa ? 'افزودن' : 'Add'}</button></form>{collection.members.map((member) => <div className="collections-member" key={member.userId}><span>{member.name || member.email}</span><button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void removeMember(member.userId)}>{fa ? 'حذف همکار' : 'Remove'}</button></div>)}</div>}
    {error && <p role="alert" className="error-text">{error}</p>}
  </div>
}

export function ItemControls({ collectionId, item, first, last, fa }: { collectionId: number; item: string; first: boolean; last: boolean; fa: boolean }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function remove() {
    setBusy(true); setError('')
    try { await request(`/api/collections/${collectionId}/items?item=${encodeURIComponent(item)}`, 'DELETE'); window.location.reload() } catch (cause) { setError((cause as Error).message); setBusy(false) }
  }
  async function move(direction: 'up' | 'down') {
    setBusy(true); setError('')
    try { await request(`/api/collections/${collectionId}/items/order`, 'PATCH', { item, direction }); window.location.reload() } catch (cause) { setError((cause as Error).message); setBusy(false) }
  }
  return <span className="collections-item-actions"><button type="button" className="btn btn-ghost btn-sm" disabled={busy || first} aria-label={fa ? 'انتقال به بالا' : 'Move up'} onClick={() => void move('up')}>↑</button><button type="button" className="btn btn-ghost btn-sm" disabled={busy || last} aria-label={fa ? 'انتقال به پایین' : 'Move down'} onClick={() => void move('down')}>↓</button><button className="btn btn-ghost btn-sm" type="button" disabled={busy} onClick={() => void remove()}>{fa ? 'برداشتن' : 'Remove'}</button>{error && <small role="alert" className="error-text">{error}</small>}</span>
}
