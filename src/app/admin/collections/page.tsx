'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from '@/components/AppLink'
import { useI18n } from '@/i18n/LocaleProvider'

type Row = { id: number; title: string; description: string; cover: string; visibility: string; owner: { name: string }; _count: { items: number; reactions: number } }
type Listing = { items: Row[]; page: number; pages: number; total: number }

export default function AdminCollectionsPage() {
  const { locale } = useI18n()
  const fa = locale === 'fa'
  const [page, setPage] = useState(1)
  const [listing, setListing] = useState<Listing | null>(null)
  const [busy, setBusy] = useState<number | null>(null)
  const [error, setError] = useState('')
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

  return <div className="collections-admin"><header className="collections-admin-head"><div><h1>{fa ? 'مجموعه‌های منتخب' : 'Editorial collections'}</h1><p>{fa ? 'مجموعه‌های عمومی کاربران را برای نمایش تحریریه انتخاب یا از آن خارج کنید.' : 'Select public member collections for editorial display.'}</p></div><Link href="/collections" className="btn btn-ghost">{fa ? 'نمایش سایت' : 'View site'}</Link></header>
    {error && <p role="alert" className="error-text">{error}</p>}
    <section className="sa-card" aria-label={fa ? 'فهرست مجموعه‌ها' : 'Collection list'}>{!listing ? <p className="muted">{fa ? 'در حال بارگذاری…' : 'Loading…'}</p> : listing.items.length ? <ul className="sa-rows collections-admin-list">{listing.items.map((row) => <li key={row.id}><Link href={`/collections/${row.id}`}><span className="sa-grow"><b>{row.title}</b><small>{row.owner.name || (fa ? 'کاربر' : 'Member')} · {row._count.items.toLocaleString(fa ? 'fa-IR' : 'en-US')} {fa ? 'مورد' : 'items'} · ♥ {row._count.reactions.toLocaleString(fa ? 'fa-IR' : 'en-US')}</small></span></Link><span className="collections-admin-status">{row.visibility === 'EDITORIAL' ? (fa ? 'منتخب' : 'Featured') : (fa ? 'عمومی' : 'Public')}</span><button className="btn btn-ghost btn-sm" type="button" disabled={busy !== null} onClick={() => void curate(row)}>{row.visibility === 'EDITORIAL' ? (fa ? 'حذف از منتخب‌ها' : 'Unfeature') : (fa ? 'انتخاب تحریریه' : 'Feature')}</button></li>)}</ul> : <p className="muted">{fa ? 'مجموعهٔ عمومی برای انتخاب پیدا نشد.' : 'No public collections found.'}</p>}</section>
    {listing && listing.pages > 1 && <nav className="collections-pages" aria-label={fa ? 'صفحه‌بندی' : 'Pagination'}><button className="btn btn-ghost btn-sm" type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>{fa ? 'قبلی' : 'Previous'}</button><span>{page} / {listing.pages}</span><button className="btn btn-ghost btn-sm" type="button" disabled={page >= listing.pages} onClick={() => setPage(page + 1)}>{fa ? 'بعدی' : 'Next'}</button></nav>}
  </div>
}
