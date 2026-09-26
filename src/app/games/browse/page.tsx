import type { Metadata } from 'next'
import Link from 'next/link'
import { requireModule } from '@/extensions/server/modules'
import { browseGames, getGamesHome } from '@/modules/media/server/queries'
import { getServerLocale } from '@/i18n/server'
import MediaShell from '@/components/media/MediaShell'
import { gamesNav } from '@/components/media/nav'
import { Chips, EmptyState, GameCard } from '@/components/media/MediaCards'
import Pager from '@/components/media/Pager'

export const dynamic = 'force-dynamic'
type Search = { platform?: string; genre?: string; sort?: string; q?: string; page?: string }

export async function generateMetadata({ searchParams }: { searchParams: Promise<Search> }): Promise<Metadata> {
  const [p, locale] = await Promise.all([searchParams, getServerLocale()])
  const fa = locale === 'fa'
  return { title: [fa ? 'بازی‌ها' : 'Games', p.platform, p.genre].filter(Boolean).join(' · '), robots: p.q ? { index: false } : undefined }
}

export default async function GamesBrowsePage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireModule('games')
  const [params, locale] = await Promise.all([searchParams, getServerLocale()])
  const fa = locale === 'fa'
  const [result, facets] = await Promise.all([browseGames({ ...params, page: Number(params.page) }), getGamesHome()])
  const href = (patch: Partial<Search>) => {
    const q = new URLSearchParams(Object.entries({ ...params, page: undefined, ...patch }).filter(([, v]) => v) as [string, string][])
    return q.toString() ? `/games/browse?${q}` : '/games/browse'
  }
  const platform = String(params.platform || '')
  const active = params.sort === 'score' ? 'top' : platform.startsWith('PS') ? 'ps' : platform.startsWith('Xbox') ? 'xbox' : platform === 'PC' ? 'pc' : platform === 'Android' || platform === 'iOS' ? 'mobile' : 'latest'
  const sorts: [string | undefined, string][] = [[undefined, fa ? 'تازه‌ترین' : 'Newest'], ['score', fa ? 'بیشترین نمره' : 'Top score'], ['release', fa ? 'تاریخ انتشار' : 'Release date']]
  return (
    <MediaShell section="games" active={active} nav={gamesNav(fa)} search={{ action: '/games/browse', placeholder: fa ? 'جست‌وجوی بازی…' : 'Search games…', value: params.q }}>
      <div className="container md-body">
        <header className="md-page-head">
          <h1>{params.q ? (fa ? `جست‌وجو: «${params.q}»` : `Search: “${params.q}”`) : [fa ? 'بازی‌ها' : 'Games', params.platform, params.genre].filter(Boolean).join(' · ')}</h1>
          <p className="muted">{result.total.toLocaleString(fa ? 'fa-IR' : 'en-US')} {fa ? 'بازی' : 'games'}</p>
          <div className="md-sort">{sorts.map(([key, label]) => <Link key={label} href={href({ sort: key })} className={(params.sort || undefined) === key ? 'is-active' : ''}>{label}</Link>)}</div>
        </header>
        <Chips items={facets.platforms} active={params.platform} hrefFor={(p) => href({ platform: p })} all={{ label: fa ? 'همه پلتفرم‌ها' : 'All platforms', href: href({ platform: undefined }) }} />
        <Chips items={facets.genres} active={params.genre} hrefFor={(g) => href({ genre: g })} all={{ label: fa ? 'همه سبک‌ها' : 'All genres', href: href({ genre: undefined }) }} />
        {result.games.length ? <div className="gm-grid">{result.games.map((game) => <GameCard key={game.id} game={game} fa={fa} />)}</div> : <EmptyState fa={fa} title={fa ? 'بازی‌ای پیدا نشد' : 'No games found'} />}
        <Pager page={result.page} pages={result.pages} fa={fa} href={(page) => { const q = new URLSearchParams(Object.entries({ ...params, page: String(page) }).filter(([, v]) => v) as [string, string][]); return `/games/browse?${q}` }} />
      </div>
    </MediaShell>
  )
}
