'use client'

import { useCallback, useEffect, useState, type FormEvent, useRef } from 'react'
import Link from '@/components/AppLink'
import { useRouter } from '@/platform/routing/navigation'
import { useI18n } from '@/i18n/LocaleProvider'

type Row = { id: number; title: string; description: string; cover: string; visibility: string; staffAuthored: boolean; owner: { name: string }; _count: { items: number; reactions: number } }
type Listing = { items: Row[]; page: number; pages: number; total: number }

/** Collections of the site: the ones staff write here, and members' public lists selected for the site. */
export default function AdminCollectionsPage() {
  const { locale } = useI18n()
  const fa = locale === 'fa'
  const router = useRouter()
  const [page, setPage] = useState(1)
  const [listing, setListing] = useState<Listing | null>(null)
  const [busy, setBusy] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [title, setTitle] = useState('')
  const num = (value: number) => value.toLocaleString(fa ? 'fa-IR' : 'en-US')
  const load = useCallback(async () => {
    setError('')
    const response = await fetch(`/api/admin/collections?page=${page}`, { cache: 'no-store' })
    if (!response.ok) throw new Error(fa ? 'فهرست مجموعه‌ها بارگذاری نشد.' : 'Could not load collections.')
    setListing(await response.json())
  }, [page, fa])

  useEffect(() => { void load().catch((cause) => setError((cause as Error).message)) }, [load])

  async function curate(row: Row) {
    setBusy(row.id); setError('')
    const on = row.visibility !== 'EDITORIAL'
    try {
      const response = await fetch(`/api/admin/collections/${row.id}/feature`, { method: on ? 'PUT' : 'DELETE' })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || (fa ? 'تغییر وضعیت انجام نشد.' : 'Could not change status.'))
      await load()
    } catch (cause) { setError((cause as Error).message) } finally { setBusy(null) }
  }

  const createRunning = useRef(false)
  async function create(event: FormEvent) {
    event.preventDefault()
    if (createRunning.current) return
    createRunning.current = true
    try {
      if (!title.trim()) return
      setBusy(-1); setError('')
      const response = await fetch('/api/admin/collections', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) }).catch(() => null)
      const result = await response?.json().catch(() => null)
      setBusy(null)
      if (!response?.ok) { setError(result?.error || (fa ? 'ساخت مجموعه انجام نشد.' : 'Could not create the collection.')); return }
      router.push(`/admin/collections/${result.id}`)
    
    } finally { createRunning.current = false }
  }

  const own = listing?.items.filter((row) => row.staffAuthored) || []
  const members = listing?.items.filter((row) => !row.staffAuthored) || []

  return <div className="collections-admin"><header className="collections-admin-head"><div><h1>{fa ? 'مجموعه‌های منتخب' : 'Editorial collections'}</h1><p>{fa ? 'مجموعه‌های خودِ سایت را این‌جا بسازید و منتشر کنید، یا مجموعه‌های عمومی کاربران را برای نمایش تحریریه انتخاب کنید.' : 'Write the site\'s own collections here, or select members\' public collections.'}</p></div><Link className="btn btn-ghost btn-sm" href="/collections">{fa ? 'نمای عمومی' : 'Public view'}</Link></header>
    {error && <p role="alert" className="error-text">{error}</p>}
    <section className="sa-card" aria-label={fa ? 'مجموعه‌های سایت' : 'The site\'s collections'}>
      <header className="sa-card-head"><h2>{fa ? 'مجموعه‌های سایت' : 'The site\'s collections'}</h2></header>
      <form className="collections-admin-new" onSubmit={create}>
        <input className="input" value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} placeholder={fa ? 'عنوان مجموعهٔ تازه، مثلاً «بهترین فیلم‌های علمی‌تخیلی»' : 'Title of a new collection'} aria-label={fa ? 'عنوان مجموعهٔ تازه' : 'New collection title'} />
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy !== null || !title.trim()}>{fa ? 'ساخت پیش‌نویس' : 'Create draft'}</button>
      </form>
      {!listing ? <p className="muted">{fa ? 'در حال بارگذاری…' : 'Loading…'}</p> : own.length ? <ul className="sa-rows collections-admin-list">{own.map((row) => <li key={row.id}><Link href={`/admin/collections/${row.id}`}><span className="sa-grow"><b>{row.title}</b><small>{num(row._count.items)} {fa ? 'مورد' : 'items'} · ♥ {num(row._count.reactions)}</small></span></Link><span className="collections-admin-status">{row.visibility === 'EDITORIAL' ? (fa ? 'منتشرشده' : 'Published') : (fa ? 'پیش‌نویس' : 'Draft')}</span><Link className="btn btn-ghost btn-sm" href={`/admin/collections/${row.id}`}>{fa ? 'ویرایش' : 'Edit'}</Link></li>)}</ul> : <p className="muted">{fa ? 'هنوز مجموعه‌ای برای سایت نساخته‌اید.' : 'No collection written for the site yet.'}</p>}
    </section>
    <section className="sa-card" aria-label={fa ? 'مجموعه‌های کاربران' : 'Members\' collections'}>
      <header className="sa-card-head"><h2>{fa ? 'مجموعه‌های عمومی کاربران' : 'Members\' public collections'}</h2></header>
      {!listing ? <p className="muted">{fa ? 'در حال بارگذاری…' : 'Loading…'}</p> : members.length ? <ul className="sa-rows collections-admin-list">{members.map((row) => <li key={row.id}><Link href={`/collections/${row.id}`}><span className="sa-grow"><b>{row.title}</b><small>{row.owner.name || (fa ? 'کاربر' : 'Member')} · {num(row._count.items)} {fa ? 'مورد' : 'items'} · ♥ {num(row._count.reactions)}</small></span></Link><span className="collections-admin-status">{row.visibility === 'EDITORIAL' ? (fa ? 'منتخب' : 'Featured') : (fa ? 'عمومی' : 'Public')}</span><button className="btn btn-ghost btn-sm" type="button" disabled={busy !== null} onClick={() => void curate(row)}>{row.visibility === 'EDITORIAL' ? (fa ? 'حذف از منتخب‌ها' : 'Unfeature') : (fa ? 'انتخاب تحریریه' : 'Feature')}</button></li>)}</ul> : <p className="muted">{fa ? 'مجموعهٔ عمومی برای انتخاب پیدا نشد.' : 'No public collections found.'}</p>}
    </section>
    {listing && listing.pages > 1 && <nav className="collections-pages" aria-label={fa ? 'صفحه‌بندی' : 'Pagination'}><button className="btn btn-ghost btn-sm" type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>{fa ? 'قبلی' : 'Previous'}</button><span>{page} / {listing.pages}</span><button className="btn btn-ghost btn-sm" type="button" disabled={page >= listing.pages} onClick={() => setPage(page + 1)}>{fa ? 'بعدی' : 'Next'}</button></nav>}
  </div>
}
