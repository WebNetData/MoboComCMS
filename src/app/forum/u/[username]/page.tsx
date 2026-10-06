import type { Metadata } from 'next'
import Link from '@/components/AppLink'
import { notFound } from 'next/navigation'
import { requireModule } from '@/extensions/server/modules'
import { getForumViewer } from '@/modules/forum/server/forum'
import { getProfile, type ProfileTab } from '@/modules/forum/server/people'
import ForumShell from '@/components/forum/ForumShell'
import FollowMember from '@/components/forum/FollowMember'
import { Avatar, TimeAgo, num } from '@/components/forum/shared'
import { getForumSettings } from '@/modules/forum/server/community'
import { canStartMessage } from '@/modules/forum/domain/discourse'
import { FORUM_RANK_LABELS } from '@/modules/forum/domain/community'
import { ProfileSocial, SOCIAL_TABS, type SocialTab } from '@/modules/community/server/pages/profile-social'

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
  // The member's posts and follow lists are tabs of this same page while the social module is on.
  const wanted = (SOCIAL_TABS as readonly string[]).includes(String(tab)) ? tab as SocialTab : null
  const active = TABS.some((item) => item.key === tab) ? tab as ProfileTab : 'summary'
  const data = await getProfile(username, viewer, wanted ? 'badges' : active)
  const canMessage = canStartMessage(viewer, await getForumSettings())
  if (!data) notFound()
  const { author, profile, social } = data
  const socialTab = social ? wanted : null
  const here = `/forum/u/${profile.username}`
  // The numbers a visitor looks for first; the social ones only while that module is on.
  const lead: { label: string; value: number; href?: string }[] = [
    { label: 'اعتبار', value: profile.stats.reputation }, { label: 'پیام', value: profile.stats.postCount }, { label: 'موضوع', value: profile.stats.topicCount }, { label: 'راه‌حل', value: profile.stats.solvedCount },
    ...(social ? [{ label: 'دنبال‌کننده', value: social.followers, href: `${here}?tab=followers` }, { label: 'دنبال‌شونده', value: social.following, href: `${here}?tab=following` }] : []),
  ]
  const more: [string, number][] = [['روز بازدید', profile.stats.daysVisited], ['موضوع خوانده', profile.stats.topicsEntered], ['پسند داده', profile.stats.likesGiven]]

  return (
    <ForumShell viewer={viewer} active="users" wide>
      <section className="fp-hero" style={{ ['--tone' as string]: author.avatarColor || 'var(--md-accent)' }}>
        <div className="fp-cover" style={profile.cover ? { backgroundImage: `url(${profile.cover})` } : undefined} />
        <div className="fp-head">
          <Avatar author={author} size={124} className="fp-avatar" />
          <div className="fp-id">
            <h1>{author.name}{author.staff && <span className="fx-staff" title="تیم موبوکام" aria-label="تیم موبوکام">🛡</span>}{social?.verified && <span className="fp-verified" title="حساب تأییدشده" aria-label="حساب تأییدشده">✓</span>}</h1>
            <p className="fp-line"><bdi dir="ltr" className="fx-handle">@{profile.username}</bdi>{social?.followsViewer && <span className="fp-chip">شما را دنبال می‌کند</span>}</p>
            {social?.headline && <p className="fp-headline">{social.headline}</p>}
            <p className="fp-ranks">
              {author.rank && <span className={`tp-rank is-${author.rank}`}>{FORUM_RANK_LABELS[author.rank]}</span>}
              <span className={`fp-rank is-${profile.trustLevel}`}>{profile.trustName}</span>
              {profile.title && <span className="fp-rank is-title">{profile.title}</span>}
              {data.rank && <span className="fp-rank is-place">رتبهٔ {num(data.rank)} در اعتبار</span>}
            </p>
            {(profile.silenced || profile.suspended) && <p className="fx-warn">{profile.suspended ? 'این حساب در تالار تعلیق شده است' : 'امکان ارسال برای این حساب موقتاً بسته است'}</p>}
          </div>
          <div className="fp-actions">
            {data.own && <Link href={`${here}/edit`} className="btn btn-primary btn-sm">ویرایش پروفایل</Link>}
            {data.own && <Link href="/forum/messages" className="btn btn-ghost btn-sm">پیام‌های من</Link>}
            {!data.own && social?.canFollow && <FollowMember username={social.username} initial={social.isFollowing} followers={social.followers} signedIn={!!viewer.userId} back={here} />}
            {!data.own && canMessage && <Link href={`/forum/messages/new?to=${profile.username}`} className="btn btn-ghost btn-sm">پیام خصوصی</Link>}
          </div>
        </div>
        <dl className="fp-stats">{lead.map((item) => <div key={item.label}>{item.href ? <Link href={item.href}><dd>{num(item.value)}</dd><dt>{item.label}</dt></Link> : <><dd>{num(item.value)}</dd><dt>{item.label}</dt></>}</div>)}</dl>
      </section>

      <div className="fp-layout">
        <div className="fp-main">
          <nav className="fx-strip fp-tabs" aria-label="بخش‌های پروفایل">
            {TABS.map((item) => <Link key={item.key} href={`${here}${item.key === 'summary' ? '' : `?tab=${item.key}`}`} className={!socialTab && active === item.key ? 'is-active' : ''} aria-current={!socialTab && active === item.key ? 'page' : undefined}>{item.label}{item.key === 'badges' && data.badges.length ? <em>{num(data.badges.length)}</em> : null}</Link>)}
            {social && ([['posts', 'پست‌ها', social.posts], ['followers', 'دنبال‌کننده‌ها', social.followers], ['following', 'دنبال‌شونده‌ها', social.following]] as [SocialTab, string, number][]).map(([key, label, count]) => <Link key={key} href={`${here}?tab=${key}`} className={socialTab === key ? 'is-active' : ''} aria-current={socialTab === key ? 'page' : undefined}>{label}<em>{num(count)}</em></Link>)}
          </nav>

          {socialTab && social && <section className="fp-card fp-social md-community"><ProfileSocial username={social.username} tab={socialTab} viewerId={viewer.userId} /></section>}
          {!socialTab && active === 'summary' && <>
            <section className="fp-card"><h2>محبوب‌ترین موضوع‌ها</h2>{data.topTopics.length ? <ul className="fp-list">{data.topTopics.map((topic) => <li key={topic.id}><Link href={`/forum/t/${topic.id}`}><b>{topic.title}</b><small>{num(topic.likeCount)} پسند · {num(topic.replyCount)} پاسخ · <TimeAgo date={topic.createdAt} /></small></Link></li>)}</ul> : <p className="fx-muted">موضوعی ندارد.</p>}</section>
            <section className="fp-card"><h2>بهترین پاسخ‌ها</h2>{data.topReplies.length ? <ul className="fp-list">{data.topReplies.map((post) => <li key={post.id}><Link href={`/forum/t/${post.thread.id}?post=${post.postNumber}`}><b>{post.thread.title}</b><span>{post.excerpt}</span><small>{num(post.likeCount)} پسند</small></Link></li>)}</ul> : <p className="fx-muted">پاسخی ندارد.</p>}</section>
          </>}
          {!socialTab && active === 'activity' && <section className="fp-card"><h2>تازه‌ترین نوشته‌ها</h2>{data.activity.length ? <ul className="fp-list">{data.activity.map((post) => (
            <li key={post.id}><Link href={`/forum/t/${post.thread.id}?post=${post.postNumber}`}><b>{post.thread.title}</b><span>{post.excerpt}</span><small><TimeAgo date={post.createdAt} />{post.likeCount ? ` · ${num(post.likeCount)} پسند` : ''}</small></Link></li>
          ))}</ul> : <p className="fx-muted">فعالیتی نیست.</p>}</section>}
          {!socialTab && active === 'topics' && <section className="fp-card"><h2>موضوع‌ها</h2>{data.topics.length ? <ul className="fp-list">{data.topics.map((topic) => (
            <li key={topic.id}><Link href={`/forum/t/${topic.id}`}><b>{topic.solvedPostId ? '✓ ' : ''}{topic.title}</b><small><TimeAgo date={topic.createdAt} /> · {num(topic.replyCount)} پاسخ · {num(topic.views)} بازدید</small></Link></li>
          ))}</ul> : <p className="fx-muted">موضوعی نیست.</p>}</section>}
          {!socialTab && active === 'badges' && <section className="fp-card"><h2>نشان‌ها</h2><div className="fx-badge-grid">{data.badges.map((badge) => (
            <Link key={badge.slug} href={`/forum/badges/${badge.slug}`} className={`fx-badge-card is-${badge.tier.toLowerCase()}`}><span aria-hidden="true">{badge.icon}</span><b>{badge.name}</b><small>{badge.description}</small><em>{TIER[badge.tier]} · <TimeAgo date={badge.grantedAt} /></em></Link>
          ))}{!data.badges.length && <p className="fx-muted">هنوز نشانی نگرفته است.</p>}</div></section>}
        </div>

        <aside className="fp-side" aria-label="دربارهٔ این عضو">
          <section className="fp-card">
            <h2>درباره</h2>
            {profile.bio ? <div className="fx-cooked" dangerouslySetInnerHTML={{ __html: profile.bioHtml }} /> : <p className="fx-muted">{data.own ? 'هنوز خودتان را معرفی نکرده‌اید.' : 'معرفی ثبت نشده است.'}</p>}
            <ul className="fp-facts">
              {profile.location && <li><span>مکان</span>{profile.location}</li>}
              {profile.website && <li><span>وب‌سایت</span><a href={profile.website} target="_blank" rel="nofollow ugc noopener noreferrer" dir="ltr">{profile.website.replace(/^https?:\/\//, '').slice(0, 40)}</a></li>}
              <li><span>عضویت</span><TimeAgo date={profile.joinedAt} /></li>
              {profile.lastSeenAt && <li><span>آخرین حضور</span><TimeAgo date={profile.lastSeenAt} /></li>}
              {more.map(([label, value]) => <li key={label}><span>{label}</span>{num(value)}</li>)}
            </ul>
          </section>
          {data.groups.length > 0 && <section className="fp-card"><h2>گروه‌ها</h2><div className="fp-groups">{data.groups.map((group) => <Link key={group.id} href={`/forum/g/${group.slug}`} style={{ ['--g' as string]: group.color }}><i aria-hidden="true">{group.icon || '👥'}</i>{group.name}{group.owner && <small>مدیر</small>}</Link>)}</div></section>}
          {(socialTab || active !== 'badges') && <section className="fp-card"><h2>نشان‌های اخیر</h2>{data.badges.length ? <div className="fx-badge-row">{data.badges.slice(0, 8).map((badge) => <Link key={badge.slug} href={`/forum/badges/${badge.slug}`} className={`fx-badge is-${badge.tier.toLowerCase()}`} title={badge.description}><span aria-hidden="true">{badge.icon}</span>{badge.name}</Link>)}</div> : <p className="fx-muted">هنوز نشانی نگرفته است.</p>}</section>}
        </aside>
      </div>
    </ForumShell>
  )
}
