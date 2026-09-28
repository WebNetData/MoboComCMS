import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireModule, isModuleEnabled } from '@/extensions/server/modules'
import { getViewer } from '@/modules/membership/server/membership'
import { ProfilePage, profileMeta } from '@/modules/community/server/pages/profile'

export const dynamic = 'force-dynamic'
type Props = { params: Promise<{ username: string }>; searchParams: Promise<{ tab?: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return profileMeta((await params).username)
}

export default async function UserProfileRoute({ params, searchParams }: Props) {
  await requireModule('community')
  const [{ username }, { tab }, viewer, forum] = await Promise.all([params, searchParams, getViewer(), isModuleEnabled('forum')])
  const page = await ProfilePage({ username, tab, viewerId: viewer.userId ?? null, forum })
  if (!page) notFound()
  return page
}
