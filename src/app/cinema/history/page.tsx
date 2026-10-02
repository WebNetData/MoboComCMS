import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Link from '@/components/AppLink'
import { requireModule } from '@/extensions/server/modules'
import { getServerLocale } from '@/i18n/server'
import { getViewer } from '@/modules/membership/server/membership'
import { watchHistory } from '@/modules/cinema/server/progress'
import MediaShell from '@/components/media/MediaShell'
import { cinemaNav } from '@/components/media/nav'
import HistoryActions from './HistoryActions'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'تاریخچهٔ تماشا | Watch history', robots: { index: false, follow: false } }

export default async function CinemaHistoryPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  await requireModule('cinema')
  const [viewer, locale, query] = await Promise.all([getViewer(), getServerLocale(), searchParams])
  if (!viewer.userId) redirect('/login?next=/cinema/history')
  const fa = locale === 'fa'
  const history = await watchHistory(viewer.userId, Number(query.page))
  return <MediaShell section="cinema" active="history" nav={cinemaNav(fa)} search={{ action: '/cinema/browse', placeholder: fa ? 'جست‌وجوی فیلم و سریال' : 'Search films and series' }}>
    <div className="container md-body cn-history">
      <header className="cn-history-head"><div><span className="md-eyebrow">{fa ? 'کتابخانهٔ خصوصی' : 'Private library'}</span><h1>{fa ? 'تاریخچهٔ تماشا' : 'Watch history'}</h1><p>{fa ? 'فیلم‌ها و قسمت‌هایی که تماشا کرده‌اید یا ناتمام گذاشته‌اید.' : 'Films and episodes you watched or left unfinished.'}</p></div>{history.total > 0 && <HistoryActions fa={fa} />}</header>
      {history.items.length ? <div className="cn-history-grid">{history.items.map((item) => <Link key={item.key} href={item.href} className="cn-continue-card">
        <span className="cn-continue-poster">{item.poster ? <img src={item.poster} alt="" loading="lazy" /> : <span aria-hidden="true">▶</span>}</span>
        <b>{fa ? item.title : item.titleEn || item.title}</b>
        <small>{item.subtitle || (item.completed ? (fa ? 'تماشا شده' : 'Watched') : (fa ? 'ناتمام' : 'In progress'))}</small>
        <span className="cn-continue-progress" role="meter" aria-valuenow={item.percent} aria-valuemin={0} aria-valuemax={100} aria-label={fa ? 'پیشرفت تماشا' : 'Watch progress'}><span style={{ width: `${item.percent}%` }} /></span>
      </Link>)}</div> : <p className="md-empty">{fa ? 'هنوز موردی برای نمایش ندارید.' : 'No watch history yet.'} <Link href="/cinema">{fa ? 'مرور فیلم‌ها' : 'Browse cinema'}</Link></p>}
      {history.pages > 1 && <nav className="cn-history-pages" aria-label={fa ? 'صفحه‌بندی تاریخچه' : 'History pages'}>{history.page > 1 && <Link href={`/cinema/history?page=${history.page - 1}`}>{fa ? 'قبلی' : 'Previous'}</Link>}<span>{history.page.toLocaleString(fa ? 'fa-IR' : 'en-US')} / {history.pages.toLocaleString(fa ? 'fa-IR' : 'en-US')}</span>{history.page < history.pages && <Link href={`/cinema/history?page=${history.page + 1}`}>{fa ? 'بعدی' : 'Next'}</Link>}</nav>}
    </div>
  </MediaShell>
}
