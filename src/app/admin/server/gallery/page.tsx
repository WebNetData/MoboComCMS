'use client'

import { useRef, useState } from 'react'
import { Notice, ServerShell, bytes, fa, faDate, useServerApi, useServerJson } from '../shared'
import { Pager } from '../../store/shared'

type Item = { collection: string; name: string; path: string; size: number; mtime: string; url: string; public: boolean }
type Data = { collections: { id: string; label: string; public: boolean; count: number; bytes: number }[]; items: Item[]; total: number; page: number; pages: number }

const src = (item: Item) => item.url || `/api/admin/server/files/download?inline=1&path=${encodeURIComponent(item.path)}`

function Gallery() {
  const api = useServerApi()
  const [collection, setCollection] = useState('')
  const [q, setQ] = useState('')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('new')
  const [page, setPage] = useState(1)
  const { data, error, reload } = useServerJson<Data>(`/api/admin/server/gallery?collection=${collection}&q=${encodeURIComponent(query)}&sort=${sort}&page=${page}`)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [view, setView] = useState<Item | null>(null)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const key = (item: Item) => `${item.collection}/${item.name}`

  async function upload(files: FileList) {
    const form = new FormData()
    for (const file of Array.from(files)) form.append('files', file)
    setBusy(true); setNotice(null)
    const result = await api<{ saved: { url: string }[] }>('/api/admin/server/gallery', { form })
    setBusy(false)
    setNotice(result.ok ? { tone: 'ok', text: `${fa(result.data.saved.length)} تصویر به «تصاویر محتوا» اضافه شد؛ نشانی هر تصویر را با «کپی نشانی» بردارید.` } : { tone: 'error', text: result.error })
    if (result.ok) { setCollection('covers'); setPage(1); void reload() }
  }

  async function remove(items: Item[]) {
    if (!items.length || !window.confirm(`${fa(items.length)} تصویر برای همیشه حذف شود؟\nاگر تصویر در مطلب یا محصولی استفاده شده باشد، آنجا نمایش داده نمی‌شود.`)) return
    setBusy(true)
    const result = await api('/api/admin/server/gallery', { body: { delete: items.map((item) => ({ collection: item.collection, name: item.name })) } })
    setBusy(false)
    setNotice(result.ok ? { tone: 'ok', text: 'حذف شد.' } : { tone: 'error', text: result.error })
    setPicked(new Set()); setView(null)
    void reload()
  }

  async function copy(item: Item) {
    const url = new URL(item.url, window.location.origin).toString()
    await navigator.clipboard?.writeText(url).catch(() => null)
    setNotice({ tone: 'ok', text: `نشانی کپی شد: ${url}` })
  }

  const selected = (data?.items || []).filter((item) => picked.has(key(item)))
  return <>
    <div className="sa-queue">
      <button type="button" className={`sa-queue-item${!collection ? ' is-hot' : ''}`} onClick={() => { setCollection(''); setPage(1) }}><b className="num">{fa((data?.collections || []).reduce((sum, item) => sum + item.count, 0))}</b><span>همهٔ تصاویر</span></button>
      {(data?.collections || []).map((item) => <button key={item.id} type="button" className={`sa-queue-item${collection === item.id ? ' is-hot' : ''}`} onClick={() => { setCollection(item.id); setPage(1) }}><b className="num">{fa(item.count)}</b><span>{item.label}<small className="sa-sub">{bytes(item.bytes)}</small></span></button>)}
    </div>
    <div className="sa-toolbar">
      <input className="input" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { setQuery(q); setPage(1) } }} placeholder="جست‌وجوی نام فایل — Enter" aria-label="جست‌وجو" />
      <label className="sa-inline"><span>ترتیب</span><select className="select" value={sort} onChange={(e) => { setSort(e.target.value); setPage(1) }}><option value="new">جدیدترین</option><option value="big">بزرگ‌ترین</option><option value="name">نام</option></select></label>
      <button type="button" className="btn btn-primary" disabled={busy} onClick={() => input.current?.click()}>{busy ? 'در حال بارگذاری…' : 'بارگذاری تصویر'}</button>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" multiple hidden onChange={(e) => { if (e.target.files?.length) void upload(e.target.files); e.target.value = '' }} />
    </div>
    {selected.length > 0 && <div className="sp-bulk"><b>{fa(selected.length)} انتخاب</b><button type="button" className="btn btn-ghost btn-sm sp-danger" onClick={() => void remove(selected)}>حذف</button><button type="button" className="sa-link" onClick={() => setPicked(new Set())}>لغو انتخاب</button></div>}
    {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
    {error && <Notice tone="error">{error}</Notice>}
    {!data ? <div className="sa-skeleton" /> : data.items.length ? <div className="sp-gallery">
      {data.items.map((item) => <figure key={key(item)} className={`sp-tile${picked.has(key(item)) ? ' is-selected' : ''}`}>
        <input type="checkbox" className="sp-tile-check" aria-label={`انتخاب ${item.name}`} checked={picked.has(key(item))} onChange={() => setPicked((current) => { const next = new Set(current); if (next.has(key(item))) next.delete(key(item)); else next.add(key(item)); return next })} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <button type="button" className="sp-thumb" onClick={() => setView(item)} aria-label={`نمایش ${item.name}`}><img src={src(item)} alt="" loading="lazy" /></button>
        <figcaption className="sp-tile-meta"><b title={item.name}>{item.name}</b><small>{bytes(item.size)} · {faDate(item.mtime)}{!item.public ? ' · خصوصی' : ''}</small></figcaption>
        <div className="sp-tile-actions">{item.url && <button type="button" className="sa-link" onClick={() => void copy(item)}>کپی نشانی</button>}<button type="button" className="sa-link is-danger" onClick={() => void remove([item])}>حذف</button></div>
      </figure>)}
    </div> : <p className="sa-card sa-empty">تصویری پیدا نشد.</p>}
    {data && <Pager page={data.page} pages={data.pages} onPage={setPage} />}
    {view && <dialog open className="sp-preview" onClick={() => setView(null)} aria-label={view.name}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src(view)} alt={view.name} />
      <p dir="ltr">{view.url || view.path} · {bytes(view.size)}</p>
    </dialog>}
  </>
}

export default function GalleryPage() {
  return <ServerShell title="گالری تصاویر سایت"><Gallery /></ServerShell>
}
