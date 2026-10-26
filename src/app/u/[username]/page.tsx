import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { isModuleEnabled } from '@/extensions/server/modules'
import { profileByUsername } from '@/modules/identity/server/profile'
import { getViewer } from '@/modules/membership/server/membership'
import { ProfilePage, profileMeta } from '@/modules/community/server/pages/profile'
import { ForumProfileSection } from '@/modules/forum/server/pages/profile-section'
import { FORUM_PART, forumStandInAddress, normalizeForumPiece } from '@/modules/identity/domain/profile-address'

export const dynamic = 'force-dynamic'
type Props = { params: Promise<{ username: string }>; searchParams: Promise<{ tab?: string; f?: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return profileMeta((await params).username)
}

/**
 * The one public address of a member. What the forum knows about them is a tab of this page while the forum is on.
 * Links name this address; while social profiles are off, or the member has no social profile yet, it hands over to
 * the forum's own page (which leads back here only when the profile exists and the module is on, so no loop).
 */
export default async function UserProfileRoute({ params, searchParams }: Props) {
  const [{ username }, { tab, f }, viewer, community, forum] = await Promise.all([params, searchParams, getViewer(), isModuleEnabled('community'), isModuleEnabled('forum')])
  if (!community || !await profileByUsername(username).catch(() => null)) {
    if (forum) redirect(forumStandInAddress(username, tab, f))
    notFound()
  }
  const part = forum ? { key: FORUM_PART, label: 'تالار', icon: 'forum', body: () => ForumProfileSection({ username, piece: normalizeForumPiece(f) }) } : null
  const page = await ProfilePage({ username, tab, viewerId: viewer.userId ?? null, forum, part })
  if (!page) notFound()
  return page
}
