import type { Metadata } from 'next'
import { listingMeta } from '@/modules/seo/domain/seo'
import { toPublicPath } from '@/platform/routing/aliases'
import Link from '@/components/AppLink'
import { requireModule } from '@/extensions/server/modules'
import { browseGames, gameFacets } from '@/modules/media/server/queries'
import { gameGenres } from '@/modules/media/server/games-portal'
import { ownerIdsForTermSlug } from '@/modules/taxonomy/server/taxonomy'
import MediaShell from '@/components/media/MediaShell'
import { EmptyState } from '@/components/media/MediaCards'
import Pager from '@/components/media/Pager'
import { BrowseFilters, CoverGrid } from '@/components/games/GamePortal'
import { activeVocabulary } from '@/modules/games/server/vocabulary'

export const dynamic = 'force-dynamic'
type Search = { platform?: string; genre?: string; term?: string; developer?: string; publisher?: string; developerStudioId?: string; publisherStudioId?: string; sort?: string; q?: string; page?: string; lang?: string; mode?: string; year?: string; pick?: string }

function heading(p: Search, genreName?: string) {
  if (p.q) return `نتایج جست‌وجوی «${p.q}»`
  if (p.pick === 'editors') return 'بازی‌های انتخاب سردبیر'
  if (p.pick === 'upcoming') return 'بازی‌های در راه'
  const parts = [genreName || p.genre, p.lang === 'FA_DUB' && 'با دوبلهٔ فارسی', p.lang === 'FA_SUB' && 'با زیرنویس فارسی', p.year && `سال ${Number(p.year).toLocaleString('fa-IR', { useGrouping: false })}`, p.platform && `برای ${p.platform}`, p.publisher && `از ${p.publisher}`, p.developer && `ساخت ${p.developer}`].filter(Boolean)
  return parts.length ? `بازی‌های ${parts.join(' ')}` : p.sort === 'score' ? 'برترین بازی‌ها' : p.sort === 'views' ? 'محبوب‌ترین بازی‌ها' : 'همهٔ بازی‌ها'
}

export async function generateMetadata({ searchParams }: { searchParams: Promise<Search> }): Promise<Metadata> {
  const p = await searchParams
  return { title: heading(p), ...(() => { const seo = listingMeta('/games/browse', p as Record<string, string | undefined>, ['genre', 'platform', 'page']); return { alternates: { canonical: toPublicPath(seo.canonical) }, robots: seo.index ? undefined : { index: false, follow: true } } })() }
}

/** GameUp browser: big search, filter selects (platform, genre, publisher, developer), cover grid. */
export default async function GamesBrowsePage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireModule('games')
  const params = await searchParams
  const ids = params.term ? await ownerIdsForTermSlug('games', params.term) : null
  const [result, facets, genres, vocabulary] = await Promise.all([
    browseGames({ platform: params.platform, genre: params.genre, developer: params.developer, publisher: params.publisher, developerStudioId: Number(params.developerStudioId) || undefined, publisherStudioId: Number(params.publisherStudioId) || undefined, sort: params.sort, q: params.q, lang: params.lang, mode: params.mode, year: params.year, pick: params.pick, page: Number(params.page) || 1, ...(ids ? { ids } : {}) }),
    gameFacets(),
    gameGenres(),
    activeVocabulary(),
  ])
  const years = Array.from({ length: 12 }, (_, i) => new Date().getUTCFullYear() + 1 - i)
  const select = (name: keyof Search, label: string, options: [string, string][]) => <label className="gx-select"><span>{label}:</span><select name={name} defaultValue={params[name] || ''}><option value="">همه</option>{options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>
  const genreName = genres.options.find((option) => option.value === params.term)?.label.replace(/^(— )+/, '')
  const href = (patch: Partial<Search>) => {
    const q = new URLSearchParams(Object.entries({ ...params, page: undefined, ...patch }).filter(([, v]) => v) as [string, string][])
    return q.toString() ? `/games/browse?${q}` : '/games/browse'
  }
  const sorts: [string | undefined, string][] = [[undefined, 'تازه‌ترین'], ['score', 'بیشترین نمره'], ['views', 'محبوب‌ترین'], ['release', 'تاریخ انتشار']]
  return (
    <MediaShell section="games" search={{ action: '/games/browse', placeholder: 'جست‌وجوی بازی…', value: params.q }}>
      <div className="container gx-browse">
        <BrowseFilters action="/games/browse" values={params} facets={{ genres: genres.options, platforms: facets.platforms, developers: facets.developers, publishers: facets.publishers }}>
          <div className="gx-selects">
            {select('lang', 'فارسی‌سازی', vocabulary.LOCALIZATION.map((entry) => [entry.code, entry.name]))}
            {select('mode', 'حالت بازی', vocabulary.MODE.map((entry) => [entry.code, entry.name]))}
            {select('year', 'سال انتشار', years.map((y) => [String(y), y.toLocaleString('fa-IR', { useGrouping: false })]))}
            {select('pick', 'فهرست', [['editors', 'انتخاب سردبیر'], ['upcoming', 'در راه']])}
          </div>
        </BrowseFilters>
        <header className="gx-browse-head">
          <h1>{heading(params, genreName)}</h1>
          <span>{result.total.toLocaleString('fa-IR')} بازی</span>
        </header>
        <nav className="gx-sorts" aria-label="مرتب‌سازی">{sorts.map(([key, label]) => <Link key={label} href={href({ sort: key })} className={(params.sort || undefined) === key ? 'is-active' : ''}>{label}</Link>)}</nav>
        {result.games.length ? <CoverGrid games={result.games} /> : <EmptyState fa title="بازی‌ای پیدا نشد" text="فیلترها یا عبارت جست‌وجو را تغییر دهید." />}
        <Pager page={result.page} pages={result.pages} fa href={(page) => href({ page: page > 1 ? String(page) : undefined })} />
      </div>
    </MediaShell>
  )
}
