'use client'

import { useEffect, useState } from 'react'
import Link from '@/components/AppLink'
import { SectionShell } from '../cms/SectionAdmin'
import CoverField from '../cms/CoverField'
import { Notice, send, useJson } from '../store/shared'

type Studio = { id: number; name: string; logo: string; summary: string; website: string }

export default function AdminStudiosPage() {
  const [query, setQuery] = useState('')
  const [searched, setSearched] = useState('')
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState<Studio | null>(null)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  useEffect(() => { const timer = setTimeout(() => { setSearched(query.trim()); setPage(1) }, 250); return () => clearTimeout(timer) }, [query])
  const list = useJson<{ studios: Studio[]; total: number; page: number; pages: number }>(`/api/admin/studios?q=${encodeURIComponent(searched)}&page=${page}`)
  const set = (patch: Partial<Studio>) => setEditing((current) => current ? { ...current, ...patch } : current)
  async function save() {
    if (!editing) return
    setBusy(true)
    const result = await send('/api/admin/studios', 'PATCH', editing)
    setBusy(false)
    if (!result.ok) { setMessage({ tone: 'error', text: result.error }); return }
    setEditing(null)
    setMessage({ tone: 'ok', text: 'پروفایل ذخیره شد.' })
    void list.reload()
  }
  const tabs = [{ href: '/admin/studios', label: 'سازندگان و ناشران', exact: true }, { href: '/admin/games/titles', label: 'بازی‌ها' }, { href: '/admin/software/titles', label: 'نرم‌افزارها' }]
  return <SectionShell tabs={tabs} label="مدیریت سازندگان و ناشران" title="سازندگان و ناشران">
    <section className="sa-card sa-stack"><header className="sa-card-head"><h2>پروفایل‌های مشترک</h2><small>نام‌ها با ذخیرهٔ محصول از بخش بازی یا نرم‌افزار به این فهرست افزوده می‌شوند.</small></header>
      <label className="sa-field"><span>جست‌وجو</span><input className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="نام سازنده یا ناشر" /></label>
      {list.error && <Notice tone="error">{list.error}</Notice>}{message && <Notice tone={message.tone}>{message.text}</Notice>}
      {list.data && <small>{list.data.total.toLocaleString('fa-IR')} پروفایل</small>}
      {list.data && !list.data.studios.length && <p className="sa-hint">پروفایلی پیدا نشد.</p>}
      {list.data?.studios.map((row) => <div className="sa-row sa-repeat" key={row.id}><strong>{row.name}</strong><span className="sa-row-actions"><button type="button" className="sa-link" onClick={() => { setEditing({ ...row }); setMessage(null) }}>ویرایش</button><Link className="sa-link" href={`/studios/${row.id}`}>نمایش عمومی</Link></span></div>)}
      {list.data && list.data.pages > 1 && <nav className="sa-pager" aria-label="صفحه‌بندی پروفایل‌ها"><button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>قبلی</button><span>{list.data.page.toLocaleString('fa-IR')} از {list.data.pages.toLocaleString('fa-IR')}</span><button className="btn btn-ghost btn-sm" disabled={page >= list.data.pages} onClick={() => setPage((value) => value + 1)}>بعدی</button></nav>}
    </section>
    {editing && <section className="sa-card sa-stack" aria-label="ویرایش پروفایل"><header className="sa-card-head"><h2>{editing.name}</h2><small>نام از اطلاعات محصولات مدیریت می‌شود؛ اینجا معرفی و هویت بصری آن را تکمیل کنید.</small></header>
      <div className="sa-field"><span>نشان مجموعه</span><CoverField value={editing.logo} title={editing.name} onChange={(logo) => set({ logo })} onBusy={setUploading} mode="square" /></div>
      <label className="sa-field"><span>معرفی</span><textarea className="input" rows={5} value={editing.summary} onChange={(event) => set({ summary: event.target.value })} /></label>
      <label className="sa-field"><span>وب‌سایت رسمی</span><input className="input" type="url" dir="ltr" value={editing.website} onChange={(event) => set({ website: event.target.value })} placeholder="https://example.com" /></label>
      <div className="sa-row"><button type="button" className="btn btn-primary" disabled={busy || uploading} onClick={() => void save()}>{busy ? 'در حال ذخیره…' : 'ذخیرهٔ پروفایل'}</button><button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>انصراف</button></div>
    </section>}
  </SectionShell>
}
