import Link from '@/components/AppLink'
import type { Viewer } from '@/modules/forum/domain/community'
import { boardIndex, type BoardForum } from '@/modules/forum/server/board'
import ForumShell from '@/components/forum/ForumShell'
import { Avatar, TimeAgo, compact, num } from '@/components/forum/shared'

const Bubble = () => <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" /><path d="M9 11h6M9 14h3" /></svg>

function ForumRow({ forum }: { forum: BoardForum }) {
  return <li className={`fb-forum${forum.quiet ? ' is-quiet' : ''}`} style={{ ['--cat' as string]: forum.color }}>
    <span className="fb-forum-icon" aria-hidden="true">{forum.icon || <Bubble />}</span>
    <div className="fb-forum-main">
      <h3><Link href={`/forum/c/${forum.slug}`}>{forum.title}</Link>{forum.vip && <small className="fx-vip">VIP</small>}{forum.locked && <small className="fb-tag">فقط اطلاعیه</small>}</h3>
      {forum.description && <p>{forum.description}</p>}
    </div>
    <dl className="fb-forum-stats">
      <div><dt>موضوع</dt><dd>{compact(forum.threadCount)}</dd></div>
      <div><dt>پیام</dt><dd>{compact(forum.postCount)}</dd></div>
    </dl>
    <div className="fb-forum-last">
      {forum.last ? <>
        <Link href={`/forum/u/${forum.last.author.username}`} className="fb-forum-last-avatar" aria-label={`پروفایل ${forum.last.author.name}`}><Avatar author={forum.last.author} size={38} /></Link>
        <div>
          <Link href={`/forum/t/${forum.last.topicId}`} className="fb-forum-last-title">{forum.last.title}</Link>
          <small><Link href={`/forum/u/${forum.last.author.username}`}>{forum.last.author.name}</Link> · <TimeAgo date={forum.last.at} /></small>
        </div>
      </> : <small className="fb-forum-empty">هنوز موضوعی ندارد — <Link href={`/forum/new?category=${forum.slug}`}>اولین موضوع را شما بسازید</Link></small>}
    </div>
  </li>
}

/** The forum's front page in the manner of a board index: sections of forums with their last post, and what is happening beside them. */
export default async function BoardIndex({ viewer }: { viewer: Viewer }) {
  const board = await boardIndex(viewer)
  return <ForumShell viewer={viewer} active="home" wide>
    <header className="fb-hero">
      <div>
        <span className="fb-hero-eyebrow">انجمن</span>
        <h1>تالار گفتمان</h1>
        <p>بپرسید، پاسخ بدهید و با بقیهٔ اعضا دربارهٔ فیلم، بازی، موزیک و خریدهایتان گپ بزنید.</p>
        <ul className="fb-hero-stats" aria-label="آمار تالار">
          <li><b>{num(board.stats.threads)}</b>موضوع</li>
          <li><b>{num(board.stats.posts)}</b>پیام</li>
          <li><b>{num(board.stats.members)}</b>عضو فعال</li>
          <li className="is-live"><b>{num(board.stats.online)}</b>آنلاین</li>
        </ul>
      </div>
      <div className="fb-hero-actions">
        <Link href={viewer.userId ? '/forum/new' : '/login?next=/forum/new'} className="btn btn-primary">+ موضوع تازه</Link>
        <Link href="/forum/latest" className="btn btn-ghost">همهٔ موضوع‌ها</Link>
      </div>
    </header>

    <div className="fb-layout">
      <div className="fb-sections">
        {board.sections.map((section) => <section key={section.id} className="fb-section" style={section.color ? { ['--cat' as string]: section.color } : undefined} aria-labelledby={`fb-section-${section.id}`}>
          <header className="fb-section-head">
            <h2 id={`fb-section-${section.id}`}><Link href={section.slug ? `/forum/c/${section.slug}` : '/forum/categories'}>{section.title}</Link>{section.vip && <small className="fx-vip">VIP</small>}</h2>
            {!section.own && section.description && <p>{section.description}</p>}
          </header>
          <ul className="fb-forums">{section.forums.map((forum) => <ForumRow key={forum.id} forum={forum} />)}</ul>
        </section>)}
        {!board.sections.length && <div className="fx-empty"><p>هنوز انجمنی ساخته نشده است.</p></div>}
      </div>

      <aside className="fb-side" aria-label="فعالیت تالار">
        {board.topics.length > 0 && <section className="fb-widget" aria-labelledby="fb-recent">
          <h2 id="fb-recent">تازه‌ترین گفت‌وگوها</h2>
          <ul className="fb-recent">{board.topics.map((topic) => <li key={topic.id}>
            <Avatar author={topic.author} size={34} />
            <div>
              <Link href={`/forum/t/${topic.id}`}>{topic.title}</Link>
              <small><span className="fb-dot" style={{ background: topic.forum.color }} aria-hidden="true" />{topic.forum.title} · {topic.author.name} · <TimeAgo date={topic.at} short /></small>
            </div>
            <span className="fb-count" title="پاسخ">{compact(topic.replies)}</span>
          </li>)}</ul>
        </section>}

        {board.contributors.length > 0 && <section className="fb-widget" aria-labelledby="fb-top">
          <h2 id="fb-top">برترین‌های {num(board.days)} روز اخیر</h2>
          <ol className="fb-leaders">{board.contributors.map((row, index) => <li key={row.author.id}>
            <span className={`fb-rank is-${index + 1}`}>{num(index + 1)}</span>
            <Avatar author={row.author} size={36} />
            <div><Link href={`/forum/u/${row.author.username}`}>{row.author.name}</Link>{row.author.title && <small>{row.author.title}</small>}</div>
            <span className="fb-count">{num(row.posts)}<small>پیام</small></span>
          </li>)}</ol>
          <Link href="/forum/users" className="fb-widget-more">همهٔ اعضا</Link>
        </section>}

        <section className="fb-widget" aria-labelledby="fb-online">
          <h2 id="fb-online"><span className="fb-live" aria-hidden="true" />{num(board.stats.online)} نفر آنلاین</h2>
          {board.online.length > 0
            ? <ul className="fb-online">{board.online.map((author) => <li key={author.id}><Link href={`/forum/u/${author.username}`} title={author.name}><Avatar author={author} size={34} /><span className="sr-only">{author.name}</span></Link></li>)}</ul>
            : <p className="fx-muted fb-widget-note">{viewer.userId ? 'الان کسی جز شما اینجا نیست.' : 'برای دیدن اعضای حاضر وارد شوید.'}</p>}
        </section>

        <section className="fb-widget" aria-labelledby="fb-stats">
          <h2 id="fb-stats">آمار تالار</h2>
          <dl className="fb-stats">
            <div><dt>موضوع‌ها</dt><dd>{num(board.stats.threads)}</dd></div>
            <div><dt>پیام‌ها</dt><dd>{num(board.stats.posts)}</dd></div>
            <div><dt>اعضای فعال</dt><dd>{num(board.stats.members)}</dd></div>
          </dl>
          {board.newest && <p className="fb-newest">تازه‌ترین عضو: <Link href={`/forum/u/${board.newest.username}`}>{board.newest.name}</Link> 👋</p>}
        </section>
      </aside>
    </div>
  </ForumShell>
}
