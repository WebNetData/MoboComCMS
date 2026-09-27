import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireModule } from '@/extensions/server/modules'
import { browseCinema } from '@/modules/media/server/queries'
import { resolveTermPath } from '@/modules/taxonomy/server/taxonomy'
import MediaShell from '@/components/media/MediaShell'
import { cinemaNav } from '@/components/media/nav'
import { EmptyState, PosterCard } from '@/components/media/MediaCards'
import Pager from '@/components/media/Pager'
import TermHeader from '@/components/taxonomy/TermHeader'

export const dynamic = 'force-dynamic'
type Props = { params: Promise<{ slug: string[] }>; searchParams: Promise<{ page?: string }> }

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ slug }, { page }] = await Promise.all([params, searchParams])
  const found = await resolveTermPath('cinema', slug)
  if (!found) return { title: 'پیدا نشد', robots: { index: false } }
  const n = Number(page) || 1
  const title = found.term.seoTitle || `دانلود ${found.chain.map((node) => node.name).join(' ')}`
  return {
    title: n > 1 ? `${title} — صفحه ${n.toLocaleString('fa-IR')}` : title,
    description: found.term.seoDescription || found.term.description || `دانلود فیلم و سریال ${found.term.name}`,
    alternates: { canonical: n > 1 ? `${found.term.path}?page=${n}` : found.term.path },
  }
}

/** Film & series category archive. */
export default async function CategoryPage({ params, searchParams }: Props) {
  await requireModule('cinema')
  const [{ slug }, query] = await Promise.all([params, searchParams])
  const found = await resolveTermPath('cinema', slug)
  if (!found) notFound()
  const result = await browseCinema({ ids: found.ownerIds, page: Number(query.page) || 1 })
  return (
    <MediaShell section="cinema" nav={cinemaNav(true)}>
      <div className="container md-body">
        <TermHeader section={{ label: 'فیلم و سریال', href: '/cinema' }} chain={found.chain} term={found.term} children={found.children} siblings={found.siblings} total={result.total} itemLabel="عنوان" />
        {result.titles.length ? <div className="cn-grid">{result.titles.map((item) => <PosterCard key={item.id} item={item} fa />)}</div> : <EmptyState fa title="هنوز موردی در این دسته نیست" />}
        <Pager page={result.page} pages={result.pages} fa href={(n) => (n > 1 ? `${found.term.path}?page=${n}` : found.term.path)} />
      </div>
    </MediaShell>
  )
}
