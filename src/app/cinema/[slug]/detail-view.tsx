import SectionName from '@/components/site/SectionName'
import { contentPath as designContentPath } from '@/platform/routing/aliases'
import type { BuilderPreview } from '@/modules/site/server/builder-preview'
import { contentRouteParams } from '@/shared/routing/params'
import type { Metadata } from 'next'
import { creditProfiles } from '@/modules/cinema/server/people'
import { creditsOf, normalizePersonName } from '@/modules/cinema/domain/people'
import ManageBar from '@/components/admin/ManageBar'
import Link from '@/components/AppLink'
import { notFound, redirect } from 'next/navigation'
import { requireModule } from '@/extensions/server/modules'
import { getTitle } from '@/modules/media/server/queries'
import { getViewer } from '@/modules/membership/server/membership'
import { formatRuntime, trailerSource } from '@/modules/media/domain/media'
import { toEmbedUrl } from '@/modules/site/domain/builder'
import { getServerLocale } from '@/i18n/server'
import MediaShell from '@/components/media/MediaShell'
import { cinemaNav } from '@/components/media/nav'
import { ImdbBadge, PosterCard, Shelf, VipBadge, VipGate, yr } from '@/components/media/MediaCards'
import LinkBox from '@/components/media/LinkBox'
import { paywallView } from '@/modules/paywall/server/paywall'
import BuyContent from '@/components/paywall/BuyContent'
import { ItemActionBar, ReviewSection } from '@/components/engage/Engagement'
import SeasonTabs, { type SeasonView } from '@/components/media/SeasonTabs'
import Trailer from '@/components/media/Trailer'
import { toPublicPath } from '@/platform/routing/aliases'
import Slider from '@/components/site/Slider'
import { safeJsonLd } from '@/shared/seo/json-ld'
import { formatLabel } from '@/modules/cinema/domain/formats'
import { sized, srcSet } from '@/shared/media/image'
import type { CSSProperties } from 'react'
import { shareCard } from '@/modules/site/server/seo'
import { resolveCanonicalAliasSlug } from '@/modules/content/server/canonical-alias'

export const dynamic = 'force-dynamic'
type Props = { params: Promise<{ slug: string }>; preview?: BuilderPreview }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ slug }, locale] = await Promise.all([contentRouteParams(params), getServerLocale()])
  const canonical = await resolveCanonicalAliasSlug('cinema', slug)
  if (canonical) redirect(canonical)
  const data = await getTitle(slug)
  if (!data) return {}
  const fa = locale === 'fa'
  const ti = data.title
  const name = fa ? ti.title : ti.titleEn || ti.title
  const kind = ti.kind === 'SERIES' ? (fa ? 'سریال' : 'series') : (fa ? 'فیلم' : 'movie')
  return shareCard({
    title: fa ? `دانلود ${kind} ${name}${ti.year ? ` ${ti.year}` : ''}${ti.dubbed ? ' با دوبله فارسی' : ''}` : `${name}${ti.year ? ` (${ti.year})` : ''}`,
    description: (fa ? ti.summary : ti.summaryEn || ti.summary).slice(0, 160) || undefined,
    openGraph: { images: ti.backdrop || ti.poster ? [ti.backdrop || ti.poster] : undefined, type: ti.kind === 'SERIES' ? 'video.tv_show' : 'video.movie' },
    alternates: { canonical: toPublicPath(`/cinema/${ti.slug}`) },
  })
}

export default async function TitlePage({ params, preview }: Props) {
  await requireModule('cinema')
  const [{ slug }, locale, viewer] = await Promise.all([contentRouteParams(params), getServerLocale(), getViewer()])
  const canonical = await resolveCanonicalAliasSlug('cinema', slug)
  if (canonical) redirect(canonical)
  const data = await getTitle(slug)
  if (!data) notFound()
  const fa = locale === 'fa'
  const { title: ti } = data
  const name = fa ? ti.title : ti.titleEn || ti.title
  const summary = fa ? ti.summary : ti.summaryEn || ti.summary
  const paywall = await paywallView(viewer, [{ ownerType: 'title', ownerId: ti.id }])
  const locked = paywall ? !paywall.open : ti.access === 'MEMBERS' && !viewer.opens
  const trailer = trailerSource(ti.trailerUrl, toEmbedUrl)
  const num = (n: number) => n.toLocaleString(fa ? 'fa-IR' : 'en-US')
  const seasons: SeasonView[] = data.seasons.map((season) => ({
    number: season.number,
    name: season.name,
    episodes: season.episodes.map((episode) => ({
      id: episode.id, number: episode.number,
      title: fa ? episode.title : episode.titleEn || episode.title,
      summary: episode.summary, summaryHtml: episode.summaryHtml, still: episode.still,
      runtime: episode.runtime ? formatRuntime(episode.runtime, fa) : '',
      airDate: episode.airDate ? new Date(episode.airDate).toLocaleDateString(fa ? 'fa-IR' : 'en-US') : '',
      vip: !paywall && (episode.access === 'MEMBERS' || ti.access === 'MEMBERS'),
      linkCount: episode.links.length,
      links: <LinkBox links={episode.links} fa={fa} member={viewer.opens} loggedIn={!!viewer.userId} parentLocked={episode.access === 'MEMBERS' || ti.access === 'MEMBERS'} compact paywall={paywall} />,
    })),
  }))
  const episodes = data.seasons.reduce((sum, s) => sum + s.episodes.length, 0)
  // Names the page shows lead to the person's own page when the person is known.
  const people = await creditProfiles(ti.id)
  const personHref = (name: string) => { const id = people.get(normalizePersonName(name))?.id; return id ? `/cinema/people/${id}` : null }
  const facts: [string, string][] = [
    [fa ? 'کارگردان' : 'Director', ti.director],
    [fa ? 'تهیه‌کننده' : 'Producer', ti.producer],
    [fa ? 'کشور' : 'Country', ti.countries.join('، ')],
    [fa ? 'زبان' : 'Language', ti.languages.join('، ')],
    [fa ? 'رده سنی' : 'Rating', ti.ageRating],
    [fa ? 'کیفیت' : 'Quality', ti.quality],
    ...(ti.kind === 'SERIES' ? [[fa ? 'وضعیت' : 'Status', ti.seriesStatus === 'ENDED' ? (fa ? 'پایان یافته' : 'Ended') : ti.seriesStatus === 'ONGOING' ? (fa ? 'در حال پخش' : 'Ongoing') : ''] as [string, string]] : []),
  ].filter(([, v]) => v) as [string, string][]
  const ref = { type: 'title' as const, id: ti.id }
  const jsonLd = { '@context': 'https://schema.org', '@type': ti.kind === 'SERIES' ? 'TVSeries' : 'Movie', name, ...(ti.originalTitle ? { alternateName: ti.originalTitle } : {}), ...(ti.poster ? { image: ti.poster } : {}), ...(summary ? { description: summary.slice(0, 300) } : {}), ...(ti.year ? { datePublished: String(ti.year) } : {}), ...(ti.director ? { director: { '@type': 'Person', name: ti.director } } : {}), genre: ti.genres, ...(ti.imdbRating != null ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: ti.imdbRating, bestRating: 10, ratingCount: 1 } } : {}) }

  return (
    <MediaShell design={{ surface: ti.kind === 'SERIES' ? 'series' : 'movie', entryId: ti.id, preview, values: { title: name, cover: ti.poster || '', excerpt: '', author: '', url: designContentPath('title', ti.slug) } }} section="cinema" active={ti.kind === 'SERIES' ? 'series' : 'movies'} nav={cinemaNav(fa)} search={{ action: '/cinema/browse', placeholder: fa ? 'نام فیلم، سریال یا کارگردان…' : 'Film, series or director…' }}>
      <ManageBar title={ti.kind === 'SERIES' ? 'مدیریت سریال' : 'مدیریت فیلم'} anyOf={['cinema.manage']} links={[{ href: `/admin/cinema/titles?edit=${ti.id}`, label: 'ویرایش' }, { href: '/admin/cinema/titles', label: 'همهٔ فیلم‌ها و سریال‌ها' }]} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
      <section className="cn-detail-hero">
        <div className="cn-hero-bg is-active" style={ti.backdrop ? { '--cn-bg': `url("${sized(ti.backdrop, 1280).replace(/"/g, '%22')}")`, '--cn-bg-sm': `url("${sized(ti.backdrop, 960).replace(/"/g, '%22')}")` } as CSSProperties : undefined} aria-hidden="true" />
        <div className="cn-hero-shade" aria-hidden="true" />
        <div className="container cn-detail-inner">
          <div className="cn-detail-poster">{ti.poster ? <img src={sized(ti.poster, 320)} srcSet={srcSet(ti.poster, 320)} alt={name} /> : <span className="cn-noart">🎬</span>}{ti.access === 'MEMBERS' && <VipBadge fa={fa} />}</div>
          <div className="cn-detail-info">
            <nav className="cn-crumbs"><Link href="/cinema"><SectionName id="cinema" fa={fa} en="Cinema">فیلم و سریال</SectionName></Link> / <Link href={ti.format ? `/cinema/browse?format=${ti.format.slug}` : `/cinema/browse?kind=${ti.kind}`}>{formatLabel(ti, fa)}</Link></nav>
            <h1>{name}</h1>
            {ti.originalTitle && ti.originalTitle !== name && <p className="cn-hero-sub" dir="ltr">{ti.originalTitle}{ti.year ? ` (${ti.year}${ti.endYear ? `–${ti.endYear}` : ''})` : ''}</p>}
            <div className="cn-meta">
              <ImdbBadge rating={ti.imdbRating} fa={fa} large />
              {ti.year ? <span>{yr(ti.year, fa)}</span> : null}
              {ti.runtime ? <span>⏱ {formatRuntime(ti.runtime, fa)}</span> : null}
              {ti.kind === 'SERIES' && <span>{num(data.seasons.length)} {fa ? 'فصل' : 'seasons'} · {num(episodes)} {fa ? 'قسمت' : 'episodes'}</span>}
              {ti.ageRating && <span className="cn-age">{ti.ageRating}</span>}
              {ti.dubbed && <span className="cn-badge is-dub">{fa ? 'دوبله فارسی' : 'Persian dub'}</span>}
              {ti.subtitle && <span className="cn-badge is-sub">{fa ? 'زیرنویس فارسی' : 'Persian subs'}</span>}
            </div>
            <div className="cn-genres">{ti.genres.map((g) => <Link key={g} href={`/cinema/browse?genre=${encodeURIComponent(g)}`}>{g}</Link>)}</div>
            {summary && <div className="cn-summary prose" dangerouslySetInnerHTML={{ __html: fa ? ti.summaryHtml : ti.summaryEnHtml || ti.summaryHtml }} />}
            <div className="cn-hero-actions">
              <a href="#watch" className="btn cn-btn-primary">{locked ? (paywall ? `🛒 ${fa ? 'خرید' : 'Buy'} · ${paywall.price}` : `♛ ${fa ? 'ویژه VIP' : 'VIP only'}`) : `▶ ${fa ? 'تماشا و دانلود' : 'Watch & download'}`}</a>
              <Trailer embed={trailer.embed} src={trailer.src} fa={fa} />
            </div>
            <ItemActionBar item={ref} title={name} image={ti.poster} followLabel={ti.kind === 'SERIES' ? 'قسمت جدید' : 'لینک‌های جدید'} />
            {facts.length > 0 && <dl className="cn-facts">{facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v === ti.director || v === ti.producer ? creditsOf({ director: v, cast: [] }).map((credit, i) => { const href = personHref(credit.name); return <span key={credit.name}>{i > 0 && (fa ? '، ' : ', ')}{href ? <Link href={href}>{credit.name}</Link> : credit.name}</span> }) : v}</dd></div>)}</dl>}
          </div>
        </div>
      </section>

      <div className="container md-body">
        {ti.cast.length > 0 && (
          <section className="md-shelf">
            <header className="md-shelf-head"><h2>{fa ? 'بازیگران' : 'Cast'}</h2></header>
            <Slider className="md-rail cn-cast">{ti.cast.map((person, i) => { const href = personHref(person.name); const profile=people.get(normalizePersonName(person.name)); const image=profile&&(profile.imageLocked||profile.image)?profile.image:person.image; const inner = <>{image ? <img src={sized(image, 160)} srcSet={srcSet(image, 160)} alt="" loading="lazy" /> : <i>{person.name.slice(0, 1)}</i>}<b>{person.name}</b>{person.role && <small>{person.role}</small>}</>; return href ? <Link key={`${person.name}-${i}`} href={href} className="cn-person">{inner}</Link> : <div key={`${person.name}-${i}`} className="cn-person">{inner}</div> })}</Slider>
          </section>
        )}

        <section id="watch" className="cn-watch">
          <header className="md-shelf-head"><div><span className="md-eyebrow">{fa ? 'باکس دانلود' : 'Downloads'}</span><h2>{ti.kind === 'SERIES' ? (fa ? 'فصل‌ها و قسمت‌ها' : 'Seasons & episodes') : (fa ? 'لینک‌های دانلود و پخش' : 'Download & stream')}</h2></div></header>
          {paywall && !paywall.open && <BuyContent view={paywall} loggedIn={!!viewer.userId} next={`/cinema/${ti.slug}#buy`} noun={ti.kind === 'SERIES' ? 'سریال' : 'فیلم'} />}
          {paywall?.open && paywall.reason === 'purchased' && <span className="pw-owned">✓ {fa ? 'این مورد را خریده‌اید' : 'You own this'}</span>}
          {!paywall && locked && <VipGate fa={fa} loggedIn={!!viewer.userId} next={`/cinema/${ti.slug}`} title={fa ? `تماشای «${name}» مخصوص اعضای VIP است` : `“${name}” is for VIP members`} />}
          {ti.kind === 'SERIES'
            ? <SeasonTabs seasons={seasons} fa={fa} />
            : <LinkBox links={data.links} fa={fa} member={viewer.opens} loggedIn={!!viewer.userId} parentLocked={ti.access === 'MEMBERS'} paywall={paywall} />}
          {ti.kind === 'SERIES' && data.links.length > 0 && <LinkBox title={fa ? 'دانلود یکجا' : 'Full pack'} links={data.links} fa={fa} member={viewer.opens} loggedIn={!!viewer.userId} parentLocked={ti.access === 'MEMBERS'} paywall={paywall} />}
          <p className="muted text-sm cn-watch-note">{fa ? 'لینک‌ها از مسیر امن سایت باز می‌شوند. برای پخش بهتر از VLC یا MX Player استفاده کنید.' : 'Links open through a protected site route. VLC or MX Player recommended.'}</p>
        </section>

        <ReviewSection item={ref} title={name} path={`/cinema/${ti.slug}`} />
        {data.similar.length > 0 && <Shelf tone="cinema" title={fa ? 'پیشنهادهای مشابه' : 'You may also like'}>{data.similar.map((item) => <PosterCard key={item.id} item={item} fa={fa} />)}</Shelf>}
      </div>
    </MediaShell>
  )
}
