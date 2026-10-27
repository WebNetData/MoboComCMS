'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from '@/components/AppLink'
import { SectionShell, type SectionTab } from '../cms/SectionAdmin'

type Source = { id: number; name: string; image: string; slug?: string }
type Row = { id: number; slug: string; name: string; featured: boolean; keepApart: boolean; cinemaPerson: Source | null; musicArtist: Source | null }
type List = { page: number; pages: number; total: number; rows: Row[] }

const TABS: SectionTab[] = [{ href: '/admin/celebrities', label: 'چهره‌ها', exact: true }, { href: '/admin/cinema/people', label: 'بازیگران و کارگردان‌ها' }, { href: '/admin/music/artists', label: 'خوانندگان و هنرمندان موسیقی' }]
const fa = (value: number) => value.toLocaleString('fa-IR')
const FILTERS: [string, string][] = [['', 'همه'], ['both', 'در هر دو بخش'], ['cinema', 'فقط فیلم و سریال'], ['music', 'فقط موسیقی']]

/**
 * «چهره‌ها»: one entry per person across cinema and music. Names, pictures and works are edited in each section; here
 * the owner marks featured people, joins one person kept as two (different spellings) and splits two people who
 * share a name.
 */
export default function CelebritiesAdmin() {
  const [query, setQuery] = useState(() => (typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('q') || ''))
  const [only, setOnly] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<List | null>(null)
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [joining, setJoining] = useState<Row | null>(null)
  const [partners, setPartners] = useState<Row[]>([])
  const [partnerQuery, setPartnerQuery] = useState('')

  const load = useCallback(() => {
    const params = new URLSearchParams({ q: query, only, page: String(page) })
    fetch(`/api/admin/celebrities?${params}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((body) => body && setData(body)).catch(() => undefined)
  }, [query, only, page])
  useEffect(() => { const timer = setTimeout(load, 250); return () => clearTimeout(timer) }, [load])

  // Partners for a join: entries that have only the section this one lacks.
  useEffect(() => {
    if (!joining) return
    const want = joining.cinemaPerson ? 'music' : 'cinema'
    fetch(`/api/admin/celebrities?${new URLSearchParams({ q: partnerQuery || joining.name, only: want })}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((body) => setPartners(body?.rows || [])).catch(() => setPartners([]))
  }, [joining, partnerQuery])

  async function act(body: Record<string, unknown>, done: string) {
    setBusy(true); setNotice('')
    const response = await fetch('/api/admin/celebrities', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null)
    const result = await response?.json().catch(() => null)
    setBusy(false)
    if (!response?.ok) { setNotice(result?.error || 'انجام نشد'); return }
    setNotice(body.action === 'sync' ? `همگام شد: ${fa(result.result.created)} چهرهٔ تازه، ${fa(result.result.joined)} اتصال هم‌نام.` : done)
    setJoining(null); load()
  }

  return <SectionShell tabs={TABS} label="مدیریت چهره‌ها" title="چهره‌ها" actions={<>
    <Link href="/celebrities" className="btn btn-ghost" target="_blank" rel="noreferrer">نمایش در سایت</Link>
    <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void act({ action: 'sync' }, '')}>همگام‌سازی</button>
  </>}>
    <p className="sa-hint">هر بازیگر، کارگردان یا خواننده یک صفحه در «چهره‌ها» دارد. اگر یک نفر هم در فیلم و هم در موسیقی با همان نام ثبت شده باشد، خودکار یک صفحه می‌شود. نام، عکس و آثار هر نفر در بخش خودش ویرایش می‌شود؛ اینجا چهره‌های ویژه را انتخاب می‌کنید، یک نفرِ دو‌اسمی را وصل می‌کنید یا دو نفرِ هم‌نام را جدا می‌کنید.</p>
    {notice && <p role="status" className="cbx-notice">{notice}</p>}
    <div className="cbx-filters">
      <input type="search" className="input" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1) }} placeholder="جست‌وجوی نام…" aria-label="جست‌وجوی نام" />
      <div className="cbx-chips" role="group" aria-label="بخش">{FILTERS.map(([key, label]) => <button key={key || 'all'} type="button" className={only === key ? 'is-on' : ''} aria-pressed={only === key} onClick={() => { setOnly(key); setPage(1) }}>{label}</button>)}</div>
      {data && <small className="sa-sub">{fa(data.total)} چهره</small>}
    </div>
    {!data ? <div className="sa-skeleton" /> : <ul className="cbx-list">{data.rows.map((row) => <li key={row.id} className={row.featured ? 'is-featured' : ''}>
      <span className="cbx-avatar">{(row.musicArtist?.image || row.cinemaPerson?.image) ? <img src={row.musicArtist?.image || row.cinemaPerson?.image} alt="" /> : <i aria-hidden="true">{row.name.slice(0, 1)}</i>}</span>
      <div className="cbx-main">
        <b>{row.name}</b>
        <span className="cbx-sources">
          {row.cinemaPerson && <Link href={`/admin/cinema/people?edit=${row.cinemaPerson.id}`} className="cbx-src is-cinema">فیلم و سریال: {row.cinemaPerson.name}</Link>}
          {row.musicArtist && <Link href={`/admin/music/artists?edit=${row.musicArtist.id}`} className="cbx-src is-music">موسیقی: {row.musicArtist.name}</Link>}
          {row.keepApart && <small className="cbx-apart">جدا نگه‌داشته‌شده از هم‌نام</small>}
        </span>
      </div>
      <div className="cbx-acts">
        <label className="sa-check"><input type="checkbox" checked={row.featured} disabled={busy} onChange={(e) => void act({ action: 'feature', id: row.id, featured: e.target.checked }, e.target.checked ? `«${row.name}» ویژه شد` : `«${row.name}» از ویژه‌ها برداشته شد`)} />ویژه</label>
        <Link href={`/celebrities/${encodeURIComponent(row.slug)}`} className="sa-link" target="_blank" rel="noreferrer">صفحه</Link>
        {row.cinemaPerson && row.musicArtist
          ? <button type="button" className="sa-link is-danger" disabled={busy} onClick={() => { if (window.confirm(`«${row.name}» در فیلم و در موسیقی دو نفر متفاوت‌اند؟ جدا می‌شوند و دیگر خودکار وصل نمی‌شوند.`)) void act({ action: 'split', id: row.id }, `«${row.name}» به دو چهره جدا شد`) }}>جدا کردن</button>
          : <button type="button" className="sa-link" disabled={busy} onClick={() => { setJoining(row); setPartnerQuery('') }}>وصل به {row.cinemaPerson ? 'خواننده…' : 'بازیگر/کارگردان…'}</button>}
      </div>
      {joining?.id === row.id && <div className="cbx-join">
        <input type="search" className="input" value={partnerQuery} onChange={(e) => setPartnerQuery(e.target.value)} placeholder={`جست‌وجو در ${row.cinemaPerson ? 'خوانندگان' : 'بازیگران و کارگردانان'}…`} aria-label="جست‌وجوی همان شخص در بخش دیگر" />
        <ul>{partners.map((partner) => <li key={partner.id}><span>{partner.name}</span><button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void act({ action: 'join', id: row.id, otherId: partner.id }, `«${row.name}» و «${partner.name}» یک چهره شدند`)}>همان شخص است</button></li>)}{!partners.length && <li className="sa-sub">موردی پیدا نشد.</li>}</ul>
        <button type="button" className="sa-link" onClick={() => setJoining(null)}>بستن</button>
      </div>}
    </li>)}</ul>}
    {data && data.pages > 1 && <nav className="cbx-pager" aria-label="صفحه‌بندی">
      <button type="button" className="btn btn-ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>قبلی</button>
      <span>{fa(data.page)} از {fa(data.pages)}</span>
      <button type="button" className="btn btn-ghost" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>بعدی</button>
    </nav>}
  </SectionShell>
}
