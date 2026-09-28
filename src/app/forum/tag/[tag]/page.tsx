import type { Metadata } from 'next'
import { requireModule } from '@/extensions/server/modules'
import TopicListPage from '@/components/forum/TopicListPage'
import type { TopPeriod, TopicFilter } from '@/modules/forum/server/forum'
import { toPublicPath } from '@/platform/routing/aliases'

export const dynamic = 'force-dynamic'
type Props = { params: Promise<{ tag: string }>; searchParams: Promise<{ page?: string; filter?: string; period?: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const tag = decodeURIComponent((await params).tag)
  return { title: `#${tag} — تالار گفتمان`, alternates: { canonical: toPublicPath(`/forum/tag/${encodeURIComponent(tag)}`) } }
}

export default async function ForumTagPage({ params, searchParams }: Props) {
  await requireModule('forum')
  const [{ tag }, { page, filter, period }] = await Promise.all([params, searchParams])
  return <TopicListPage tag={decodeURIComponent(tag).toLowerCase()} filter={(filter as TopicFilter) || 'latest'} period={period as TopPeriod | undefined} page={Number(page) || 1} />
}
