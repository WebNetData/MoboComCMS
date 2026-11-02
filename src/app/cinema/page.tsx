import type { Metadata } from 'next'
import { withSectionSeo } from '@/modules/site/server/section-seo'
import { requireModule } from '@/extensions/server/modules'
import { getCinemaHome, type TitleCard } from '@/modules/media/server/queries'
import { getViewer } from '@/modules/membership/server/membership'
import { getServerLocale } from '@/i18n/server'
import MediaShell from '@/components/media/MediaShell'
import { cinemaNav } from '@/components/media/nav'
import { Chips, EmptyState, PosterCard, Shelf, yr } from '@/components/media/MediaCards'
import CinemaHero, { type HeroSlide } from '@/components/media/CinemaHero'
import VipStrip from '@/components/media/VipStrip'
import { sectionLanding } from '@/modules/site/server/pages/section/landing'
import { toPublicPath } from '@/platform/routing/aliases'
import { getCinemaSettings } from '@/modules/cinema/server/admin'
import { railOrder } from '@/shared/section-layout'
import type { CinemaRail } from '@/modules/cinema/domain/cinema'
import { Fragment, type ReactNode } from 'react'
import Link from '@/components/AppLink'
import { continueWatching } from '@/modules/cinema/server/progress'
import { formatLabel } from '@/modules/cinema/domain/formats'
import { sized, srcSet } from '@/shared/media/image'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const fa = (await getServerLocale()) === 'fa'
  return withSectionSeo('cinema', { title: fa ? 'فیلم و سریال — دانلود و تماشای آنلاین' : 'Films & series — watch and download', description: fa ? 'جدیدترین فیلم‌ها و سریال‌ها با دوبله و زیرنویس فارسی، کیفیت‌های مختلف و لینک مستقیم' : 'The latest films and series with Persian dub and subtitles in every quality.', alternates: { canonical: toPublicPath('/cinema') } })
}

export default async function CinemaHomePage() {
  await requireModule('cinema')
  const landing = await sectionLanding('cinema')
  if (landing) return landing
  const settings = await getCinemaSettings()
  const [data, locale, viewer] = await Promise.all([getCinemaHome({ shelfSize: settings.shelfSize, genreShelves: settings.genreShelfCount, topRatedMin: settings.topRatedMin, heroIds: settings.heroIds }), getServerLocale(), getViewer()])
  const watching = viewer.userId ? await continueWatching(viewer.userId) : []
  const fa = locale === 'fa'
  const slides: HeroSlide[] = data.hero.map((ti) => ({
    slug: ti.slug,
    title: fa ? ti.title : ti.titleEn || ti.title,
    subtitle: ti.originalTitle && ti.originalTitle !== ti.title ? ti.originalTitle : '',
    summary: (fa ? ti.summary : ti.summaryEn || ti.summary).slice(0, 260),
    backdrop: ti.backdrop, poster: ti.poster,
    imdb: settings.showImdb && ti.imdbRating != null ? ti.imdbRating.toLocaleString(fa ? 'fa-IR' : 'en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '',
    year: ti.year ? yr(ti.year, fa) : '',
    genres: ti.genres.slice(0, 3),
    badges: [ti.quality, ti.dubbed ? (fa ? 'دوبله فارسی' : 'Persian dub') : '', ti.subtitle ? (fa ? 'زیرنویس' : 'Subtitles') : ''].filter(Boolean),
    vip: ti.access === 'MEMBERS',
    kindLabel: ti.format ? formatLabel(ti, fa) : ti.kind === 'SERIES' ? (fa ? 'سریال' : 'Series') : (fa ? 'فیلم سینمایی' : 'Movie'),
  }))
  const shelf = (title: string, items: TitleCard[], href?: string, eyebrow?: string, ranked = false) => items.length > 0 && (
    <Shelf tone="cinema" title={title} eyebrow={eyebrow} href={href} more={fa ? 'مشاهده همه ←' : 'See all →'}>
      {items.map((item, i) => <PosterCard key={item.id} item={item} fa={fa} rank={ranked ? i + 1 : undefined} />)}
    </Shelf>
  )
  const empty = !data.movies.length && !data.series.length

  // Blocks render in the order (and visibility) chosen in «مدیریت فیلم و سریال ← صفحهٔ اصلی».
  const blocks: Record<CinemaRail, () => ReactNode> = {
    hero: () => null,
    genres: () => data.genres.length > 0 && <Chips items={data.genres} hrefFor={(g) => `/cinema/browse?genre=${encodeURIComponent(g)}`} all={{ label: fa ? 'همه ژانرها' : 'All genres', href: '/cinema/browse' }} />,
    movies: () => shelf(fa ? 'جدیدترین فیلم‌ها' : 'New movies', data.movies, '/cinema/browse?kind=MOVIE', fa ? 'تازه‌ها' : 'Fresh'),
    series: () => shelf(fa ? 'سریال‌های تازه' : 'New series', data.series, '/cinema/browse?kind=SERIES', fa ? 'قسمت‌های جدید' : 'New episodes'),
    topRated: () => shelf(fa ? 'برترین‌ها از نگاه IMDb' : 'Top rated on IMDb', data.topRated, '/cinema/browse?sort=imdb', fa ? 'رتبه‌بندی' : 'Ranking', true),
    dubbed: () => shelf(fa ? 'دوبله فارسی' : 'Persian dub', data.dubbed, '/cinema/browse?dubbed=1'),
    members: () => data.members.length > 0 && <section className="cn-vip-shelf">{shelf(fa ? 'ویژه اعضای VIP' : 'VIP exclusives', data.members, undefined, '♛ VIP')}</section>,
    formatShelves: () => data.formatShelves.map((row) => row.titles.length > 0 && <div key={row.slug}>{shelf(fa ? row.plural || row.name : row.nameEn || row.name, row.titles, `/cinema/browse?format=${row.slug}`, row.icon || undefined)}</div>),
    genreShelves: () => data.genreShelves.map((row) => row.titles.length > 0 && <div key={row.genre}>{shelf(row.genre, row.titles, `/cinema/browse?genre=${encodeURIComponent(row.genre)}`)}</div>),
    vipStrip: () => !viewer.member && <VipStrip fa={fa} kind="cinema" />,
  }
  const order = railOrder(settings.rails)

  return (
    <MediaShell section="cinema" active="home" nav={cinemaNav(fa)} search={{ action: '/cinema/browse', placeholder: fa ? 'نام فیلم، سریال یا کارگردان…' : 'Film, series or director…' }}>
      {!(order.includes('hero') && slides.length) && <h1 className="sr-only">{fa ? 'فیلم و سریال' : 'Films and series'}</h1>}
      {order.includes('hero') && <CinemaHero slides={slides} fa={fa} />}
      <div className="container md-body">
        {watching.length > 0 && <Shelf tone="cinema" title={fa ? 'ادامهٔ تماشا' : 'Continue watching'} eyebrow={fa ? 'کتابخانهٔ شما' : 'Your library'}>
          {watching.map((item) => <Link key={item.key} href={item.href} className="cn-continue-card">
            <span className="cn-continue-poster">{item.poster ? <img src={sized(item.poster, 160)} srcSet={srcSet(item.poster, 160)} alt="" loading="lazy" /> : <span aria-hidden="true">▶</span>}</span>
            <b>{fa ? item.title : item.titleEn || item.title}</b>
            {item.subtitle && <small dir="auto">{item.subtitle}</small>}
            <span className="cn-continue-progress" role="meter" aria-valuenow={item.percent} aria-valuemin={0} aria-valuemax={100} aria-label={fa ? 'پیشرفت تماشا' : 'Watch progress'}><span style={{ width: `${item.percent}%` }} /></span>
          </Link>)}
        </Shelf>}
        {empty && <EmptyState fa={fa} title={fa ? 'سینمای سایت آماده است' : 'The cinema is ready'} text={fa ? 'به‌زودی فیلم‌ها و سریال‌های تازه اینجا منتشر می‌شوند.' : 'New films and series are coming soon.'} />}
        {order.filter((key) => key !== 'hero').map((key) => <Fragment key={key}>{blocks[key]()}</Fragment>)}
      </div>
    </MediaShell>
  )
}
