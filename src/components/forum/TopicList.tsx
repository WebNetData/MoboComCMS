import Link from '@/components/AppLink'
import type { TopicRow } from '@/modules/forum/server/forum'
import { Avatar, CategoryBadge, TagChip, TimeAgo, compact, num } from '@/components/forum/shared'

/** Topic table: title with category/tags, recent posters, replies, views and last activity. */
export default function TopicList({ rows, showCategory = true, empty }: { rows: TopicRow[]; showCategory?: boolean; empty?: string }) {
  if (!rows.length) return <div className="fx-empty"><span aria-hidden="true">💬</span><p>{empty || 'هنوز موضوعی اینجا نیست.'}</p></div>
  return (
    <table className="fx-topics">
      <thead><tr><th scope="col">موضوع</th><th scope="col" className="fx-col-posters"><span className="sr-only">کاربران</span></th><th scope="col" className="fx-col-num">پاسخ</th><th scope="col" className="fx-col-num">بازدید</th><th scope="col" className="fx-col-num">فعالیت</th></tr></thead>
      <tbody>
        {rows.map((topic) => {
          const href = topic.unread ? `/forum/t/${topic.id}?post=${topic.postCount - topic.unread + 1}` : `/forum/t/${topic.id}`
          const hot = topic.views > 500 || topic.likeCount > 20
          return (
            <tr key={topic.id} className={`${topic.pinned ? 'is-pinned ' : ''}${topic.unread || topic.isNew ? 'is-unseen' : ''}`}>
              <td className="fx-col-main">
                <div className="fx-topic-title">
                  {topic.pinned && <span className="fx-state" title="سنجاق‌شده" aria-label="سنجاق‌شده">📌</span>}
                  {topic.locked && <span className="fx-state" title="بسته‌شده" aria-label="بسته‌شده">🔒</span>}
                  {topic.solved && <span className="fx-state is-solved" title="حل‌شده" aria-label="حل‌شده">✓</span>}
                  <Link href={href}>{topic.title}</Link>
                  {topic.unread > 0 && <span className="fx-unread" title="پاسخ خوانده‌نشده">{num(topic.unread)}</span>}
                  {topic.isNew && <span className="fx-new">تازه</span>}
                </div>
                <div className="fx-topic-meta">
                  {showCategory && topic.category.slug && <CategoryBadge category={topic.category} />}
                  {topic.tags.map((tag) => <TagChip key={tag} name={tag} />)}
                </div>
                {topic.pinned && topic.excerpt && <p className="fx-topic-excerpt">{topic.excerpt}</p>}
              </td>
              <td className="fx-col-posters">
                <span className="fx-posters">{topic.posters.map((poster, index) => (
                  <Link key={poster.id} href={`/forum/u/${poster.username}`} title={`${poster.name}${index === 0 ? ' — نویسنده' : ''}`} className={index === 0 ? 'is-op' : ''}><Avatar author={poster} size={28} /></Link>
                ))}</span>
              </td>
              <td className={`fx-col-num${topic.replyCount > 20 ? ' is-hot' : ''}`}><span className="fx-cell-label">پاسخ</span>{compact(topic.replyCount)}</td>
              <td className={`fx-col-num${hot ? ' is-hot' : ''}`}><span className="fx-cell-label">بازدید</span>{compact(topic.views)}</td>
              <td className="fx-col-num fx-col-activity"><span className="fx-cell-label">فعالیت</span><Link href={`/forum/t/${topic.id}?post=${topic.postCount}`} title={`آخرین پاسخ: ${topic.lastPoster.name}`}><TimeAgo date={topic.lastPostAt} short /></Link></td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
