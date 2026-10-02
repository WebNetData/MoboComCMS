'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from '@/components/AppLink'
import { LinksEditor, type LinkRow } from '../../cms/MediaCrud'
import { Notice, faDate, send, useJson } from '../shared'
import { SoftwareShell } from '../shared'

const RichEditor = dynamic(() => import('@/components/RichEditor'), { ssr: false, loading: () => <div className="cms-editor-loading" aria-busy="true">…</div> })

type Picker = { id: number; title: string; slug: string; version: string; status: string }
type Release = { id: number; version: string; channel: string; status: string; releasedAt: string; changelog: string; size: string; checksum: string; links: (LinkRow & { id: number })[] }
const blank = (): Release => ({ id: 0, version: '', channel: 'STABLE', status: 'DRAFT', releasedAt: new Date().toISOString().slice(0, 10), changelog: '', size: '', checksum: '', links: [] })

export default function ReleasesManager({ initialId }: { initialId: number }) {
  const [softwareId, setSoftwareId] = useState(initialId)
  const [query, setQuery] = useState('')
  const [searched, setSearched] = useState('')
  const [page, setPage] = useState(1)
  const [size, setSize] = useState('20')
  const [editing, setEditing] = useState<Release | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  useEffect(() => { const timer = setTimeout(() => setSearched(query.trim()), 250); return () => clearTimeout(timer) }, [query])
  const picker = useJson<{ picker: Picker[] }>(`/api/admin/software/releases?selectedId=${softwareId}&q=${encodeURIComponent(searched)}`)
  const list = useJson<{ software: Picker; releases: Release[]; total: number; page: number; pages: number }>(softwareId ? `/api/admin/software/releases?softwareId=${softwareId}&page=${page}&size=${size}` : '')
  const current = list.data?.software.id === softwareId ? list.data : null
  const choices = picker.data?.picker || []
  const set = (patch: Partial<Release>) => setEditing((current) => current ? { ...current, ...patch } : current)

  async function save() {
    if (!editing || !softwareId) return
    setBusy(true)
    const result = await send('/api/admin/software/releases', 'POST', { ...editing, softwareId, id: editing.id || undefined, links: editing.links.filter((link) => link.url) })
    setBusy(false)
    if (!result.ok) { setMessage({ tone: 'error', text: result.error }); return }
    setMessage({ tone: 'ok', text: 'نسخه ذخیره شد.' })
    setEditing(null)
    void list.reload()
  }

  async function remove(row: Release) {
    if (!window.confirm(`نسخهٔ ${row.version} و لینک‌هایش حذف شود؟`)) return
    const result = await send(`/api/admin/software/releases?softwareId=${softwareId}&id=${row.id}`, 'DELETE')
    setMessage(result.ok ? { tone: 'ok', text: 'نسخه حذف شد.' } : { tone: 'error', text: result.error })
    if (result.ok) void list.reload()
  }

  return <SoftwareShell title="تاریخچهٔ نسخه‌های نرم‌افزار">
    <section className="sa-card sa-stack">
      <header className="sa-card-head"><h2>انتخاب نرم‌افزار</h2><small>نسخه‌ها و لینک‌های دانلود هر نرم‌افزار جداگانه مدیریت می‌شوند.</small></header>
      {picker.error && <Notice tone="error">{picker.error}</Notice>}
      <label className="sa-field"><span>جستجو</span><input className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="نام یا نامک نرم‌افزار" /></label>
      <label className="sa-field"><span>نرم‌افزار</span><select className="select" value={choices.some((row) => row.id === softwareId) ? softwareId : ''} onChange={(event) => { setSoftwareId(Number(event.target.value)); setPage(1); setEditing(null); setMessage(null) }}><option value="">انتخاب کنید…</option>{choices.map((row) => <option key={row.id} value={row.id}>{row.title} · {row.slug}{row.status !== 'PUBLISHED' ? ' · پیش‌نویس' : ''}</option>)}</select></label>
      {current?.software && <Link className="sa-link" href={`/software/${current.software.slug}`}>نمایش صفحهٔ عمومی ←</Link>}
    </section>
    {softwareId > 0 && <section className="sa-card sa-stack">
      <header className="sa-card-head"><h2>نسخه‌های {current?.software.title || ''}</h2><small>نسخهٔ پیش‌نویس یا زمان‌بندی‌شده در سایت و لینک مستقیم دیده نمی‌شود.</small></header>
      {list.error && <Notice tone="error">{list.error}</Notice>}
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      {current && !current.releases.length && !editing && <p className="sa-hint">هنوز نسخه‌ای ثبت نشده است.</p>}
      {current && <div className="sa-row"><small>{current.total.toLocaleString('fa-IR')} نسخه</small><label className="sa-field"><span>تعداد در صفحه</span><select className="select" value={size} onChange={(event) => { setSize(event.target.value); setPage(1) }}>{['20', '50', '100', '500', 'all'].map((option) => <option key={option} value={option}>{option === 'all' ? 'همه' : Number(option).toLocaleString('fa-IR')}</option>)}</select></label></div>}
      {!!current?.releases.length && <ol className="sa-timeline">{current.releases.map((row) => <li key={row.id}><div className="sa-row"><b><bdi dir="ltr">{row.version}</bdi> · {row.channel === 'BETA' ? 'آزمایشی' : row.channel === 'NIGHTLY' ? 'شبانه' : 'پایدار'}</b><span className="sa-row-actions"><button type="button" className="sa-link" onClick={() => setEditing({ ...row, links: [...row.links] })}>ویرایش</button><button type="button" className="sa-link is-danger" onClick={() => void remove(row)}>حذف</button></span></div><small>{faDate(row.releasedAt)} · {row.status === 'PUBLISHED' ? 'منتشرشده' : 'پیش‌نویس'} · {row.links.length.toLocaleString('fa-IR')} لینک</small></li>)}</ol>}
      {current && current.pages > 1 && <nav className="sa-pager" aria-label="صفحه‌بندی نسخه‌ها"><button type="button" className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>قبلی</button><span>{current.page.toLocaleString('fa-IR')} از {current.pages.toLocaleString('fa-IR')}</span><button type="button" className="btn btn-ghost btn-sm" disabled={page >= current.pages} onClick={() => setPage((value) => value + 1)}>بعدی</button></nav>}
      {editing ? <div className="sa-repeat sa-stack">
        <div className="sa-grid">
          <label className="sa-field"><span>شمارهٔ نسخه *</span><input className="input" dir="ltr" value={editing.version} onChange={(event) => set({ version: event.target.value })} placeholder="2.4.1" /></label>
          <label className="sa-field"><span>کانال</span><select className="select" value={editing.channel} onChange={(event) => set({ channel: event.target.value })}><option value="STABLE">پایدار</option><option value="BETA">آزمایشی</option><option value="NIGHTLY">شبانه</option></select></label>
          <label className="sa-field"><span>وضعیت</span><select className="select" value={editing.status} onChange={(event) => set({ status: event.target.value })}><option value="DRAFT">پیش‌نویس</option><option value="PUBLISHED">منتشرشده</option></select></label>
          <label className="sa-field"><span>تاریخ انتشار</span><input className="input" type="date" value={editing.releasedAt} onChange={(event) => set({ releasedAt: event.target.value })} /></label>
          <label className="sa-field"><span>حجم</span><input className="input" dir="ltr" value={editing.size} onChange={(event) => set({ size: event.target.value })} placeholder="85 MB" /></label>
          <label className="sa-field"><span>SHA-256 (اختیاری)</span><input className="input" dir="ltr" value={editing.checksum} onChange={(event) => set({ checksum: event.target.value })} /></label>
        </div>
        <div className="sa-field"><span>تغییرات نسخه</span><RichEditor value={editing.changelog} onChange={(changelog) => set({ changelog })} dir="rtl" minHeight={150} compact ticketMode /></div>
        <div className="sa-field"><span>لینک‌های دانلود نسخه</span><LinksEditor value={editing.links} onChange={(links) => set({ links: links as Release['links'] })} fa compact section="software" /></div>
        <div className="sa-row"><button type="button" className="btn btn-primary" disabled={busy || !editing.version.trim()} onClick={() => void save()}>{busy ? 'در حال ذخیره…' : 'ذخیرهٔ نسخه'}</button><button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>انصراف</button></div>
      </div> : <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setMessage(null); setEditing(blank()) }}>+ نسخهٔ تازه</button>}
    </section>}
  </SoftwareShell>
}
