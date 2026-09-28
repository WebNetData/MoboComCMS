import type { Metadata } from 'next'
import { requireModule } from '@/extensions/server/modules'
import { getViewer } from '@/modules/membership/server/membership'
import { PeoplePage } from '@/modules/community/server/pages/feed'
import { toPublicPath } from '@/platform/routing/aliases'

export const dynamic = 'force-dynamic'
type Search = { q?: string; sort?: string; page?: string }

export async function generateMetadata({ searchParams }: { searchParams: Promise<Search> }): Promise<Metadata> {
  const p = await searchParams
  return { title: 'کاربران', alternates: { canonical: toPublicPath('/people') }, robots: p.q || p.page ? { index: false } : undefined }
}

export default async function PeopleRoute({ searchParams }: { searchParams: Promise<Search> }) {
  await requireModule('community')
  const [viewer, p] = await Promise.all([getViewer(), searchParams])
  return <PeoplePage viewerId={viewer.userId ?? null} q={p.q} sort={p.sort} page={Number(p.page) || 1} />
}
