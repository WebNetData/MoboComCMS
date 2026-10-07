import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireModule, isModuleEnabled } from '@/extensions/server/modules'
import { getViewer } from '@/modules/membership/server/membership'
import { ProfilePage, profileMeta } from '@/modules/community/server/pages/profile'
import { ForumProfileSection } from '@/modules/forum/server/pages/profile-section'
import { FORUM_PART, normalizeForumPiece } from '@/modules/identity/domain/profile-address'

export const dynamic = 'force-dynamic'
type Props = { params: Promise<{ username: string }>; searchParams: Promise<{ tab?: string; f?: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return profileMeta((await params).username)
}

/** The one public address of a member. What the forum knows about them is a tab of this page while the forum is on. */
export default async function UserProfileRoute({ params, searchParams }: Props) {
  await requireModule('community')
  const [{ username }, { tab, f }, viewer, forum] = await Promise.all([params, searchParams, getViewer(), isModuleEnabled('forum')])
  const part = forum ? { key: FORUM_PART, label: 'تالار', icon: 'forum', body: () => ForumProfileSection({ username, piece: normalizeForumPiece(f) }) } : null
  const page = await ProfilePage({ username, tab, viewerId: viewer.userId ?? null, forum, part })
  if (!page) notFound()
  return page
}
