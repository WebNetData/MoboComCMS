import type { Metadata } from 'next'
import Link from '@/components/AppLink'
import { requireModule } from '@/extensions/server/modules'
import { getServerLocale } from '@/i18n/server'
import { episodeCalendar } from '@/modules/media/server/queries'
import { daysAway, episodeCode } from '@/modules/cinema/domain/calendar'
import MediaShell from '@/components/media/MediaShell'
import { cinemaNav } from '@/components/media/nav'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'تقویم پخش سریال‌ها | Episode calendar',
  description: 'قسمت‌های تازه و پیش روی سریال‌ها به ترتیب روز پخش.',
  alternates: { canonical: '/cinema/calendar' },
}

export default async function CinemaCalendarPage({ searchParams }: { searchParams: Promise<{ when?: string; page?: string }> }) {
  await requireModule('cinema')
  const [locale, query] = await Promise.all([getServerLocale(), searchParams])
  const fa = locale === 'fa'
  const now = new Date()
  const asked = await episodeCalendar(query, now)
  // Opened without a choice while nothing is scheduled: show what aired last instead of an empty page.
  const calendar = !query.when && asked.when === 'upcoming' && asked.total === 0 ? { ...(await episodeCalendar({ when: 'recent' }, now)), upcomingTotal: 0 } : asked
  const upcoming = calendar.when === 'upcoming'
  const num = (value: number) => value.toLocaleString(fa ? 'fa-IR' : 'en-US')
  // Built from parts: the order a runtime gives the Persian long date is not the same everywhere.
  const dayTitle = (iso: string) => {
    const parts = new Intl.DateTimeFormat(fa ? 'fa-IR-u-ca-persian' : 'en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Tehran' }).formatToParts(new Date(iso))
    const part = (type: string) => parts.find((item) => item.type === type)?.value || ''
    return fa ? `${part('weekday')} ${part('day')} ${part('month')} ${part('year')}` : `${part('weekday')}, ${part('month')} ${part('day')}, ${part('year')}`
  }
  const distance = (iso: string) => {
    const days = daysAway(iso, now)
    if (days === 0) return fa ? 'امروز' : 'Today'
    if (days === 1) return fa ? 'فردا' : 'Tomorrow'
    if (days === -1) return fa ? 'دیروز' : 'Yesterday'
    return days > 0 ? (fa ? `${num(days)} روز دیگر` : `in ${days} days`) : (fa ? `${num(-days)} روز پیش` : `${-days} days ago`)
  }
  const pageHref = (page: number) => `/cinema/calendar?when=${calendar.when}${page > 1 ? `&page=${page}` : ''}`

  return <MediaShell section="cinema" active="calendar" nav={cinemaNav(fa)} search={{ action: '/cinema/browse', placeholder: fa ? 'جست‌وجوی فیلم و سریال' : 'Search films and series' }}>
    <div className="container md-body cn-cal">
      <header className="cn-history-head"><div><span className="md-eyebrow">{fa ? 'سریال‌ها' : 'Series'}</span><h1>{fa ? 'تقویم پخش قسمت‌ها' : 'Episode calendar'}</h1><p>{fa ? 'قسمت‌هایی که به‌زودی پخش می‌شوند و آن‌هایی که تازه آمده‌اند، به ترتیب روز.' : 'Episodes airing soon and the ones that just arrived, day by day.'}</p></div></header>
      <nav className="md-chips cn-cal-tabs" aria-label={fa ? 'بازهٔ تقویم' : 'Calendar range'}>
        <Link href="/cinema/calendar?when=upcoming" className={upcoming ? 'is-active' : ''} aria-current={upcoming ? 'page' : undefined}>{fa ? 'پیش رو' : 'Upcoming'}{calendar.upcomingTotal > 0 ? ` · ${num(calendar.upcomingTotal)}` : ''}</Link>
        <Link href="/cinema/calendar?when=recent" className={upcoming ? '' : 'is-active'} aria-current={upcoming ? undefined : 'page'}>{fa ? 'تازه پخش‌شده' : 'Recently aired'}</Link>
      </nav>
      {calendar.days.length ? calendar.days.map((group) => <section key={group.day} className="cn-cal-day" aria-labelledby={`cal-${group.day}`}>
        <h2 id={`cal-${group.day}`}><time dateTime={group.day}>{dayTitle(group.episodes[0].at)}</time><small>{distance(group.episodes[0].at)}</small></h2>
        <ul>{group.episodes.map((episode) => {
          const series = fa ? episode.series.title : episode.series.titleEn || episode.series.title
          const title = fa ? episode.title : episode.titleEn || episode.title
          return <li key={episode.id}><Link href={`/cinema/${episode.series.slug}`} className="cn-cal-row">
            <span className="cn-cal-poster">{episode.series.poster ? <img src={episode.series.poster} alt="" loading="lazy" /> : <span aria-hidden="true">▶</span>}</span>
            <span className="cn-cal-text"><b>{series}</b><small><bdi dir="ltr">{episodeCode(episode.season, episode.number)}</bdi>{title ? ` · ${title}` : ''}</small></span>
            {episode.members && <span className="cn-cal-vip">{fa ? '♛ ویژه' : '♛ VIP'}</span>}
          </Link></li>
        })}</ul>
      </section>) : <p className="md-empty">{upcoming
        ? <>{fa ? 'قسمتی با تاریخ پخش آینده ثبت نشده است.' : 'No episode with a future air date yet.'} <Link href="/cinema/calendar?when=recent">{fa ? 'تازه‌ترین قسمت‌ها' : 'See recent episodes'}</Link></>
        : <>{fa ? 'هنوز قسمتی پخش نشده است.' : 'No episode has aired yet.'} <Link href="/cinema/browse?kind=SERIES">{fa ? 'مرور سریال‌ها' : 'Browse series'}</Link></>}</p>}
      {calendar.pages > 1 && <nav className="cn-history-pages" aria-label={fa ? 'صفحه‌بندی تقویم' : 'Calendar pages'}>{calendar.page > 1 && <Link href={pageHref(calendar.page - 1)} rel="prev">{fa ? 'قبلی' : 'Previous'}</Link>}<span>{num(calendar.page)} / {num(calendar.pages)}</span>{calendar.page < calendar.pages && <Link href={pageHref(calendar.page + 1)} rel="next">{fa ? 'بعدی' : 'Next'}</Link>}</nav>}
    </div>
  </MediaShell>
}
