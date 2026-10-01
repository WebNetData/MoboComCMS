import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Link from '@/components/AppLink'
import { getServerLocale } from '@/i18n/server'
import { getViewer } from '@/modules/membership/server/membership'
import { recentViewPage } from '@/modules/content/server/recent-views'
import { ITEM_LABEL } from '@/modules/content/domain/items'
import Icon from '@/components/site/Icon'
import RecentActions from './RecentActions'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'اخیراً مشاهده‌شده | Recently viewed', robots: { index: false, follow: false } }

export default async function RecentPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const [viewer, locale, query] = await Promise.all([getViewer(), getServerLocale(), searchParams])
  if (!viewer.userId) redirect('/login?next=/dashboard/recent')
  const fa = locale === 'fa'
  const data = await recentViewPage(viewer.userId, Number(query.page))
  return <div className="ud ulib-page recent-home">
    <header className="ulib-head">
      <div className="recent-heading"><span className="ulib-head-icon"><Icon name="eye" size={25} /></span><div><span className="md-eyebrow">{fa ? 'تاریخچهٔ خصوصی شما' : 'Your private history'}</span><h1>{fa ? 'اخیراً مشاهده‌شده' : 'Recently viewed'}</h1><p className="muted">{fa ? 'محتواهایی که در شش ماه گذشته دیده‌اید.' : 'Content you viewed in the last six months.'}</p></div></div>
      {data.total > 0 && <RecentActions fa={fa} />}
    </header>
    {data.items.length ? <section className="ud-card recent-card" aria-labelledby="recent-items-title">
      <header className="ud-card-head"><h2 id="recent-items-title">{fa ? 'آخرین بازدیدها' : 'Latest visits'}</h2><span className="recent-page-count">{fa ? `${data.items.length.toLocaleString('fa-IR')} مورد در این صفحه` : `${data.items.length.toLocaleString('en-US')} on this page`}</span></header>
      <ul className="ulib-items">{data.items.map((item) => <li key={`${item.type}:${item.id}`}><Link href={item.url}>{item.image ? <img src={item.image} alt="" loading="lazy" /> : <span className="ulib-noart" aria-hidden="true">{ITEM_LABEL[item.type].icon}</span>}<span className="recent-item-body"><b>{item.title}</b><small><span>{ITEM_LABEL[item.type].one}</span><span aria-hidden="true">·</span><time dateTime={new Date(item.viewedAt).toISOString()}>{new Date(item.viewedAt).toLocaleDateString(fa ? 'fa-IR' : 'en-US')}</time></small></span></Link></li>)}</ul>
    </section> : <section className="ud-card recent-empty"><span className="recent-empty-icon"><Icon name="clock" size={28} /></span><h2>{fa ? 'تاریخچهٔ شما هنوز خالی است' : 'Your history is empty'}</h2><p className="muted">{fa ? 'صفحه‌های محتوایی که باز می‌کنید، اینجا برای دسترسی دوباره نمایش داده می‌شوند.' : 'Content pages you open will appear here for easy access later.'}</p><Link href="/search" className="btn btn-primary">{fa ? 'جست‌وجوی محتوا' : 'Explore content'}</Link></section>}
    {data.pages > 1 && <nav className="collections-pages" aria-label={fa ? 'صفحه‌بندی' : 'Pagination'}>{data.page > 1 && <Link href={`/dashboard/recent?page=${data.page - 1}`}>{fa ? 'قبلی' : 'Previous'}</Link>}<span>{data.page.toLocaleString(fa ? 'fa-IR' : 'en-US')} / {data.pages.toLocaleString(fa ? 'fa-IR' : 'en-US')}</span>{data.page < data.pages && <Link href={`/dashboard/recent?page=${data.page + 1}`}>{fa ? 'بعدی' : 'Next'}</Link>}</nav>}
  </div>
}
