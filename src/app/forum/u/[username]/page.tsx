import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireModule } from '@/extensions/server/modules'
import { getForumViewer } from '@/modules/forum/server/forum'
import { getProfile, type ProfileTab } from '@/modules/forum/server/people'
import ForumShell from '@/components/forum/ForumShell'
import { Avatar, TimeAgo, TrustBadge, num } from '@/components/forum/shared'
import { getForumSettings } from '@/modules/forum/server/community'
import { canStartMessage } from '@/modules/forum/domain/discourse'

export const dynamic = 'force-dynamic'
type Props = { params: Promise<{ username: string }>; searchParams: Promise<{ tab?: string }> }
const TABS: { key: ProfileTab; label: string }[] = [{ key: 'summary', label: 'خلاصه' }, { key: 'activity', label: 'فعالیت' }, { key: 'topics', label: 'موضوع‌ها' }, { key: 'badges', label: 'نشان‌ها' }]
const TIER: Record<string, string> = { GOLD: 'طلایی', SILVER: 'نقره‌ای', BRONZE: 'برنزی' }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await getProfile((await params).username, await getForumViewer())
  if (!data) return { title: 'کاربر پیدا نشد', robots: { index: false } }
  return { title: `${data.author.name} (@${data.profile.username}) — تالار گفتمان`, description: data.profile.bio.slice(0, 160) || undefined, robots: data.profile.stats.postCount ? undefined : { index: false } }
}

export default async function ProfilePage({ params, searchParams }: Props) {
  await requireModule('forum')
  const [{ username }, { tab }] = await Promise.all([params, searchParams])
  const viewer = await getForumViewer()
  const active = TABS.some((item) => item.key === tab) ? tab as ProfileTab : 'summary'
  const data = await getProfile(username, viewer, active)
  const canMessage = canStartMessage(viewer, await getForumSettings())
  if (!data) notFound()
  const { author, profile } = data
  const stats: [string, number][] = [
    ['روز بازدید', profile.stats.daysVisited], ['موضوع خوانده', profile.stats.topicsEntered], ['موضوع', profile.stats.topicCount], ['پیام', profile.stats.postCount],
    ['پسند داده', profile.stats.likesGiven], ['پسند گرفته', profile.stats.likesReceived], ['راه‌حل', profile.stats.solvedCount],
  ]
  return (
    <ForumShell viewer={viewer} active="users">
      <section className="fx-profile">
        <div className="fx-profile-cover" style={profile.cover ? { backgroundImage: `url(${profile.cover})` } : { ['--tone' as string]: author.avatarColor }} />
        <div className="fx-profile-head">
          <Avatar author={author} size={112} className="fx-profile-avatar" />
          <div className="fx-profile-id">
            <h1>{author.name} {author.staff && <span className="fx-staff" title="تیم موبوکام">🛡</span>}</h1>
            <p><bdi dir="ltr" className="fx-handle">@{profile.username}</bdi>{profile.title && <span className="fx-user-title">{profile.title}</span>}<TrustBadge level={profile.trustLevel} /></p>
            {(profile.silenced || profile.suspended) && <p className="fx-warn">{profile.suspended ? 'این حساب در تالار تعلیق شده است' : 'امکان ارسال برای این حساب موقتاً بسته است'}</p>}
          </div>
          {data.own && <Link href={`/forum/u/${profile.username}/edit`} className="btn btn-ghost btn-sm">ویرایش پروفایل</Link>}
          {data.own && <Link href="/forum/messages" className="btn btn-ghost btn-sm">✉ پیام‌های من</Link>}
          {!data.own && canMessage && <Link href={`/forum/messages/new?to=${profile.username}`} className="btn btn-primary btn-sm">✉ پیام خصوصی</Link>}
        </div>
        <div className="fx-profile-grid">
          <div className="fx-profile-about">
            {profile.bio ? <div className="fx-cooked" dangerouslySetInnerHTML={{ __html: profile.bioHtml }} /> : <p className="fx-muted">{data.own ? 'هنوز خودتان را معرفی نکرده‌اید.' : 'معرفی ثبت نشده است.'}</p>}
            <ul className="fx-profile-facts">
              {profile.location && <li>📍 {profile.location}</li>}
              {profile.website && <li>🔗 <a href={profile.website} target="_blank" rel="nofollow ugc noopener noreferrer" dir="ltr">{profile.website.replace(/^https?:\/\//, '').slice(0, 40)}</a></li>}
              <li>📅 عضو از <TimeAgo date={profile.joinedAt} /></li>
              {profile.lastSeenAt && <li>👀 آخرین حضور <TimeAgo date={profile.lastSeenAt} /></li>}
            </ul>
            {data.groups.length > 0 && <div className="fx-profile-groups">{data.groups.map((group) => <Link key={group.id} href={`/forum/g/${group.slug}`} style={{ ['--g' as string]: group.color }}>{group.icon} {group.name}{group.owner && <small>مدیر</small>}</Link>)}</div>}
          </div>
          <dl className="fx-profile-stats">{stats.map(([label, value]) => <div key={label}><dd>{num(value)}</dd><dt>{label}</dt></div>)}</dl>
        </div>
      </section>

      <nav className="fx-tabs fx-profile-tabs" aria-label="بخش‌های پروفایل">{TABS.map((item) => <Link key={item.key} href={`/forum/u/${profile.username}${item.key === 'summary' ? '' : `?tab=${item.key}`}`} className={active === item.key ? 'is-active' : ''}>{item.label}{item.key === 'badges' && data.badges.length ? ` (${num(data.badges.length)})` : ''}</Link>)}</nav>

      {active === 'summary' && (
        <div className="fx-profile-summary">
          <section><h2>محبوب‌ترین موضوع‌ها</h2>{data.topTopics.length ? <ul className="fx-plain-list">{data.topTopics.map((topic) => <li key={topic.id}><Link href={`/forum/t/${topic.id}`}>{topic.title}</Link><small>❤ {num(topic.likeCount)} · {num(topic.replyCount)} پاسخ</small></li>)}</ul> : <p className="fx-muted">موضوعی ندارد.</p>}</section>
          <section><h2>بهترین پاسخ‌ها</h2>{data.topReplies.length ? <ul className="fx-plain-list">{data.topReplies.map((post) => <li key={post.id}><Link href={`/forum/t/${post.thread.id}?post=${post.postNumber}`}>{post.thread.title}</Link><small>❤ {num(post.likeCount)} — {post.excerpt}</small></li>)}</ul> : <p className="fx-muted">پاسخی ندارد.</p>}</section>
          <section className="fx-wide"><h2>نشان‌های اخیر</h2>{data.badges.length ? <div className="fx-badge-row">{data.badges.slice(0, 8).map((badge) => <Link key={badge.slug} href={`/forum/badges/${badge.slug}`} className={`fx-badge is-${badge.tier.toLowerCase()}`} title={badge.description}><span aria-hidden="true">{badge.icon}</span>{badge.name}</Link>)}</div> : <p className="fx-muted">هنوز نشانی نگرفته است.</p>}</section>
        </div>
      )}
      {active === 'activity' && (
        <ul className="fx-activity">{data.activity.map((post) => (
          <li key={post.id}><div><Link href={`/forum/t/${post.thread.id}?post=${post.postNumber}`}><b>{post.thread.title}</b></Link><small><TimeAgo date={post.createdAt} />{post.likeCount ? ` · ❤ ${num(post.likeCount)}` : ''}</small></div><p>{post.excerpt}</p></li>
        ))}{!data.activity.length && <li className="fx-muted">فعالیتی نیست.</li>}</ul>
      )}
      {active === 'topics' && (
        <ul className="fx-activity">{data.topics.map((topic) => (
          <li key={topic.id}><div><Link href={`/forum/t/${topic.id}`}><b>{topic.solvedPostId ? '✓ ' : ''}{topic.title}</b></Link><small><TimeAgo date={topic.createdAt} /> · {num(topic.replyCount)} پاسخ · {num(topic.views)} بازدید</small></div></li>
        ))}{!data.topics.length && <li className="fx-muted">موضوعی نیست.</li>}</ul>
      )}
      {active === 'badges' && (
        <div className="fx-badge-grid">{data.badges.map((badge) => (
          <Link key={badge.slug} href={`/forum/badges/${badge.slug}`} className={`fx-badge-card is-${badge.tier.toLowerCase()}`}><span aria-hidden="true">{badge.icon}</span><b>{badge.name}</b><small>{badge.description}</small><em>{TIER[badge.tier]} · <TimeAgo date={badge.grantedAt} /></em></Link>
        ))}{!data.badges.length && <p className="fx-muted">هنوز نشانی نگرفته است.</p>}</div>
      )}
    </ForumShell>
  )
}
