import Link from '@/components/AppLink'
import { notFound } from 'next/navigation'
import { getForumViewer, topicList, type TopPeriod, type TopicFilter } from '@/modules/forum/server/forum'
import ForumShell, { type ForumNavKey } from '@/components/forum/ForumShell'
import TopicList from '@/components/forum/TopicList'
import { Pager, num } from '@/components/forum/shared'
import CategoryWatch from '@/components/forum/CategoryWatch'
import { categoryLevels } from '@/modules/forum/server/moderation'

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
      const paths: Record<TopicFilter, string> = { latest: '/forum', top: '/forum/top', unread: '/forum/unread', new: '/forum/new-topics', bookmarks: '/forum/bookmarks', mine: '/forum/mine', unanswered: '/forum/unanswered', solved: '/forum/solved' }
      const query = new URLSearchParams(extra).toString()
      return `${paths[key]}${query ? `?${query}` : ''}`
    }
    const query = new URLSearchParams({ ...(key === 'latest' ? {} : { filter: key }), ...extra }).toString()
    return `${base}${query ? `?${query}` : ''}`
  }
  const pageHref = (n: number) => hrefFor(data.filter, { ...(data.filter === 'top' && period ? { period } : {}), ...(n > 1 ? { page: String(n) } : {}) })
  const children = category ? data.categories.filter((c) => c.parentId === category.id) : []
  const navKey: ForumNavKey = category || tag ? '' : (data.filter === 'new' ? 'new' : data.filter)
  const newTopicHref = `/forum/new${category ? `?category=${category.slug}` : ''}`
  const level = category && signedIn ? (await categoryLevels(viewer.userId)).get(category.id) || 'NORMAL' : 'NORMAL'

  return (
    <ForumShell viewer={viewer} active={navKey} category={category?.slug}>
      {category ? (
        <header className="fx-cat-head" style={{ ['--cat' as string]: category.color }}>
          <div>
            <h1>{category.icon && <span aria-hidden="true">{category.icon} </span>}{category.title}</h1>
            {category.description && <p>{category.description}</p>}
            <p className="fx-muted">{num(category.threadCount)} موضوع · {num(category.postCount)} پیام{category.vip ? ' · ویژهٔ اعضای VIP' : ''}{category.locked ? ' · فقط تیم موضوع می‌سازد' : ''}</p>
            {signedIn && <CategoryWatch categoryId={category.id} initial={level} />}
            {children.length > 0 && <div className="fx-subcats">{children.map((child) => <Link key={child.id} href={`/forum/c/${child.slug}`}><i style={{ background: child.color }} aria-hidden="true" />{child.title}<small>{num(child.threadCount)}</small></Link>)}</div>}
          </div>
        </header>
      ) : tag ? (
        <header className="fx-page-head"><h1>برچسب <span className="fx-tag is-large">#{tag}</span></h1><p className="fx-muted">{num(data.total)} موضوع</p></header>
      ) : null}

      <div className="fx-toolbar">
        <nav className="fx-tabs" aria-label="فیلتر موضوع‌ها">
          {FILTER_TABS.filter((tab) => signedIn || !tab.personal).map((tab) => (
            <Link key={tab.key} href={hrefFor(tab.key)} className={data.filter === tab.key ? 'is-active' : ''} aria-current={data.filter === tab.key ? 'page' : undefined}>{tab.label}</Link>
          ))}
        </nav>
        {(!category || category.access.create) && <Link href={signedIn ? newTopicHref : `/login?next=${encodeURIComponent(newTopicHref)}`} className="btn btn-primary btn-sm fx-new-btn">+ موضوع تازه</Link>}
      </div>
      {data.filter === 'top' && (
        <nav className="fx-periods" aria-label="بازهٔ زمانی">
          {PERIODS.map((item) => <Link key={item.key} href={hrefFor('top', { period: item.key })} className={(period || 'month') === item.key ? 'is-active' : ''}>{item.label}</Link>)}
        </nav>
      )}
      {!category && !tag && <h1 className="sr-only">{TITLES[data.filter]}</h1>}
      <TopicList rows={data.rows} showCategory={!category || children.length > 0} empty={EMPTY[data.filter]} />
      <Pager page={data.page} pages={data.pages} href={pageHref} />
    </ForumShell>
  )
}
