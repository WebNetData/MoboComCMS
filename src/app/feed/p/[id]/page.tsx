import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireModule } from '@/extensions/server/modules'
import { getViewer } from '@/modules/membership/server/membership'
import { PostPage } from '@/modules/community/server/pages/feed'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'پست', robots: { index: false, follow: true } }

export default async function PostRoute({ params }: { params: Promise<{ id: string }> }) {
  await requireModule('community')
  const [viewer, { id }] = await Promise.all([getViewer(), params])
  const page = Number.isSafeInteger(Number(id)) ? await PostPage({ id: Number(id), viewerId: viewer.userId ?? null }) : null
  if (!page) notFound()
  return page
}
