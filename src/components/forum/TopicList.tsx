import Link from '@/components/AppLink'
import type { TopicRow } from '@/modules/forum/server/forum'
import { Avatar, CategoryBadge, TagChip, TimeAgo, compact, num } from '@/components/forum/shared'
import { profileAddress } from '@/modules/identity/domain/profile-address'

const Icon = ({ d }: { d: string }) => <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
const PIN = 'M12 17v5M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6Z', LOCK = 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3', CHECK = 'M5 12.5l4.5 4.5L19 7.5'
const REPLY = 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z', EYE = 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z'

function Row({ topic, showCategory }: { topic: TopicRow; showCategory: boolean }) {
  const href = topic.unread ? `/forum/t/${topic.id}?post=${topic.postCount - topic.unread + 1}` : `/forum/t/${topic.id}`
  const hot = topic.replyCount > 20 || topic.views > 500 || topic.likeCount > 20
  const unseen = topic.unread > 0 || topic.isNew
  return (
    <li className={`tl-row${topic.pinned ? ' is-pinned' : ''}${unseen ? ' is-unseen' : ''}${topic.solved ? ' is-solved' : ''}`}>
      <Link href={profileAddress(topic.author.username)} className="tl-starter" aria-label={`پروفایل ${topic.author.name}`}><Avatar author={topic.author} size={46} /></Link>
      <div className="tl-main">
        <h3>
          <Link href={href}>{topic.title}</Link>
          {topic.unread > 0 && <span className="tl-unread" title="پاسخ خوانده‌نشده">{num(topic.unread)} تازه</span>}
          {topic.isNew && <span className="tl-flag is-new">تازه</span>}
        </h3>
        {topic.pinned && topic.excerpt && <p className="tl-excerpt">{topic.excerpt}</p>}
        <div className="tl-meta">
          {topic.pinned && <span className="tl-flag is-pin"><Icon d={PIN} />سنجاق‌شده</span>}
          {topic.solved && <span className="tl-flag is-ok"><Icon d={CHECK} />حل‌شده</span>}
          {topic.locked && <span className="tl-flag is-lock"><Icon d={LOCK} />بسته</span>}
          {hot && <span className="tl-flag is-hot">داغ</span>}
          <span className="tl-by"><Link href={profileAddress(topic.author.username)}>{topic.author.name}</Link><span aria-hidden="true">·</span><TimeAgo date={topic.createdAt} /></span>
          {showCategory && topic.category.slug && <CategoryBadge category={topic.category} />}
          {topic.tags.map((tag) => <TagChip key={tag} name={tag} />)}
        </div>
      </div>
      <dl className="tl-stats">
        <div className={topic.replyCount > 20 ? 'is-hot' : ''}><dt><Icon d={REPLY} /><span className="sr-only">پاسخ</span></dt><dd>{compact(topic.replyCount)}</dd></div>
        <div><dt><Icon d={EYE} /><span className="sr-only">بازدید</span></dt><dd>{compact(topic.views)}</dd></div>
      </dl>
      <div className="tl-last">
        <Link href={profileAddress(topic.lastPoster.username)} tabIndex={-1} aria-hidden="true"><Avatar author={topic.lastPoster} size={34} /></Link>
        <div>
          <Link href={profileAddress(topic.lastPoster.username)} className="tl-last-name">{topic.lastPoster.name}</Link>
          <Link href={`/forum/t/${topic.id}?post=${topic.postCount}`} className="tl-last-when" title="رفتن به آخرین پیام"><TimeAgo date={topic.lastPostAt} /></Link>
        </div>
      </div>
    </li>
  )
}

/** Topics as rows of a card: who started each, its state, its size, and who wrote last. Pinned topics stand apart, first. */
export default function TopicList({ rows, showCategory = true, empty }: { rows: TopicRow[]; showCategory?: boolean; empty?: string }) {
  if (!rows.length) return <div className="fx-empty"><span aria-hidden="true">💬</span><p>{empty || 'هنوز موضوعی اینجا نیست.'}</p></div>
  const pinned = rows.filter((topic) => topic.pinned), rest = rows.filter((topic) => !topic.pinned)
  return (
    <div className="tl">
      <div className="tl-cols" aria-hidden="true"><span>موضوع</span><span>آمار</span><span>آخرین پاسخ</span></div>
      {pinned.length > 0 && <ul className="tl-list is-pinned" aria-label="موضوع‌های سنجاق‌شده">{pinned.map((topic) => <Row key={topic.id} topic={topic} showCategory={showCategory} />)}</ul>}
      {rest.length > 0 && <ul className="tl-list" aria-label="موضوع‌ها">{rest.map((topic) => <Row key={topic.id} topic={topic} showCategory={showCategory} />)}</ul>}
    </div>
  )
}
