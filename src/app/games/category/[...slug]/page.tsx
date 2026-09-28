import type { Metadata } from 'next'
import Link from '@/components/AppLink'
import { notFound } from 'next/navigation'
import { requireModule } from '@/extensions/server/modules'
import { browseGames, gameFacets } from '@/modules/media/server/queries'
import { gameGenres } from '@/modules/media/server/games-portal'
import { resolveTermPath } from '@/modules/taxonomy/server/taxonomy'
import MediaShell from '@/components/media/MediaShell'
import { EmptyState } from '@/components/media/MediaCards'
import Pager from '@/components/media/Pager'
import { BrowseFilters, CoverGrid } from '@/components/games/GamePortal'
import { toPublicPath } from '@/platform/routing/aliases'

export const dynamic = 'force-dynamic'
type Props = { params: Promise<{ slug: string[] }>; searchParams: Promise<{ page?: string; sort?: string; platform?: string }> }

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ slug }, { page, sort, platform }] = await Promise.all([params, searchParams])
  const found = await resolveTermPath('games', slug)
  if (!found) return { title: 'پیدا نشد', robots: { index: false } }
  const n = Number(page) || 1
  const title = found.term.seoTitle || `بازی‌های ${found.chain.map((node) => node.name).join(' ')}`
  return {
    title: n > 1 ? `${title} — صفحه ${n.toLocaleString('fa-IR')}` : title,
    description: found.term.seoDescription || found.term.description || `معرفی، نقد، نمره و دانلود بازی‌های ${found.term.name}`,
    alternates: { canonical: toPublicPath(n > 1 ? `${found.term.path}?page=${n}` : found.term.path) },
    robots: sort || platform ? { index: false, follow: true } : undefined,
  }
}

/** Genre/category archive in the GameUp layout: filter bar, genre header with artwork, cover grid. */
export default async function GamesCategoryPage({ params, searchParams }: Props) {
  await requireModule('games')
  const [{ slug }, query] = await Promise.all([params, searchParams])
  const found = await resolveTermPath('games', slug)
  if (!found) notFound()
  const [result, facets, genres] = await Promise.all([
    browseGames({ ids: found.ownerIds, page: Number(query.page) || 1, sort: query.sort, platform: query.platform }),
    gameFacets(),
    gameGenres(),
  ])
  const art = found.term.image || genres.tiles.find((tile) => tile.key === String(found.chain[0].id))?.image || result.games[0]?.cover || ''
  const href = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(Object.entries({ sort: query.sort, platform: query.platform, ...patch }).filter((entry): entry is [string, string] => !!entry[1]))
    return `${found.term.path}${next.size ? `?${next}` : ''}`
  }
  const sorts: [string | undefined, string][] = [[undefined, 'تازه‌ترین'], ['score', 'بیشترین نمره'], ['views', 'محبوب‌ترین'], ['release', 'تاریخ انتشار']]
  return (
    <MediaShell section="games">
      <div className="container gx-browse">
        <BrowseFilters action="/games/browse" values={{ term: found.term.slug }} facets={{ genres: genres.options, platforms: facets.platforms, developers: facets.developers, publishers: facets.publishers }} />
        <header className="gx-genre-head">
          {art && <img src={art} alt="" />}
          <div>
            <nav className="gx-crumbs" aria-label="مسیر صفحه"><Link href="/games">بازی</Link>{found.chain.slice(0, -1).map((node) => <span key={node.id}> › <Link href={node.path}>{node.name}</Link></span>)}</nav>
            <h1>{found.term.seoTitle || `ژانر ${found.term.name}`}</h1>
            <span>{result.total.toLocaleString('fa-IR')} بازی</span>
            {found.term.description && <p>{found.term.description}</p>}
          </div>
        </header>
        {(found.children.length > 0 || found.siblings.length > 0) && <nav className="gx-chips" aria-label="دسته‌های مرتبط">{(found.children.length ? found.children : found.siblings).map((node) => <Link key={node.id} href={node.path}>{node.name}<small>{node.count.toLocaleString('fa-IR')}</small></Link>)}</nav>}
        <nav className="gx-sorts" aria-label="مرتب‌سازی">{sorts.map(([key, label]) => <Link key={label} href={href({ sort: key, page: undefined })} className={(query.sort || undefined) === key ? 'is-active' : ''}>{label}</Link>)}</nav>
        {result.games.length ? <CoverGrid games={result.games} /> : <EmptyState fa title="هنوز بازی‌ای در این دسته نیست" />}
        <Pager page={result.page} pages={result.pages} fa href={(page) => href({ page: page > 1 ? String(page) : undefined })} />
      </div>
    </MediaShell>
  )
}
