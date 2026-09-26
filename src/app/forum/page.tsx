import type { Metadata } from 'next'
import Link from 'next/link'
import { requireModule } from '@/extensions/server/modules'
import { forumStats, getForumActor, listBoards, recentThreads } from '@/modules/forum/server/forum'
import { getServerLocale } from '@/i18n/server'
import MediaShell from '@/components/media/MediaShell'
import { forumNav } from '@/components/media/nav'
import { EmptyState, VipBadge } from '@/components/media/MediaCards'
import { Avatar, TimeAgo } from '@/components/forum/shared'
import VipStrip from '@/components/media/VipStrip'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const fa = (await getServerLocale()) === 'fa'
  return { title: fa ? 'تالار گفتمان' : 'Forum', description: fa ? 'پرسش، پاسخ و گفت‌وگو با کاربران و تیم موبوکام' : 'Questions, answers and conversations with the community.', alternates: { canonical: '/forum' } }
}

export default async function ForumHomePage() {
  await requireModule('forum')
  const [locale, actor] = await Promise.all([getServerLocale(), getForumActor()])
  const fa = locale === 'fa'
  const [boards, recent, stats] = await Promise.all([listBoards(actor), recentThreads(8), forumStats()])
  const n = (value: number) => value.toLocaleString(fa ? 'fa-IR' : 'en-US')
  return (
    <MediaShell section="forum" active="home" nav={forumNav(fa)}>
      <section className="fr-hero">
        <div className="container fr-hero-inner">
          <div><span className="md-eyebrow">{fa ? 'انجمن موبوکام' : 'MoboCom community'}</span><h1>{fa ? 'تالار گفتمان' : 'Forum'}</h1><p>{fa ? 'سؤال بپرسید، تجربه‌تان را به اشتراک بگذارید و با بقیهٔ کاربران گفت‌وگو کنید.' : 'Ask questions, share your experience and talk with other members.'}</p></div>
          <dl className="fr-stats"><div><dt>{fa ? 'موضوع' : 'Threads'}</dt><dd>{n(stats.threads)}</dd></div><div><dt>{fa ? 'پیام' : 'Posts'}</dt><dd>{n(stats.posts)}</dd></div><div><dt>{fa ? 'عضو فعال' : 'Members'}</dt><dd>{n(stats.members)}</dd></div></dl>
        </div>
      </section>
      <div className="container md-body fr-layout">
        <div className="fr-boards">
          {!boards.length && <EmptyState fa={fa} title={fa ? 'هنوز انجمنی ساخته نشده' : 'No boards yet'} text={fa ? 'مدیر سایت می‌تواند از پنل مدیریت انجمن‌ها را بسازد.' : 'An administrator can create boards from the admin panel.'} />}
          {boards.map((board) => (
            <Link key={board.id} href={`/forum/c/${board.slug}`} className={`fr-board${board.readable ? '' : ' is-locked'}`}>
              <span className="fr-board-icon" aria-hidden="true">{board.icon || '💬'}</span>
              <span className="fr-board-body">
                <b>{board.title} {board.access === 'MEMBERS' && <VipBadge fa={fa} small />}{board.locked && <em className="fr-tag">{fa ? 'فقط اعلان' : 'Announcements'}</em>}</b>
                {board.description && <small>{board.description}</small>}
                {board.latest && <span className="fr-board-latest">{fa ? 'آخرین:' : 'Latest:'} {board.latest.title} · <TimeAgo date={board.latest.lastPostAt} fa={fa} /></span>}
              </span>
              <span className="fr-board-counts"><span><b>{n(board.threadCount)}</b>{fa ? 'موضوع' : 'threads'}</span><span><b>{n(board.postCount)}</b>{fa ? 'پیام' : 'posts'}</span></span>
            </Link>
          ))}
        </div>
        <aside className="fr-aside">
          <Link href="/forum/new" className="btn btn-primary fr-new-btn">{fa ? '+ ایجاد موضوع جدید' : '+ Start a thread'}</Link>
          {recent.length > 0 && <section className="card fr-recent"><h2>{fa ? 'گفت‌وگوهای اخیر' : 'Recent threads'}</h2><ul>{recent.map((thread) => <li key={thread.id}><Avatar author={thread.author} size={30} /><span><Link href={`/forum/t/${thread.id}`}>{thread.title}</Link><small>{thread.board?.title} · <TimeAgo date={thread.lastPostAt} fa={fa} /></small></span></li>)}</ul></section>}
          {!actor.member && <VipStrip fa={fa} kind="forum" />}
        </aside>
      </div>
    </MediaShell>
  )
}
