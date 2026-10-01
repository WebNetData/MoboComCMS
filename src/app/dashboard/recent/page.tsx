import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Link from '@/components/AppLink'
import { getServerLocale } from '@/i18n/server'
import { getViewer } from '@/modules/membership/server/membership'
import { recentViewPage } from '@/modules/content/server/recent-views'
import { ITEM_LABEL } from '@/modules/content/domain/items'
import RecentActions from './RecentActions'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'اخیراً مشاهده‌شده | Recently viewed', robots: { index: false, follow: false } }

export default async function RecentPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const [viewer, locale, query] = await Promise.all([getViewer(), getServerLocale(), searchParams])
  if (!viewer.userId) redirect('/login?next=/dashboard/recent')
  const fa = locale === 'fa'
  const data = await recentViewPage(viewer.userId, Number(query.page))
  return <div className="ud ulib-page"><header className="ulib-head"><div><span className="md-eyebrow">{fa ? 'تاریخچهٔ خصوصی' : 'Private history'}</span><h1>{fa ? 'اخیراً مشاهده‌شده' : 'Recently viewed'}</h1><p className="muted">{fa ? 'محتواهایی که در شش ماه گذشته دیده‌اید.' : 'Content you viewed in the last six months.'}</p></div>{data.total > 0 && <RecentActions fa={fa} />}</header>
    {data.items.length ? <section className="ud-card"><ul className="ulib-items">{data.items.map((item) => <li key={`${item.type}:${item.id}`}><Link href={item.url}>{item.image ? <img src={item.image} alt="" loading="lazy" /> : <span className="ulib-noart" aria-hidden="true">{ITEM_LABEL[item.type].icon}</span>}<span><b>{item.title}</b><small>{ITEM_LABEL[item.type].one} · {new Date(item.viewedAt).toLocaleDateString(fa ? 'fa-IR' : 'en-US')}</small></span></Link></li>)}</ul></section> : <p className="ud-muted">{fa ? 'هنوز محتوایی در تاریخچهٔ شما نیست.' : 'Your history is empty.'} <Link href="/search">{fa ? 'جست‌وجو' : 'Explore'}</Link></p>}
    {data.pages > 1 && <nav className="collections-pages" aria-label={fa ? 'صفحه‌بندی' : 'Pagination'}>{data.page > 1 && <Link href={`/dashboard/recent?page=${data.page - 1}`}>{fa ? 'قبلی' : 'Previous'}</Link>}<span>{data.page.toLocaleString(fa ? 'fa-IR' : 'en-US')} / {data.pages.toLocaleString(fa ? 'fa-IR' : 'en-US')}</span>{data.page < data.pages && <Link href={`/dashboard/recent?page=${data.page + 1}`}>{fa ? 'بعدی' : 'Next'}</Link>}</nav>}
  </div>
}
