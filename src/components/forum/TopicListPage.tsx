import Link from '@/components/AppLink'
import { notFound } from 'next/navigation'
import { getForumViewer, topicList, type TopPeriod, type TopicFilter } from '@/modules/forum/server/forum'
import ForumShell, { type ForumNavKey } from '@/components/forum/ForumShell'
import TopicList from '@/components/forum/TopicList'
import { Avatar, Pager, num } from '@/components/forum/shared'
import CategoryWatch from '@/components/forum/CategoryWatch'
import { categoryLevels } from '@/modules/forum/server/moderation'
import { forumModerators, subforumRows } from '@/modules/forum/server/board'
import { CLUBS_SECTION, categoryFamily, categoryPath } from '@/modules/forum/domain/tree'
import ForumRow, { ForumRowsHead } from '@/components/forum/ForumRow'

const FILTER_TABS: { key: TopicFilter; label: string; personal?: boolean }[] = [
  { key: 'latest', label: 'آخرین' }, { key: 'top', label: 'برترین' }, { key: 'unread', label: 'خوانده‌نشده', personal: true }, { key: 'new', label: 'تازه', personal: true },
  { key: 'unanswered', label: 'بی‌پاسخ' }, { key: 'solved', label: 'حل‌شده' },
]
const PERIODS: { key: TopPeriod; label: string }[] = [{ key: 'day', label: 'امروز' }, { key: 'week', label: 'هفته' }, { key: 'month', label: 'ماه' }, { key: 'year', label: 'سال' }, { key: 'all', label: 'همیشه' }]
const TITLES: Record<TopicFilter, string> = { latest: 'آخرین موضوع‌ها', top: 'برترین موضوع‌ها', unread: 'خوانده‌نشده‌ها', new: 'موضوع‌های تازه', bookmarks: 'نشان‌شده‌ها', mine: 'فعالیت من', unanswered: 'موضوع‌های بی‌پاسخ', solved: 'موضوع‌های حل‌شده' }
const EMPTY: Partial<Record<TopicFilter, string>> = { unread: 'همه‌چیز را خوانده‌اید 🎉', new: 'موضوع تازه‌ای برای شما نیست.', bookmarks: 'هنوز پیامی نشان نکرده‌اید. روی 🔖 زیر هر پیام بزنید.', mine: 'هنوز موضوع یا پاسخی ننوشته‌اید.', unanswered: 'همهٔ موضوع‌ها پاسخ گرفته‌اند.' }

/** Shared page for every topic list: global filters, a category, or a tag. */
export default async function TopicListPage({ filter = 'latest', categorySlug, tag, period, page }: { filter?: TopicFilter; categorySlug?: string; tag?: string; period?: TopPeriod; page?: number }) {
  const viewer = await getForumViewer()
  const data = await topicList({ viewer, filter, categorySlug, tag, period, page })
  if (!data) notFound()
  const { category } = data
  const signedIn = !!viewer.userId
  const base = category ? `/forum/c/${category.slug}` : tag ? `/forum/tag/${encodeURIComponent(tag)}` : ''
  const hrefFor = (key: TopicFilter, extra: Record<string, string> = {}) => {
    if (!base) {
      const paths: Record<TopicFilter, string> = { latest: '/forum/latest', top: '/forum/top', unread: '/forum/unread', new: '/forum/new-topics', bookmarks: '/forum/bookmarks', mine: '/forum/mine', unanswered: '/forum/unanswered', solved: '/forum/solved' }
      const query = new URLSearchParams(extra).toString()
      return `${paths[key]}${query ? `?${query}` : ''}`
    }
    const query = new URLSearchParams({ ...(key === 'latest' ? {} : { filter: key }), ...extra }).toString()
    return `${base}${query ? `?${query}` : ''}`
  }
  const pageHref = (n: number) => hrefFor(data.filter, { ...(data.filter === 'top' && period ? { period } : {}), ...(n > 1 ? { page: String(n) } : {}) })
  const children = category ? await subforumRows(viewer, category.id) : []
  const trail = category ? categoryPath(data.categories, category.id) : []
  const moderators = category ? await forumModerators(trail.map((step) => step.id)) : []
  // A forum is sized with its subforums, as the board index sizes it.
  const family = category ? categoryFamily(data.categories, category.id).map((id) => data.categories.find((c) => c.id === id)!) : []
  const topics = family.reduce((sum, row) => sum + row.threadCount, 0), posts = family.reduce((sum, row) => sum + row.postCount, 0)
  const navKey: ForumNavKey = category || tag ? '' : (data.filter === 'new' ? 'new' : data.filter)
  const newTopicHref = `/forum/new${category ? `?category=${category.slug}` : ''}`
  const level = category && signedIn ? (await categoryLevels(viewer.userId)).get(category.id) || 'NORMAL' : 'NORMAL'

  return (
    <ForumShell viewer={viewer} active={navKey} category={category?.slug} wide>
      {category ? <>
        <nav className="fc-crumbs" aria-label="مسیر">
          <Link href="/forum">انجمن‌ها</Link>
          {trail.map((step, index) => index < trail.length - 1 ? <Link key={step.id} href={step.slug === CLUBS_SECTION ? '/forum/clubs' : `/forum/c/${step.slug}`}>{step.title}</Link> : <span key={step.id} aria-current="page">{step.title}</span>)}
        </nav>
        <header className="fc-head" style={{ ['--cat' as string]: category.color }}>
          <span className="fc-sign" aria-hidden="true">{category.icon || '💬'}</span>
          <div className="fc-id">
            <h1>{category.title}{category.vip && <small className="bi-tag is-vip">VIP</small>}{category.locked && <small className="bi-tag">فقط اطلاعیه</small>}</h1>
            {category.description && <p>{category.description}</p>}
            <ul className="fc-facts">
              <li><b>{num(topics)}</b>موضوع</li>
              <li><b>{num(posts)}</b>پیام</li>
              {children.length > 0 && <li><b>{num(children.length)}</b>زیرانجمن</li>}
            </ul>
          </div>
          <div className="fc-actions">
            {category.access.create && <Link href={signedIn ? newTopicHref : `/login?next=${encodeURIComponent(newTopicHref)}`} className="btn fc-new">+ موضوع تازه</Link>}
            {signedIn && <CategoryWatch categoryId={category.id} initial={level} />}
          </div>
        </header>
        {children.length > 0 && <section className="bi-section fc-subs" style={{ ['--cat' as string]: category.color }} aria-labelledby="fc-subs-title">
          <header className="bi-section-head"><span className="bi-section-title"><h2 id="fc-subs-title">زیرانجمن‌ها</h2></span></header>
          <ForumRowsHead />
          <ul className="bi-forums">{children.map((child) => <ForumRow key={child.id} forum={child} />)}</ul>
        </section>}
        {moderators.length > 0 && <p className="fc-mods"><span>مدیران این {children.length > 0 && !category.parentId ? 'بخش' : 'انجمن'}</span>{moderators.map((person) => <Link key={person.id} href={`/forum/u/${person.username}`}><Avatar author={person} size={26} />{person.name}</Link>)}</p>}
      </> : (
        <header className="fc-plain">
          <div>
            <h1>{tag ? <>برچسب <span className="fx-tag is-large">#{tag}</span></> : TITLES[data.filter]}</h1>
            <p className="fx-muted">{num(data.total)} موضوع</p>
          </div>
          <Link href={signedIn ? newTopicHref : `/login?next=${encodeURIComponent(newTopicHref)}`} className="btn btn-primary">+ موضوع تازه</Link>
        </header>
      )}

      <div className="fc-toolbar">
        <nav className="fx-strip" aria-label="فیلتر موضوع‌ها">
          {FILTER_TABS.filter((tab) => signedIn || !tab.personal).map((tab) => (
            <Link key={tab.key} href={hrefFor(tab.key)} className={data.filter === tab.key ? 'is-active' : ''} aria-current={data.filter === tab.key ? 'page' : undefined}>{tab.label}</Link>
          ))}
        </nav>
        {category && <p className="fc-count">{num(data.total)} موضوع{children.length > 0 ? ' با زیرانجمن‌ها' : ''}</p>}
      </div>
      {data.filter === 'top' && (
        <nav className="fx-periods" aria-label="بازهٔ زمانی">
          {PERIODS.map((item) => <Link key={item.key} href={hrefFor('top', { period: item.key })} className={(period || 'month') === item.key ? 'is-active' : ''}>{item.label}</Link>)}
        </nav>
      )}
      <TopicList rows={data.rows} showCategory={!category || children.length > 0} empty={EMPTY[data.filter]} />
      <Pager page={data.page} pages={data.pages} href={pageHref} />
    </ForumShell>
  )
}
