import type { Metadata } from 'next'
import Link from 'next/link'
import { requireModule } from '@/extensions/server/modules'
import { browseCinema } from '@/modules/media/server/queries'
import { getServerLocale } from '@/i18n/server'
import MediaShell from '@/components/media/MediaShell'
import { cinemaNav } from '@/components/media/nav'
import { EmptyState, PosterCard, yr } from '@/components/media/MediaCards'
import Pager from '@/components/media/Pager'

export const dynamic = 'force-dynamic'

type Search = { kind?: string; genre?: string; year?: string; country?: string; dubbed?: string; sort?: string; q?: string; page?: string }

export async function generateMetadata({ searchParams }: { searchParams: Promise<Search> }): Promise<Metadata> {
  const [p, locale] = await Promise.all([searchParams, getServerLocale()])
  const fa = locale === 'fa'
  const kind = p.kind === 'SERIES' ? (fa ? 'سریال‌ها' : 'Series') : p.kind === 'MOVIE' ? (fa ? 'فیلم‌ها' : 'Movies') : (fa ? 'فیلم و سریال' : 'Films & series')
  return { title: [kind, p.genre, p.year, p.dubbed === '1' ? (fa ? 'دوبله فارسی' : 'Persian dub') : ''].filter(Boolean).join(' · '), robots: p.q ? { index: false } : undefined }
}

export default async function CinemaBrowsePage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireModule('cinema')
  const [params, locale] = await Promise.all([searchParams, getServerLocale()])
  const fa = locale === 'fa'
  const result = await browseCinema({ ...params, page: Number(params.page) })
  const href = (patch: Partial<Search>) => {
    const q = new URLSearchParams(Object.entries({ ...params, page: undefined, ...patch }).filter(([, v]) => v) as [string, string][])
    return q.toString() ? `/cinema/browse?${q}` : '/cinema/browse'
  }
  const active = params.dubbed === '1' ? 'dubbed' : params.sort === 'imdb' ? 'imdb' : params.kind === 'MOVIE' ? 'movies' : params.kind === 'SERIES' ? 'series' : undefined
  const title = params.q ? (fa ? `جست‌وجو: «${params.q}»` : `Search: “${params.q}”`) : [params.kind === 'SERIES' ? (fa ? 'سریال‌ها' : 'Series') : params.kind === 'MOVIE' ? (fa ? 'فیلم‌ها' : 'Movies') : (fa ? 'همه فیلم‌ها و سریال‌ها' : 'All films & series'), params.genre, params.year, params.country].filter(Boolean).join(' · ')
  const sorts: [string | undefined, string][] = [[undefined, fa ? 'تازه‌ترین' : 'Newest'], ['imdb', fa ? 'امتیاز IMDb' : 'IMDb rating'], ['year', fa ? 'سال ساخت' : 'Release year'], ['popular', fa ? 'پربازدید' : 'Popular']]

  return (
    <MediaShell section="cinema" active={active} nav={cinemaNav(fa)} search={{ action: '/cinema/browse', placeholder: fa ? 'نام فیلم، سریال یا کارگردان…' : 'Film, series or director…', value: params.q }}>
      <div className="container md-body cn-browse">
        <aside className="cn-filters">
          <form action="/cinema/browse" className="cn-filter-form">
            {params.q && <input type="hidden" name="q" value={params.q} />}
            <label>{fa ? 'نوع' : 'Type'}<select name="kind" defaultValue={params.kind || ''}><option value="">{fa ? 'همه' : 'All'}</option><option value="MOVIE">{fa ? 'فیلم' : 'Movie'}</option><option value="SERIES">{fa ? 'سریال' : 'Series'}</option></select></label>
            <label>{fa ? 'ژانر' : 'Genre'}<select name="genre" defaultValue={params.genre || ''}><option value="">{fa ? 'همه' : 'All'}</option>{result.genres.map((g) => <option key={g} value={g}>{g}</option>)}</select></label>
            <label>{fa ? 'سال' : 'Year'}<select name="year" defaultValue={params.year || ''}><option value="">{fa ? 'همه' : 'All'}</option>{result.years.map((y) => <option key={y} value={y}>{yr(y, fa)}</option>)}</select></label>
            <label>{fa ? 'کشور' : 'Country'}<select name="country" defaultValue={params.country || ''}><option value="">{fa ? 'همه' : 'All'}</option>{result.countries.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
            <label className="cn-filter-check"><input type="checkbox" name="dubbed" value="1" defaultChecked={params.dubbed === '1'} />{fa ? 'فقط دوبله فارسی' : 'Persian dub only'}</label>
            {params.sort && <input type="hidden" name="sort" value={params.sort} />}
            <button className="btn cn-btn-primary" type="submit">{fa ? 'اعمال فیلتر' : 'Apply'}</button>
            <Link href="/cinema/browse" className="cn-filter-reset">{fa ? 'پاک کردن' : 'Reset'}</Link>
          </form>
        </aside>
        <section>
          <header className="md-page-head">
            <h1>{title}</h1>
            <p className="muted">{result.total.toLocaleString(fa ? 'fa-IR' : 'en-US')} {fa ? 'عنوان' : 'titles'}</p>
            <div className="md-sort">{sorts.map(([key, label]) => <Link key={label} href={href({ sort: key })} className={(params.sort || undefined) === key ? 'is-active' : ''}>{label}</Link>)}</div>
          </header>
          {result.titles.length ? <div className="cn-grid">{result.titles.map((item) => <PosterCard key={item.id} item={item} fa={fa} />)}</div> : <EmptyState fa={fa} title={fa ? 'عنوانی پیدا نشد' : 'Nothing found'} text={fa ? 'فیلترها را تغییر دهید.' : 'Try different filters.'} />}
          <Pager page={result.page} pages={result.pages} fa={fa} href={(page) => { const q = new URLSearchParams(Object.entries({ ...params, page: String(page) }).filter(([, v]) => v) as [string, string][]); return `/cinema/browse?${q}` }} />
        </section>
      </div>
    </MediaShell>
  )
}
