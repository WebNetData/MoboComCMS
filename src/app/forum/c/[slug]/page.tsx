import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireModule } from '@/extensions/server/modules'
import { getBoard, getForumActor } from '@/modules/forum/server/forum'
import { getServerLocale } from '@/i18n/server'
import MediaShell from '@/components/media/MediaShell'
import { forumNav } from '@/components/media/nav'
import { EmptyState, VipBadge, VipGate } from '@/components/media/MediaCards'
import { Avatar, Pager, TimeAgo } from '@/components/forum/shared'

export const dynamic = 'force-dynamic'
type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ page?: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ slug }, actor] = await Promise.all([params, getForumActor()])
  const data = await getBoard(slug, 1, actor)
  if (!data) return {}
  return { title: data.board.title, description: data.board.description || undefined, alternates: { canonical: `/forum/c/${data.board.slug}` }, ...(data.board.access === 'MEMBERS' ? { robots: { index: false } } : {}) }
}

export default async function ForumBoardPage({ params, searchParams }: Props) {
  await requireModule('forum')
  const [{ slug }, query, locale, actor] = await Promise.all([params, searchParams, getServerLocale(), getForumActor()])
  const data = await getBoard(slug, Number(query.page) || 1, actor)
  if (!data) notFound()
  const fa = locale === 'fa'
  const n = (value: number) => value.toLocaleString(fa ? 'fa-IR' : 'en-US')
  const { board } = data
  return (
    <MediaShell section="forum" nav={forumNav(fa)}>
      <div className="container md-body">
        <header className="fr-board-head">
          <div>
            <nav className="cn-crumbs"><Link href="/forum">{fa ? 'تالار گفتمان' : 'Forum'}</Link></nav>
            <h1>{board.title} {board.access === 'MEMBERS' && <VipBadge fa={fa} />}</h1>
            {board.description && <p>{board.description}</p>}
          </div>
          {data.canPost ? <Link href={`/forum/new?board=${board.slug}`} className="btn btn-primary">{fa ? '+ موضوع جدید' : '+ New thread'}</Link>
            : !actor.userId && data.readable && !board.locked ? <Link href={`/login?next=/forum/c/${board.slug}`} className="btn btn-ghost">{fa ? 'برای ایجاد موضوع وارد شوید' : 'Log in to post'}</Link> : null}
        </header>
        {!data.readable && <VipGate fa={fa} loggedIn={!!actor.userId} next={`/forum/c/${board.slug}`} title={fa ? 'این انجمن مخصوص اعضای ویژه است' : 'This board is for VIP members'} />}
        {data.readable && !data.threads.length && <EmptyState fa={fa} title={fa ? 'هنوز موضوعی نیست' : 'No threads yet'} text={fa ? 'اولین موضوع را شما شروع کنید.' : 'Be the first to start one.'} />}
        {data.threads.length > 0 && <ol className="fr-threads">{data.threads.map((thread) => (
          <li key={thread.id} className={thread.pinned ? 'is-pinned' : ''}>
            <Avatar author={thread.author} />
            <span className="fr-thread-body">
              <Link href={`/forum/t/${thread.id}`}>{thread.pinned && <em className="fr-tag is-pin">{fa ? 'سنجاق' : 'Pinned'}</em>}{thread.locked && <em className="fr-tag">{fa ? 'بسته' : 'Locked'}</em>}{thread.title}</Link>
              <small>{thread.author.name}{thread.author.staff && <em className="fr-staff">{fa ? 'تیم' : 'Staff'}</em>} · <TimeAgo date={thread.createdAt} fa={fa} /></small>
            </span>
            <span className="fr-thread-meta"><span><b>{n(thread.replyCount)}</b>{fa ? 'پاسخ' : 'replies'}</span><span><b>{n(thread.views)}</b>{fa ? 'بازدید' : 'views'}</span></span>
            <span className="fr-thread-last"><TimeAgo date={thread.lastPostAt} fa={fa} /></span>
          </li>
        ))}</ol>}
        <Pager page={data.page} pages={data.pages} href={(page) => `/forum/c/${board.slug}?page=${page}`} fa={fa} />
      </div>
    </MediaShell>
  )
}
