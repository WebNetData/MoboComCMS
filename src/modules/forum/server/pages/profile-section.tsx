import Link from '@/components/AppLink'
import { getForumViewer } from '@/modules/forum/server/forum'
import { getProfile } from '@/modules/forum/server/people'
import { getForumSettings } from '@/modules/forum/server/community'
import { canStartMessage } from '@/modules/forum/domain/discourse'
import { FORUM_RANK_LABELS } from '@/modules/forum/domain/community'
import { TimeAgo, num } from '@/components/forum/shared'
import { profileAddress, type ForumPiece } from '@/modules/identity/domain/profile-address'

const PIECES: { key: ForumPiece; label: string }[] = [{ key: 'summary', label: 'خلاصه' }, { key: 'activity', label: 'فعالیت' }, { key: 'topics', label: 'موضوع‌ها' }, { key: 'badges', label: 'نشان‌ها' }]
const TIER: Record<string, string> = { GOLD: 'طلایی', SILVER: 'نقره‌ای', BRONZE: 'برنزی' }

/**
 * The forum part of a member's profile, shown inside the member's one profile page: standing, numbers,
 * what they wrote (only in the forums this viewer may see), badges and groups. Null when the member has
 * no forum profile.
 */
export async function ForumProfileSection({ username, piece }: { username: string; piece: ForumPiece }) {
  const viewer = await getForumViewer()
  const data = await getProfile(username, viewer, piece)
  if (!data) return null
  const { author, profile } = data
  const canMessage = !data.own && canStartMessage(viewer, await getForumSettings())
  const stats: [string, number][] = [['اعتبار', profile.stats.reputation], ['پیام', profile.stats.postCount], ['موضوع', profile.stats.topicCount], ['راه‌حل', profile.stats.solvedCount], ['روز بازدید', profile.stats.daysVisited], ['پسند داده', profile.stats.likesGiven]]
  return <div className="fp-embedded">
    <section className="fp-card">
      <p className="fp-ranks">
        {author.rank && <span className={`tp-rank is-${author.rank}`}>{FORUM_RANK_LABELS[author.rank]}</span>}
        <span className={`fp-rank is-${profile.trustLevel}`}>{profile.trustName}</span>
        {profile.title && <span className="fp-rank is-title">{profile.title}</span>}
        {data.rank && <span className="fp-rank is-place">رتبهٔ {num(data.rank)} در اعتبار</span>}
      </p>
      {(profile.silenced || profile.suspended) && <p className="fx-warn">{profile.suspended ? 'این حساب در تالار تعلیق شده است' : 'امکان ارسال برای این حساب موقتاً بسته است'}</p>}
      <dl className="fp-stats">{stats.map(([label, value]) => <div key={label}><dd>{num(value)}</dd><dt>{label}</dt></div>)}</dl>
      <div className="fp-actions">
        {data.own && <Link href={`/forum/u/${profile.username}/edit`} className="btn btn-ghost btn-sm">ویرایش مشخصات تالار</Link>}
        {data.own && <Link href="/forum/messages" className="btn btn-ghost btn-sm">پیام‌های من</Link>}
        {canMessage && <Link href={`/forum/messages/new?to=${profile.username}`} className="btn btn-ghost btn-sm">پیام خصوصی</Link>}
      </div>
    </section>
    <nav className="fx-strip fp-tabs" aria-label="بخش‌های تالار">
      {PIECES.map((item) => <Link key={item.key} href={profileAddress(profile.username, item.key)} className={piece === item.key ? 'is-active' : ''} aria-current={piece === item.key ? 'page' : undefined}>{item.label}{item.key === 'badges' && data.badges.length ? <em>{num(data.badges.length)}</em> : null}</Link>)}
    </nav>
    {piece === 'summary' && <>
      <section className="fp-card"><h2>محبوب‌ترین موضوع‌ها</h2>{data.topTopics.length ? <ul className="fp-list">{data.topTopics.map((topic) => <li key={topic.id}><Link href={`/forum/t/${topic.id}`}><b>{topic.title}</b><small>{num(topic.likeCount)} پسند · {num(topic.replyCount)} پاسخ · <TimeAgo date={topic.createdAt} /></small></Link></li>)}</ul> : <p className="fx-muted">موضوعی ندارد.</p>}</section>
      <section className="fp-card"><h2>بهترین پاسخ‌ها</h2>{data.topReplies.length ? <ul className="fp-list">{data.topReplies.map((post) => <li key={post.id}><Link href={`/forum/t/${post.thread.id}?post=${post.postNumber}`}><b>{post.thread.title}</b><span>{post.excerpt}</span><small>{num(post.likeCount)} پسند</small></Link></li>)}</ul> : <p className="fx-muted">پاسخی ندارد.</p>}</section>
      {data.groups.length > 0 && <section className="fp-card"><h2>گروه‌ها</h2><div className="fp-groups">{data.groups.map((group) => <Link key={group.id} href={`/forum/g/${group.slug}`} style={{ ['--g' as string]: group.color }}><i aria-hidden="true">{group.icon || '👥'}</i>{group.name}{group.owner && <small>مدیر</small>}</Link>)}</div></section>}
    </>}
    {piece === 'activity' && <section className="fp-card"><h2>تازه‌ترین نوشته‌ها</h2>{data.activity.length ? <ul className="fp-list">{data.activity.map((post) => (
      <li key={post.id}><Link href={`/forum/t/${post.thread.id}?post=${post.postNumber}`}><b>{post.thread.title}</b><span>{post.excerpt}</span><small><TimeAgo date={post.createdAt} />{post.likeCount ? ` · ${num(post.likeCount)} پسند` : ''}</small></Link></li>
    ))}</ul> : <p className="fx-muted">فعالیتی نیست.</p>}</section>}
    {piece === 'topics' && <section className="fp-card"><h2>موضوع‌ها</h2>{data.topics.length ? <ul className="fp-list">{data.topics.map((topic) => (
      <li key={topic.id}><Link href={`/forum/t/${topic.id}`}><b>{topic.solvedPostId ? '✓ ' : ''}{topic.title}</b><small><TimeAgo date={topic.createdAt} /> · {num(topic.replyCount)} پاسخ · {num(topic.views)} بازدید</small></Link></li>
    ))}</ul> : <p className="fx-muted">موضوعی نیست.</p>}</section>}
    {piece === 'badges' && <section className="fp-card"><h2>نشان‌ها</h2><div className="fx-badge-grid">{data.badges.map((badge) => (
      <Link key={badge.slug} href={`/forum/badges/${badge.slug}`} className={`fx-badge-card is-${badge.tier.toLowerCase()}`}><span aria-hidden="true">{badge.icon}</span><b>{badge.name}</b><small>{badge.description}</small><em>{TIER[badge.tier]} · <TimeAgo date={badge.grantedAt} /></em></Link>
    ))}{!data.badges.length && <p className="fx-muted">هنوز نشانی نگرفته است.</p>}</div></section>}
  </div>
}
