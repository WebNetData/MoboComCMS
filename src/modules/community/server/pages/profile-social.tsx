import { profileByUsername, profileCards, relationBetween, followList } from '@/modules/identity/server/profile'
import { canViewProfile } from '@/modules/identity/domain/profile'
import { communitySettings, profilePosts } from '@/modules/community/server/community'
import { CmIcon } from '@/components/community/CommunityIcons'
import { Feed, PeopleList } from '@/components/community/Social'

export const SOCIAL_TABS = ['posts', 'followers', 'following'] as const
export type SocialTab = (typeof SOCIAL_TABS)[number]

/**
 * A member's social side for a page outside the feed (the forum profile shows it as tabs): their posts, who
 * follows them and whom they follow. The rules are the profile page's own: a private profile shows nothing to
 * those who may not see it, and the follow lists stay private when the member chose so. Null when the member
 * has no public identity.
 */
export async function ProfileSocial({ username, tab, viewerId }: { username: string; tab: SocialTab; viewerId: number | null }) {
  const found = await profileByUsername(username)
  if (!found) return null
  const { profile: p, privacy } = found
  const relation = await relationBetween(viewerId, p.userId)
  const own = relation.self
  if (!canViewProfile(privacy, relation)) {
    return <div className="cm-locked"><CmIcon name="lock" size={34} /><b>{relation.blockedBy ? 'این پروفایل در دسترس نیست' : 'این پروفایل خصوصی است'}</b>{privacy.profile === 'FOLLOWERS' && !relation.blockedBy && <p>برای دیدن پست‌های {p.name} باید دنبالش کنید.</p>}</div>
  }
  if (tab === 'posts') {
    const [data, settings, me] = await Promise.all([profilePosts(p.userId, viewerId), communitySettings(), own && viewerId ? profileCards([viewerId]).then((cards) => cards.get(viewerId) || null) : null])
    return <Feed
      initial={data.posts} next={data.next} source={`/api/people/${p.username}/posts`} signedIn={!!viewerId} me={own ? me : null}
      composer={own && settings.postsEnabled ? { allowFollowers: settings.followersOnlyAllowed, allowImages: settings.imagesEnabled, maxLength: settings.maxPostLength } : null}
      empty={<div className="cm-empty"><CmIcon name="comment" size={30} /><b>{own ? 'هنوز پستی ننوشته‌اید' : 'هنوز پستی ننوشته است'}</b></div>}
    />
  }
  if (!privacy.showFollows && !own) return <div className="cm-empty"><CmIcon name="lock" size={30} /><b>این فهرست خصوصی است</b></div>
  const list = await followList(p.userId, tab, viewerId)
  return list.people.length
    ? <PeopleList people={list.people} signedIn={!!viewerId} variant="list" />
    : <div className="cm-empty"><CmIcon name="users" size={30} /><b>{tab === 'followers' ? 'هنوز دنبال‌کننده‌ای ندارد' : 'هنوز کسی را دنبال نمی‌کند'}</b></div>
}
