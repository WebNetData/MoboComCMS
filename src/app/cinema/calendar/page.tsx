import type { Metadata } from 'next'
import Link from '@/components/AppLink'
import { requireModule } from '@/extensions/server/modules'
import { getServerLocale } from '@/i18n/server'
import { episodeCalendar, filmCalendar } from '@/modules/media/server/queries'
import { daysAway, episodeCode, normalizeKind } from '@/modules/cinema/domain/calendar'
import MediaShell from '@/components/media/MediaShell'
import { cinemaNav } from '@/components/media/nav'
import { sized, srcSet } from '@/shared/media/image'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'تقویم پخش سریال‌ها و اکران فیلم‌ها | Episode and release calendar',
  description: 'قسمت‌های تازه و پیش روی سریال‌ها و فیلم‌هایی که اکران می‌شوند، به ترتیب روز.',
  alternates: { canonical: '/cinema/calendar' },
}

export default async function CinemaCalendarPage({ searchParams }: { searchParams: Promise<{ when?: string; page?: string; kind?: string }> }) {
  await requireModule('cinema')
  const [locale, query] = await Promise.all([getServerLocale(), searchParams])
  const fa = locale === 'fa'
  const now = new Date()
  const kind = normalizeKind(query.kind)
  const films = kind === 'films'
  // Both kinds are laid out the same way: a day, and under it rows of a poster, a name and a line about it.
  type Row = { key: number; at: string; href: string; poster: string; name: string; line: React.ReactNode; members: boolean }
  const read = async (input: { when?: unknown; page?: unknown }) => {
    if (films) {
      const result = await filmCalendar(input, now)
      return { ...result, days: result.days.map((group) => ({ day: group.day, rows: group.items.map((film): Row => ({ key: film.id, at: film.at, href: `/cinema/${film.slug}`, poster: film.poster, name: fa ? film.title : film.titleEn || film.title, line: film.year ? (fa ? film.year.toLocaleString('fa-IR', { useGrouping: false }) : String(film.year)) : (fa ? 'فیلم سینمایی' : 'Film'), members: film.members })) })) }
    }
    const result = await episodeCalendar(input, now)
    return { ...result, days: result.days.map((group) => ({ day: group.day, rows: group.episodes.map((episode): Row => {
      const title = fa ? episode.title : episode.titleEn || episode.title
      return { key: episode.id, at: episode.at, href: `/cinema/${episode.series.slug}`, poster: episode.series.poster, name: fa ? episode.series.title : episode.series.titleEn || episode.series.title, line: <><bdi dir="ltr">{episodeCode(episode.season, episode.number)}</bdi>{title ? ` · ${title}` : ''}</>, members: episode.members }
    }) })) }
  }
  const asked = await read(query)
  // Opened without a choice while nothing is scheduled: show what came last instead of an empty page.
  const calendar = !query.when && asked.when === 'upcoming' && asked.total === 0 ? { ...(await read({ when: 'recent' })), upcomingTotal: 0 } : asked
  const base = `/cinema/calendar?${films ? 'kind=films&' : ''}`
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
  const pageHref = (page: number) => `${base}when=${calendar.when}${page > 1 ? `&page=${page}` : ''}`

  return <MediaShell section="cinema" active="calendar" nav={cinemaNav(fa)} search={{ action: '/cinema/browse', placeholder: fa ? 'جست‌وجوی فیلم و سریال' : 'Search films and series' }}>
    <div className="container md-body cn-cal">
      <header className="cn-history-head"><div><span className="md-eyebrow">{films ? (fa ? 'فیلم‌ها' : 'Films') : (fa ? 'سریال‌ها' : 'Series')}</span><h1>{films ? (fa ? 'تقویم اکران فیلم‌ها' : 'Film release calendar') : (fa ? 'تقویم پخش قسمت‌ها' : 'Episode calendar')}</h1><p>{films ? (fa ? 'فیلم‌هایی که به‌زودی اکران می‌شوند و آن‌هایی که تازه آمده‌اند، به ترتیب روز.' : 'Films opening soon and the ones that just arrived, day by day.') : (fa ? 'قسمت‌هایی که به‌زودی پخش می‌شوند و آن‌هایی که تازه آمده‌اند، به ترتیب روز.' : 'Episodes airing soon and the ones that just arrived, day by day.')}</p></div></header>
      <nav className="md-chips cn-cal-tabs" aria-label={fa ? 'نوع تقویم' : 'Calendar kind'}>
        <Link href="/cinema/calendar" className={films ? '' : 'is-active'} aria-current={films ? undefined : 'page'}>{fa ? 'قسمت‌های سریال' : 'Series episodes'}</Link>
        <Link href="/cinema/calendar?kind=films" className={films ? 'is-active' : ''} aria-current={films ? 'page' : undefined}>{fa ? 'اکران فیلم‌ها' : 'Film releases'}</Link>
      </nav>
      <nav className="md-chips cn-cal-tabs" aria-label={fa ? 'بازهٔ تقویم' : 'Calendar range'}>
        <Link href={`${base}when=upcoming`} className={upcoming ? 'is-active' : ''} aria-current={upcoming ? 'true' : undefined}>{fa ? 'پیش رو' : 'Upcoming'}{calendar.upcomingTotal > 0 ? ` · ${num(calendar.upcomingTotal)}` : ''}</Link>
        <Link href={`${base}when=recent`} className={upcoming ? '' : 'is-active'} aria-current={upcoming ? undefined : 'true'}>{films ? (fa ? 'تازه اکران‌شده' : 'Recently released') : (fa ? 'تازه پخش‌شده' : 'Recently aired')}</Link>
      </nav>
      {calendar.days.length ? calendar.days.map((group) => <section key={group.day} className="cn-cal-day" aria-labelledby={`cal-${group.day}`}>
        <h2 id={`cal-${group.day}`}><time dateTime={group.day}>{dayTitle(group.rows[0].at)}</time><small>{distance(group.rows[0].at)}</small></h2>
        <ul>{group.rows.map((row) => <li key={row.key}><Link href={row.href} className="cn-cal-row">
          <span className="cn-cal-poster">{row.poster ? <img src={sized(row.poster, 160)} srcSet={srcSet(row.poster, 160)} alt="" loading="lazy" /> : <span aria-hidden="true">▶</span>}</span>
          <span className="cn-cal-text"><b>{row.name}</b><small>{row.line}</small></span>
          {row.members && <span className="cn-cal-vip">{fa ? '♛ ویژه' : '♛ VIP'}</span>}
        </Link></li>)}</ul>
      </section>) : <p className="md-empty">{upcoming
        ? films ? <>{fa ? 'فیلمی با تاریخ اکران آینده ثبت نشده است.' : 'No film with a future release day yet.'} <Link href={`${base}when=recent`}>{fa ? 'تازه‌ترین اکران‌ها' : 'See recent releases'}</Link></> : <>{fa ? 'قسمتی با تاریخ پخش آینده ثبت نشده است.' : 'No episode with a future air date yet.'} <Link href={`${base}when=recent`}>{fa ? 'تازه‌ترین قسمت‌ها' : 'See recent episodes'}</Link></>
        : films ? <>{fa ? 'هنوز تاریخ اکرانی برای فیلم‌ها ثبت نشده است.' : 'No film has a release day yet.'} <Link href="/cinema/browse?kind=MOVIE">{fa ? 'مرور فیلم‌ها' : 'Browse films'}</Link></> : <>{fa ? 'هنوز قسمتی پخش نشده است.' : 'No episode has aired yet.'} <Link href="/cinema/browse?kind=SERIES">{fa ? 'مرور سریال‌ها' : 'Browse series'}</Link></>}</p>}
      {calendar.pages > 1 && <nav className="cn-history-pages" aria-label={fa ? 'صفحه‌بندی تقویم' : 'Calendar pages'}>{calendar.page > 1 && <Link href={pageHref(calendar.page - 1)} rel="prev">{fa ? 'قبلی' : 'Previous'}</Link>}<span>{num(calendar.page)} / {num(calendar.pages)}</span>{calendar.page < calendar.pages && <Link href={pageHref(calendar.page + 1)} rel="next">{fa ? 'بعدی' : 'Next'}</Link>}</nav>}
    </div>
  </MediaShell>
}
