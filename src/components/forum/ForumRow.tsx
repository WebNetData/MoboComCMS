import Link from '@/components/AppLink'
import type { BoardForum } from '@/modules/forum/server/board'
import { Avatar, TimeAgo, compact } from '@/components/forum/shared'

const Bubble = () => <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" /><path d="M9 11h6M9 14h3" /></svg>

/** One forum on the board: its sign, what it is for, its subforums, its size and its last post. */
export default function ForumRow({ forum }: { forum: BoardForum }) {
  return <li className={`bi-forum${forum.quiet ? ' is-quiet' : ''}`} style={{ ['--cat' as string]: forum.color }}>
    <Link href={`/forum/c/${forum.slug}`} className="bi-sign" tabIndex={-1} aria-hidden="true">{forum.icon || <Bubble />}</Link>
    <div className="bi-main">
      <h3><Link href={`/forum/c/${forum.slug}`}>{forum.title}</Link>{forum.vip && <small className="bi-tag is-vip">VIP</small>}{forum.locked && <small className="bi-tag">فقط اطلاعیه</small>}{forum.restricted && <small className="bi-tag">خصوصی</small>}</h3>
      {forum.description && <p>{forum.description}</p>}
      {forum.subforums.length > 0 && <ul className="bi-subs" aria-label={`زیرانجمن‌های ${forum.title}`}>{forum.subforums.map((sub) => (
        <li key={sub.id}><Link href={`/forum/c/${sub.slug}`} className={sub.quiet ? 'is-quiet' : ''} style={{ ['--cat' as string]: sub.color }}><i aria-hidden="true" />{sub.title}<em>{compact(sub.topics)}</em></Link></li>
      ))}</ul>}
    </div>
    <dl className="bi-stats">
      <div><dd>{compact(forum.topics)}</dd><dt>موضوع</dt></div>
      <div><dd>{compact(forum.posts)}</dd><dt>پیام</dt></div>
    </dl>
    <div className="bi-last">
      {forum.last ? <>
        <Link href={`/forum/u/${forum.last.author.username}`} className="bi-last-avatar" aria-label={`پروفایل ${forum.last.author.name}`}><Avatar author={forum.last.author} size={42} /></Link>
        <div>
          <Link href={`/forum/t/${forum.last.topicId}`} className="bi-last-title">{forum.last.title}</Link>
          <small><Link href={`/forum/u/${forum.last.author.username}`}>{forum.last.author.name}</Link><span aria-hidden="true">·</span><TimeAgo date={forum.last.at} /></small>
        </div>
      </> : <small className="bi-last-empty">هنوز موضوعی ندارد<Link href={`/forum/new?category=${forum.slug}`}>اولین موضوع را بسازید</Link></small>}
    </div>
  </li>
}

/** The column titles above a list of forums; hidden where the rows stack. */
export function ForumRowsHead() {
  return <div className="bi-cols" aria-hidden="true"><span>انجمن</span><span>آمار</span><span>آخرین ارسال</span></div>
}
