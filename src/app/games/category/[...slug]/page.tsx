import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireModule } from '@/extensions/server/modules'
import { browseGames } from '@/modules/media/server/queries'
import { resolveTermPath } from '@/modules/taxonomy/server/taxonomy'
import MediaShell from '@/components/media/MediaShell'
import { gamesNav } from '@/components/media/nav'
import { EmptyState, GameCard } from '@/components/media/MediaCards'
import Pager from '@/components/media/Pager'
import TermHeader from '@/components/taxonomy/TermHeader'

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
    alternates: { canonical: n > 1 ? `${found.term.path}?page=${n}` : found.term.path },
    robots: sort || platform ? { index: false, follow: true } : undefined,
  }
}

/** Game category archive: /games/category/<term>/<sub-term>. */
export default async function GamesCategoryPage({ params, searchParams }: Props) {
  await requireModule('games')
  const [{ slug }, query] = await Promise.all([params, searchParams])
  const found = await resolveTermPath('games', slug)
  if (!found) notFound()
  const result = await browseGames({ ids: found.ownerIds, page: Number(query.page) || 1, sort: query.sort, platform: query.platform })
  const href = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(Object.entries({ sort: query.sort, platform: query.platform, ...patch }).filter((entry): entry is [string, string] => !!entry[1]))
    return `${found.term.path}${next.size ? `?${next}` : ''}`
  }
  const sorts: [string | undefined, string][] = [[undefined, 'تازه‌ترین'], ['score', 'بیشترین نمره'], ['release', 'تاریخ انتشار']]
  return (
    <MediaShell section="games" active="latest" nav={gamesNav(true)} search={{ action: '/games/browse', placeholder: 'جست‌وجوی بازی…' }}>
      <div className="container md-body gm-category">
        <TermHeader section={{ label: 'بازی', href: '/games' }} chain={found.chain} term={found.term} children={found.children} siblings={found.siblings} total={result.total} itemLabel="بازی" />
        <div className="md-sort">{sorts.map(([key, label]) => <Link key={label} href={href({ sort: key, page: undefined })} className={(query.sort || undefined) === key ? 'is-active' : ''}>{label}</Link>)}</div>
        {result.games.length ? <div className="gm-grid">{result.games.map((game) => <GameCard key={game.id} game={game} fa />)}</div> : <EmptyState fa title="هنوز بازی‌ای در این دسته نیست" />}
        <Pager page={result.page} pages={result.pages} fa href={(page) => href({ page: page > 1 ? String(page) : undefined })} />
      </div>
    </MediaShell>
  )
}
