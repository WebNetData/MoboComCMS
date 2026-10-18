import type { Metadata } from 'next'
import Link from '@/components/AppLink'
import { requireModule } from '@/extensions/server/modules'
import { getServerLocale } from '@/i18n/server'
import { peopleDirectory } from '@/modules/cinema/server/people'
import MediaShell from '@/components/media/MediaShell'
import { cinemaNav } from '@/components/media/nav'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'کارگردانان و بازیگران | Directors and cast', description: 'کارگردانان و بازیگران فیلم‌ها و سریال‌ها.', alternates: { canonical: '/cinema/people' } }

/** /cinema/people — everybody credited on a published film or series, the most credited first. */
export default async function CinemaPeoplePage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  await requireModule('cinema')
  const [locale, query] = await Promise.all([getServerLocale(), searchParams])
  const fa = locale === 'fa'
  const data = await peopleDirectory(query)
  const num = (value: number) => value.toLocaleString(fa ? 'fa-IR' : 'en-US')
  const href = (page: number) => `/cinema/people?${data.q ? `q=${encodeURIComponent(data.q)}&` : ''}page=${page}`
  return <MediaShell section="cinema" active="people" nav={cinemaNav(fa)} search={{ action: '/cinema/browse', placeholder: fa ? 'جست‌وجوی فیلم و سریال' : 'Search films and series' }}>
    <div className="container md-body cn-people">
      <header className="cn-history-head"><div><span className="md-eyebrow">{fa ? 'فیلم و سریال' : 'Films and series'}</span><h1>{fa ? 'کارگردانان و بازیگران' : 'Directors and cast'}</h1><p>{fa ? `${num(data.total)} نفر` : `${data.total} people`}</p></div>
        <form action="/cinema/people" className="cn-people-search" role="search"><input className="input" type="search" name="q" defaultValue={data.q} placeholder={fa ? 'نام کارگردان یا بازیگر…' : 'A director or an actor…'} aria-label={fa ? 'جست‌وجوی نام' : 'Search a name'} /><button type="submit" className="btn btn-primary btn-sm">{fa ? 'جست‌وجو' : 'Search'}</button></form>
      </header>
      {data.people.length ? <ul className="cn-people-grid">{data.people.map((person) => <li key={person.id}><Link href={`/cinema/people/${person.id}`} className="cn-person">
        {person.image ? <img src={person.image} alt="" loading="lazy" /> : <i>{person.name.slice(0, 1)}</i>}<b>{person.name}</b>
        <small>{[person.director && (fa ? 'کارگردان' : 'Director'), person.cast && (fa ? 'بازیگر' : 'Cast')].filter(Boolean).join(fa ? '، ' : ', ')} · {fa ? `${num(person.titles)} اثر در موبوکام` : `${person.titles} works on MoboCom`}</small>
      </Link></li>)}</ul> : <p className="md-empty">{data.q ? (fa ? 'کسی با این نام پیدا نشد.' : 'Nobody by that name.') : (fa ? 'هنوز کسی ثبت نشده است.' : 'Nobody is listed yet.')}</p>}
      {data.pages > 1 && <nav className="cn-history-pages" aria-label={fa ? 'صفحه‌بندی' : 'Pages'}>{data.page > 1 && <Link href={href(data.page - 1)} rel="prev">{fa ? 'قبلی' : 'Previous'}</Link>}<span>{num(data.page)} / {num(data.pages)}</span>{data.page < data.pages && <Link href={href(data.page + 1)} rel="next">{fa ? 'بعدی' : 'Next'}</Link>}</nav>}
    </div>
  </MediaShell>
}
