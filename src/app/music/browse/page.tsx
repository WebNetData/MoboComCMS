import type { Metadata } from 'next'
import { listingMeta } from '@/modules/seo/domain/seo'
import { toPublicPath } from '@/platform/routing/aliases'
import { ownerIdsForTermSlug, termTree } from '@/modules/taxonomy/server/taxonomy'
import Link from '@/components/AppLink'
import { requireModule } from '@/extensions/server/modules'
import { browseMusic, getMusicGenres } from '@/modules/media/server/queries'
import { getServerLocale } from '@/i18n/server'
import MediaShell from '@/components/media/MediaShell'
import { musicNav } from '@/components/media/nav'
import { Chips, EmptyState } from '@/components/media/MediaCards'
import { TrackList } from '@/components/media/PlayButton'
import { toPlayerTracks } from '@/components/media/player-types'
import Pager from '@/components/media/Pager'

export const dynamic = 'force-dynamic'

type Search = { q?: string; genre?: string; lang?: string; sort?: string; page?: string }

export async function generateMetadata({ searchParams }: { searchParams: Promise<Search> }): Promise<Metadata> {
  const [params, locale] = await Promise.all([searchParams, getServerLocale()])
  const fa = locale === 'fa'
  const bits = [params.genre, params.lang, params.q].filter(Boolean).join(' · ')
  return { title: bits ? `${fa ? 'موزیک' : 'Music'}: ${bits}` : fa ? 'همه آهنگ‌ها' : 'All songs', ...(() => { const seo = listingMeta('/music/browse', params, ['genre', 'lang', 'page']); return { alternates: { canonical: toPublicPath(seo.canonical) }, robots: seo.index ? undefined : { index: false, follow: true } } })() }
}

export default async function MusicBrowsePage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireModule('music')
  const [params, locale] = await Promise.all([searchParams, getServerLocale()])
  const fa = locale === 'fa'
  const languages = await termTree('music-language').catch(() => [])
  // A language narrows the same list the genre and the search narrow; an unknown one is ignored.
  const language = params.lang ? languages.flatMap((term) => [term, ...term.children]).find((term) => term.slug === params.lang) || null : null
  const [result, genres] = await Promise.all([browseMusic({ q: params.q, genre: params.genre, sort: params.sort, page: Number(params.page), ids: language ? await ownerIdsForTermSlug('music-language', language.slug) : null }), getMusicGenres()])
  const query = (patch: Partial<Search>) => {
    const next = new URLSearchParams(Object.entries({ ...params, page: undefined, ...patch }).filter(([, v]) => v) as [string, string][])
    const text = next.toString()
    return text ? `/music/browse?${text}` : '/music/browse'
  }
  const heading = params.q ? (fa ? `نتایج «${params.q}»` : `Results for “${params.q}”`) : params.genre || language ? (fa ? `آهنگ‌های ${[params.genre, language?.name].filter(Boolean).join(' · ')}` : `${[params.genre, language?.name].filter(Boolean).join(' · ')} songs`) : params.sort === 'popular' ? (fa ? 'پربازدیدترین آهنگ‌ها' : 'Most played') : (fa ? 'جدیدترین آهنگ‌ها' : 'New releases')

  return (
    <MediaShell section="music" active={params.sort === 'popular' ? 'top' : 'new'} nav={musicNav(fa)} search={{ action: '/music/browse', placeholder: fa ? 'جست‌وجوی آهنگ یا خواننده…' : 'Search songs or artists…', value: params.q }}>
      <div className="container md-body">
        <header className="md-page-head">
          <h1>{heading}</h1>
          <p className="muted">{result.total.toLocaleString(fa ? 'fa-IR' : 'en-US')} {fa ? 'آهنگ' : 'songs'}</p>
          <div className="md-sort">
            <Link href={query({ sort: undefined })} className={params.sort !== 'popular' ? 'is-active' : ''}>{fa ? 'جدیدترین' : 'Newest'}</Link>
            <Link href={query({ sort: 'popular' })} className={params.sort === 'popular' ? 'is-active' : ''}>{fa ? 'محبوب‌ترین' : 'Most played'}</Link>
          </div>
        </header>
        {languages.length > 0 && <nav className="mu-lang-row" aria-label={fa ? 'زبان و گویش' : 'Language'}><span>{fa ? 'زبان و گویش' : 'Language'}</span><Link href={query({ lang: undefined })} className={language ? '' : 'is-active'}>{fa ? 'همه' : 'All'}</Link>{languages.map((term) => <Link key={term.id} href={query({ lang: term.slug })} className={language?.id === term.id ? 'is-active' : ''} aria-current={language?.id === term.id ? 'true' : undefined}>{term.name}</Link>)}</nav>}
        <Chips items={genres} active={params.genre} hrefFor={(g) => query({ genre: g })} all={{ label: fa ? 'همه' : 'All', href: query({ genre: undefined }) }} />
        {result.tracks.length ? <div className="mu-panel"><TrackList tracks={toPlayerTracks(result.tracks, fa)} /></div> : <EmptyState fa={fa} title={fa ? 'آهنگی پیدا نشد' : 'No songs found'} text={fa ? 'عبارت دیگری را جست‌وجو کنید.' : 'Try another search.'} />}
        <Pager page={result.page} pages={result.pages} href={(page) => { const q = new URLSearchParams(Object.entries({ ...params, page: String(page) }).filter(([, v]) => v) as [string, string][]); return `/music/browse?${q}` }} fa={fa} />
      </div>
    </MediaShell>
  )
}
