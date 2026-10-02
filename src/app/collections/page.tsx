import type { Metadata } from 'next'
import Link from '@/components/AppLink'
import { publicCollections } from '@/modules/content/server/collections'
import { getServerLocale } from '@/i18n/server'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'مجموعه‌ها | Collections' }

export default async function CollectionsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const [{ items, page, pages }, locale] = await Promise.all([publicCollections((await searchParams).page), getServerLocale()])
  const fa = locale === 'fa'
  return <main className="container collections-page">
    <header className="collections-head"><div><span className="md-eyebrow">{fa ? 'انتخاب کاربران و تحریریه' : 'Community picks'}</span><h1>{fa ? 'مجموعه‌ها' : 'Collections'}</h1><p className="muted">{fa ? 'فهرست‌های چندبخشی از فیلم، موسیقی، بازی، مقاله و محصولات.' : 'Lists across films, music, games, articles and products.'}</p></div><Link href="/dashboard/collections" className="btn btn-primary">{fa ? 'مجموعه‌های من' : 'My collections'}</Link></header>
    {items.length ? <div className="collections-grid">{items.map((row) => <Link className="collections-card" href={`/collections/${row.id}`} key={row.id}><span className="collections-cover" aria-hidden="true">{row.cover ? <img src={row.cover} alt="" loading="lazy" /> : '▦'}</span><span className="collections-card-body">{row.visibility === 'EDITORIAL' && <em className="collections-featured">{fa ? 'منتخب تحریریه' : 'Editorial pick'}</em>}<strong>{row.title}</strong><small>{row.owner.name || (fa ? 'کاربر' : 'Member')} · {row._count.items.toLocaleString(fa ? 'fa-IR' : 'en-US')} {fa ? 'مورد' : 'items'} · ♥ {row._count.reactions.toLocaleString(fa ? 'fa-IR' : 'en-US')}</small><span>{row.description}</span></span></Link>)}</div> : <p className="collections-empty">{fa ? 'هنوز مجموعهٔ عمومی ثبت نشده است.' : 'No public collections yet.'}</p>}
    {pages > 1 && <nav className="collections-pages" aria-label={fa ? 'صفحه‌بندی' : 'Pagination'}>{page > 1 && <Link href={`/collections?page=${page - 1}`}>{fa ? 'قبلی' : 'Previous'}</Link>}<span>{page.toLocaleString(fa ? 'fa-IR' : 'en-US')} / {pages.toLocaleString(fa ? 'fa-IR' : 'en-US')}</span>{page < pages && <Link href={`/collections?page=${page + 1}`}>{fa ? 'بعدی' : 'Next'}</Link>}</nav>}
  </main>
}
