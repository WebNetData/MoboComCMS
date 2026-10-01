'use client'

import { useState } from 'react'
import { LinksEditor, type LinkRow } from '../../cms/MediaCrud'
import { Notice, faDate, send, useJson } from '../shared'
import { UPDATE_KINDS } from '@/modules/games/domain/games'

type Update = { id: number; kind: string; title: string; version: string; size: string; notes: string; releasedAt: string; links: (LinkRow & { id: number })[] }
const blank = (): Update => ({ id: 0, kind: 'UPDATE', title: '', version: '', size: '', notes: '', releasedAt: new Date().toISOString().slice(0, 10), links: [] })

/** Updates / patches / DLC / editions of one game, each with its own protected download links. */
export default function UpdatesEditor({ gameId, onVersion }: { gameId: number; onVersion: (version: string) => void }) {
  const { data, error, reload } = useJson<{ updates: Update[] }>(`/api/admin/games/updates?gameId=${gameId}`)
  const [editing, setEditing] = useState<Update | null>(null)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  async function save() {
    if (!editing) return
    setBusy(true)
    const response = await send<{ version: string }>('/api/admin/games/updates', 'POST', { ...editing, gameId, id: editing.id || undefined, links: editing.links.filter((link) => link.url) })
    setBusy(false)
    if (!response.ok) { setMessage({ tone: 'error', text: response.error }); return }
    if (response.data.version) onVersion(response.data.version)
    setMessage({ tone: 'ok', text: editing.id ? 'آپدیت ذخیره شد' : 'آپدیت اضافه شد؛ دنبال‌کنندگان بازی در بخش «آپدیت‌ها» آن را می‌بینند' })
    setEditing(null)
    void reload()
  }

  async function remove(update: Update) {
    if (!window.confirm(`«${update.title}» و لینک‌هایش حذف شود؟`)) return
    const response = await send(`/api/admin/games/updates?gameId=${gameId}&id=${update.id}`, 'DELETE')
    setMessage(response.ok ? { tone: 'ok', text: 'حذف شد' } : { tone: 'error', text: response.error })
    void reload()
  }

  const set = (patch: Partial<Update>) => setEditing((current) => (current ? { ...current, ...patch } : current))
  return <div className="ga-updates">
    {error && <Notice tone="error">{error}</Notice>}
    {message && <Notice tone={message.tone}>{message.text}</Notice>}
    {data && !data.updates.length && !editing && <p className="sa-hint">هنوز آپدیت یا DLCی ثبت نشده است.</p>}
    {data && data.updates.length > 0 && <ul className="sa-timeline">{data.updates.map((update) => <li key={update.id}>
      <div className="sa-row"><b>{UPDATE_KINDS[update.kind as keyof typeof UPDATE_KINDS] || update.kind}: {update.title}{update.version && <bdi dir="ltr"> v{update.version}</bdi>}</b>
        <span className="sa-row-actions"><button type="button" className="sa-link" onClick={() => setEditing({ ...update, links: update.links })}>ویرایش</button><button type="button" className="sa-link is-danger" onClick={() => void remove(update)}>حذف</button></span></div>
      <small>{faDate(update.releasedAt)}{update.size && ` · ${update.size}`} · {update.links.length.toLocaleString('fa-IR')} لینک</small>
    </li>)}</ul>}
    {editing ? <div className="sa-repeat">
      <div className="sa-grid">
        <label className="sa-field"><span>نوع</span><select className="select" value={editing.kind} onChange={(e) => set({ kind: e.target.value })}>{Object.entries(UPDATE_KINDS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label className="sa-field"><span>عنوان *</span><input className="input" value={editing.title} onChange={(e) => set({ title: e.target.value })} placeholder="آپدیت 1.13 یا Shadow of the Erdtree" /></label>
        <label className="sa-field"><span>نسخه</span><input className="input" dir="ltr" value={editing.version} onChange={(e) => set({ version: e.target.value })} placeholder="1.13" /></label>
        <label className="sa-field"><span>حجم</span><input className="input" dir="ltr" value={editing.size} onChange={(e) => set({ size: e.target.value })} placeholder="1.2 GB" /></label>
        <label className="sa-field"><span>تاریخ</span><input className="input" type="date" value={editing.releasedAt} onChange={(e) => set({ releasedAt: e.target.value })} /></label>
      </div>
      <label className="sa-field"><span>تغییرات (هر مورد در یک خط)</span><textarea className="input" rows={4} value={editing.notes} onChange={(e) => set({ notes: e.target.value })} /></label>
      <div className="sa-field"><span>لینک‌های دانلود این مورد</span><LinksEditor value={editing.links} onChange={(links) => set({ links: links as Update['links'] })} fa compact section="games" /></div>
      <div className="sa-row"><button type="button" className="btn btn-primary" disabled={busy || editing.title.trim().length < 2} onClick={() => void save()}>{busy ? 'در حال ذخیره…' : 'ذخیره'}</button><button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>انصراف</button></div>
    </div> : <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setMessage(null); setEditing(blank()) }}>+ آپدیت / DLC تازه</button>}
  </div>
}
