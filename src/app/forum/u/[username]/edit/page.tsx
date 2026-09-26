import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { requireModule } from '@/extensions/server/modules'
import { profileForEdit } from '@/modules/forum/server/people'
import { getForumViewer } from '@/modules/forum/server/forum'
import ForumShell from '@/components/forum/ForumShell'
import ProfileEditor from '@/components/forum/ProfileEditor'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'ویرایش پروفایل تالار', robots: { index: false } }

export default async function EditProfilePage({ params }: { params: Promise<{ username: string }> }) {
  await requireModule('forum')
  const { username } = await params
  const viewer = await getForumViewer()
  if (!viewer.userId) redirect(`/login?next=${encodeURIComponent(`/forum/u/${username}/edit`)}`)
  const data = await profileForEdit(viewer.userId)
  if (!data) notFound()
  const { profile, groups, titles } = data
  if (profile.username !== username.toLowerCase()) redirect(`/forum/u/${profile.username}/edit`)
  return (
    <ForumShell viewer={viewer} active="users">
      <header className="fx-page-head"><h1>ویرایش پروفایل تالار</h1><p className="fx-muted">نام نمایشی را از «حساب من ← پروفایل» تغییر دهید؛ این‌جا اطلاعات عمومی تالار است.</p></header>
      <ProfileEditor
        initial={{ username: profile.username, bio: profile.bio, location: profile.location, website: profile.website, avatar: profile.avatar, cover: profile.cover, title: profile.title, primaryGroupId: profile.primaryGroupId ?? 0 }}
        name={profile.user.name || profile.username} avatarColor={profile.user.avatarColor}
        groups={groups} titles={titles}
      />
    </ForumShell>
  )
}
