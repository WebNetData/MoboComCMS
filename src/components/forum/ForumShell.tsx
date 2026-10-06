import Link from '@/components/AppLink'
import { categoryTree } from '@/modules/forum/domain/tree'
import type { ReactNode } from 'react'
import MediaShell from '@/components/media/MediaShell'
import type { Viewer } from '@/modules/forum/domain/community'
import { popularTags, viewerCounts, visibleCategories } from '@/modules/forum/server/forum'
import { shellIdentity } from '@/modules/forum/server/people'
import { Avatar, num } from '@/components/forum/shared'
import NotificationsMenu from '@/components/forum/NotificationsMenu'
import { GlobalShortcuts } from '@/components/forum/Shortcuts'
import LiveSearchInput from '@/components/search/LiveSearchInput'

export type ForumNavKey = 'home' | 'activity' | 'latest' | 'new' | 'unread' | 'top' | 'bookmarks' | 'mine' | 'unanswered' | 'solved' | 'categories' | 'users' | 'groups' | 'badges' | 'search' | 'messages' | 'review' | ''

/**
 * Forum chrome: site header/footer, a sticky community sidebar (filters,
 * categories, tags, people) and a top bar with search, notifications and the
 * viewer's avatar. On narrow screens the sidebar folds into a disclosure.
 */
export default async function ForumShell({ viewer, active = '', category, wide = false, children }: { viewer: Viewer; active?: ForumNavKey; category?: string; wide?: boolean; children: ReactNode }) {
  const [categories, counts, tags, me] = await Promise.all([
    visibleCategories(viewer),
    viewerCounts(viewer),
    popularTags(viewer, 10),
    viewer.userId ? shellIdentity(viewer.userId) : Promise.resolve(null),
  ])
  const signedIn = !!viewer.userId
  const link = (key: ForumNavKey, href: string, label: string, icon: string, badge?: number) => (
    <Link href={href} className={active === key ? 'is-active' : ''} aria-current={active === key ? 'page' : undefined}>
      <span aria-hidden="true">{icon}</span>{label}{badge ? <em>{num(badge)}</em> : null}
    </Link>
  )
  const tree = categoryTree(categories)

  const sidebar = (
    <>
      <nav className="fx-side-group" aria-label="موضوع‌ها">
        {link('home', '/forum', 'انجمن‌ها', '▦')}
        {link('activity', '/forum/activity', 'فعالیت‌ها', '⚡')}
        {link('latest', '/forum/latest', 'همهٔ موضوع‌ها', '☰')}
        {signedIn && link('unread', '/forum/unread', 'خوانده‌نشده', '●', counts.unread)}
        {signedIn && link('new', '/forum/new-topics', 'تازه', '✦', counts.fresh)}
        {link('top', '/forum/top', 'برترین‌ها', '▲')}
        {link('unanswered', '/forum/unanswered', 'بی‌پاسخ', '?')}
        {link('solved', '/forum/solved', 'حل‌شده', '✓')}
        {signedIn && link('bookmarks', '/forum/bookmarks', 'نشان‌شده‌ها', '🔖', counts.bookmarks)}
        {signedIn && link('mine', '/forum/mine', 'فعالیت من', '✎')}
        {signedIn && link('messages', '/forum/messages', 'پیام‌های خصوصی', '✉', counts.messages)}
        {viewer.moderator && link('review', '/forum/review', 'صف بررسی', '⚖', counts.review)}
      </nav>
      <nav className="fx-side-group" aria-label="دسته‌بندی‌ها">
        <h3><Link href="/forum/categories" className={active === 'categories' ? 'is-active' : ''}>دسته‌بندی‌ها</Link></h3>
        {tree.map(({ category: c, depth }) => (
          <Link key={c.id} href={`/forum/c/${c.slug}`} className={`${depth ? `fx-sub is-depth-${depth}` : ''}${category === c.slug ? ' is-active' : ''}`}><i className="fx-dot" style={{ background: c.color }} aria-hidden="true" />{c.title}{c.vip && <small className="fx-vip">VIP</small>}</Link>
        ))}
      </nav>
      {tags.length > 0 && (
        <nav className="fx-side-group fx-side-tags" aria-label="برچسب‌ها">
          <h3>برچسب‌ها</h3>
          <div>{tags.map((tag) => <Link key={tag.name} href={`/forum/tag/${encodeURIComponent(tag.name)}`}>#{tag.name}</Link>)}</div>
        </nav>
      )}
      <nav className="fx-side-group" aria-label="جامعه">
        <h3>جامعه</h3>
        {link('users', '/forum/users', 'کاربران', '👤')}
        {link('groups', '/forum/g', 'گروه‌ها', '👥')}
        {link('badges', '/forum/badges', 'نشان‌ها', '🏅')}
      </nav>
    </>
  )

  return (
    <MediaShell section="forum">
      <div className="fx-root">
        <header className="fx-top">
          <div className="container fx-top-inner">
            <Link href="/forum" className="fx-brand">تالار گفتمان</Link>
            <form action="/forum/search" className="fx-search" role="search">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" strokeLinecap="round" /></svg>
              <LiveSearchInput action="/forum/search" placeholder="جست‌وجو در تالار…" />
            </form>
            <div className="fx-top-actions">
              {signedIn ? <>
                <Link href="/forum/messages" className="fx-top-icon" aria-label={counts.messages ? `پیام‌های خصوصی، ${num(counts.messages)} خوانده‌نشده` : 'پیام‌های خصوصی'}>✉{counts.messages > 0 && <em>{num(counts.messages)}</em>}</Link>
                <NotificationsMenu />
                {me && <Link href={`/forum/u/${me.username}`} className="fx-me" aria-label="پروفایل من"><Avatar author={{ name: me.user.name, avatarColor: me.user.avatarColor, avatar: me.avatar, username: me.username }} size={34} /></Link>}
              </> : <Link href="/login?next=/forum" className="btn btn-primary btn-sm">ورود / ثبت‌نام</Link>}
            </div>
          </div>
        </header>
        {wide ? (
          // The board index uses the whole width: the filters become a strip of links above it.
          <div className="container fx-layout fx-layout-wide">
            <nav className="fx-strip" aria-label="بخش‌های تالار">
              {link('home', '/forum', 'انجمن‌ها', '▦')}
              {link('activity', '/forum/activity', 'فعالیت‌ها', '⚡')}
              {link('latest', '/forum/latest', 'همهٔ موضوع‌ها', '☰')}
              {signedIn && link('unread', '/forum/unread', 'خوانده‌نشده', '●', counts.unread)}
              {link('top', '/forum/top', 'برترین‌ها', '▲')}
              {link('unanswered', '/forum/unanswered', 'بی‌پاسخ', '?')}
              {link('solved', '/forum/solved', 'حل‌شده', '✓')}
              {signedIn && link('mine', '/forum/mine', 'فعالیت من', '✎')}
              {link('users', '/forum/users', 'اعضا', '👤')}
              {link('groups', '/forum/g', 'گروه‌ها', '👥')}
              {link('badges', '/forum/badges', 'نشان‌ها', '🏅')}
              {viewer.moderator && link('review', '/forum/review', 'صف بررسی', '⚖', counts.review)}
            </nav>
            <div className="fx-main">{children}</div>
          </div>
        ) : (
          <div className="container fx-layout">
            <aside className="fx-side">
              <details className="fx-side-toggle"><summary>منوی تالار</summary><div className="fx-side-inner">{sidebar}</div></details>
              <div className="fx-side-inner fx-side-desktop">{sidebar}</div>
            </aside>
            <div className="fx-main">{children}</div>
          </div>
        )}
        <GlobalShortcuts />
      </div>
    </MediaShell>
  )
}
