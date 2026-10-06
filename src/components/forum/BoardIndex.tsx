import Link from '@/components/AppLink'
import type { Viewer } from '@/modules/forum/domain/community'
import { boardIndex } from '@/modules/forum/server/board'
import ForumRow, { ForumRowsHead } from '@/components/forum/ForumRow'
import ForumShell from '@/components/forum/ForumShell'
import { Avatar, TimeAgo, compact, num } from '@/components/forum/shared'

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
        {/* A section folds away with its heading; the browser keeps that, no script. */}
        {board.sections.map((section) => <details key={section.id} open className="bi-section" style={section.color ? { ['--cat' as string]: section.color } : undefined}>
          <summary className="bi-section-head">
            <span className="bi-section-sign" aria-hidden="true">{section.icon || '▦'}</span>
            <span className="bi-section-title">
              <h2>{section.slug ? <Link href={`/forum/c/${section.slug}`}>{section.title}</Link> : section.title}{section.vip && <small className="bi-tag is-vip">VIP</small>}</h2>
              {section.description && <small>{section.description}</small>}
            </span>
            <span className="bi-section-count">{num(section.forums.length)} انجمن<i aria-hidden="true">·</i>{compact(section.topics)} موضوع<i aria-hidden="true">·</i>{compact(section.posts)} پیام</span>
            <span className="bi-fold" aria-hidden="true" />
          </summary>
          <ForumRowsHead />
          <ul className="bi-forums">{section.forums.map((forum) => <ForumRow key={forum.id} forum={forum} />)}</ul>
        </details>)}
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
