import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireModule } from '@/extensions/server/modules'
import { albumsByIds } from '@/modules/media/server/queries'
import { resolveTermPath } from '@/modules/taxonomy/server/taxonomy'
import MediaShell from '@/components/media/MediaShell'
import { musicNav } from '@/components/media/nav'
import { EmptyState, AlbumCard } from '@/components/media/MediaCards'
import Pager from '@/components/media/Pager'
import TermHeader from '@/components/taxonomy/TermHeader'
import { toPublicPath } from '@/platform/routing/aliases'

export const dynamic = 'force-dynamic'
type Props = { params: Promise<{ slug: string[] }>; searchParams: Promise<{ page?: string }> }

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ slug }, { page }] = await Promise.all([params, searchParams])
  const found = await resolveTermPath('music', slug)
  if (!found) return { title: 'پیدا نشد', robots: { index: false } }
  const n = Number(page) || 1
  const title = found.term.seoTitle || `آلبوم‌های ${found.chain.map((node) => node.name).join(' ')}`
  return {
    title: n > 1 ? `${title} — صفحه ${n.toLocaleString('fa-IR')}` : title,
    description: found.term.seoDescription || found.term.description || `دانلود و پخش آنلاین آلبوم‌های ${found.term.name}`,
    alternates: { canonical: toPublicPath(n > 1 ? `${found.term.path}?page=${n}` : found.term.path) },
  }
}

/** Music category archive: albums filed under the term and its sub-terms. */
export default async function CategoryPage({ params, searchParams }: Props) {
  await requireModule('music')
  const [{ slug }, query] = await Promise.all([params, searchParams])
  const found = await resolveTermPath('music', slug)
  if (!found) notFound()
  const result = await albumsByIds(found.ownerIds, Number(query.page) || 1)
  return (
    <MediaShell section="music" nav={musicNav(true)}>
      <div className="container md-body">
        <TermHeader section={{ label: 'موزیک', href: '/music' }} chain={found.chain} term={found.term} children={found.children} siblings={found.siblings} total={result.total} itemLabel="آلبوم" />
        {result.albums.length ? <div className="md-grid">{result.albums.map((item) => <AlbumCard key={item.id} album={item} fa />)}</div> : <EmptyState fa title="هنوز موردی در این دسته نیست" />}
        <Pager page={result.page} pages={result.pages} fa href={(n) => (n > 1 ? `${found.term.path}?page=${n}` : found.term.path)} />
      </div>
    </MediaShell>
  )
}
