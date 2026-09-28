import type { Metadata } from 'next'
import { requireModule } from '@/extensions/server/modules'
import TopicListPage from '@/components/forum/TopicListPage'
import { getForumViewer, visibleCategories, type TopPeriod, type TopicFilter } from '@/modules/forum/server/forum'
import { toPublicPath } from '@/platform/routing/aliases'

export const dynamic = 'force-dynamic'
type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ page?: string; filter?: string; period?: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const category = (await visibleCategories(await getForumViewer())).find((c) => c.slug === slug)
  if (!category) return {}
  return { title: `${category.title} — تالار گفتمان`, description: category.description || undefined, alternates: { canonical: toPublicPath(`/forum/c/${slug}`) } }
}

export default async function ForumCategoryPage({ params, searchParams }: Props) {
  await requireModule('forum')
  const [{ slug }, { page, filter, period }] = await Promise.all([params, searchParams])
  return <TopicListPage categorySlug={slug} filter={(filter as TopicFilter) || 'latest'} period={period as TopPeriod | undefined} page={Number(page) || 1} />
}
