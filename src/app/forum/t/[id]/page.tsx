import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireModule } from '@/extensions/server/modules'
import { getForumActor, getThread, listBoards } from '@/modules/forum/server/forum'
import { renderPostText } from '@/modules/forum/domain/forum'
import { getServerLocale } from '@/i18n/server'
import MediaShell from '@/components/media/MediaShell'
import { forumNav } from '@/components/media/nav'
import { VipGate } from '@/components/media/MediaCards'
import { Avatar, Pager, TimeAgo } from '@/components/forum/shared'
import ReplyForm from '@/components/forum/ReplyForm'
import PostActions from '@/components/forum/PostActions'
import ThreadModBar from '@/components/forum/ThreadModBar'

export const dynamic = 'force-dynamic'
type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ id }, actor] = await Promise.all([params, getForumActor()])
  const data = await getThread(Number(id), 1, actor)
  if (!data) return {}
  return { title: data.thread.title, description: data.description || undefined, alternates: { canonical: `/forum/t/${data.thread.id}` }, ...(data.board.access === 'MEMBERS' || data.thread.status !== 'VISIBLE' ? { robots: { index: false } } : {}) }
}

export default async function ForumThreadPage({ params, searchParams }: Props) {
  await requireModule('forum')
  const [{ id }, query, locale, actor] = await Promise.all([params, searchParams, getServerLocale(), getForumActor()])
  const data = await getThread(Number(id), Number(query.page) || 1, actor)
  if (!data) notFound()
  const fa = locale === 'fa'
  const { thread, board } = data
  const boards = data.moderator ? (await listBoards(actor)).map(({ id, slug, title }) => ({ id, slug, title })) : []
  const jsonLd = data.readable && data.posts[0]?.first ? { '@context': 'https://schema.org', '@type': 'DiscussionForumPosting', headline: thread.title, datePublished: new Date(thread.createdAt).toISOString(), author: { '@type': 'Person', name: thread.author.name }, text: data.description, interactionStatistic: { '@type': 'InteractionCounter', interactionType: 'https://schema.org/CommentAction', userInteractionCount: thread.replyCount } } : null
  return (
    <MediaShell section="forum" nav={forumNav(fa)}>
      {jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />}
      <div className="container md-body fr-thread">
        <header className="fr-thread-head">
          <nav className="cn-crumbs"><Link href="/forum">{fa ? 'تالار گفتمان' : 'Forum'}</Link> / <Link href={`/forum/c/${board.slug}`}>{board.title}</Link></nav>
          <h1>{thread.pinned && <em className="fr-tag is-pin">{fa ? 'سنجاق' : 'Pinned'}</em>}{thread.locked && <em className="fr-tag">{fa ? 'بسته' : 'Locked'}</em>}{thread.status !== 'VISIBLE' && <em className="fr-tag is-hidden">{fa ? 'پنهان' : 'Hidden'}</em>}{thread.title}</h1>
          <small className="muted">{thread.author.name} · <TimeAgo date={thread.createdAt} fa={fa} /> · {thread.views.toLocaleString(fa ? 'fa-IR' : 'en-US')} {fa ? 'بازدید' : 'views'}</small>
        </header>
        {data.moderator && <ThreadModBar thread={{ id: thread.id, pinned: thread.pinned, locked: thread.locked, status: thread.status, boardSlug: board.slug }} boards={boards} fa={fa} />}
        {!data.readable && <VipGate fa={fa} loggedIn={!!actor.userId} next={`/forum/t/${thread.id}`} title={fa ? 'این گفت‌وگو مخصوص اعضای ویژه است' : 'This conversation is for VIP members'} />}
        <ol className="fr-posts">{data.posts.map((post) => (
          <li key={post.id} id={`post-${post.id}`} className={`fr-post${post.status !== 'VISIBLE' ? ' is-hidden' : ''}${post.first ? ' is-first' : ''}`}>
            <aside className="fr-post-author"><Avatar author={post.author} size={48} /><b>{post.author.name}</b>{post.author.staff && <em className="fr-staff">{fa ? 'تیم موبوکام' : 'Staff'}</em>}<small>{fa ? 'عضویت:' : 'Joined'} {new Date(post.author.joinedAt).toLocaleDateString(fa ? 'fa-IR' : 'en-US', { year: 'numeric', month: 'short' })}</small></aside>
            <div className="fr-post-body">
              <header><a href={`#post-${post.id}`}><TimeAgo date={post.createdAt} fa={fa} /></a>{post.editedAt && <small className="muted">{fa ? '· ویرایش‌شده' : '· edited'}</small>}{post.status !== 'VISIBLE' && <em className="fr-tag is-hidden">{fa ? 'پنهان' : 'Hidden'}</em>}</header>
              <div className="fr-post-text" dangerouslySetInnerHTML={{ __html: renderPostText(post.content) }} />
              <PostActions post={{ id: post.id, content: post.content, status: post.status, first: post.first, editable: post.editable, author: post.author.name }} fa={fa} canQuote={data.canReply} moderator={data.moderator} />
            </div>
          </li>
        ))}</ol>
        <Pager page={data.page} pages={data.pages} href={(page) => `/forum/t/${thread.id}?page=${page}`} fa={fa} />
        {data.canReply ? <ReplyForm threadId={thread.id} fa={fa} />
          : data.readable && <div className="card fr-closed">{!actor.userId ? <><span>{fa ? 'برای پاسخ‌دادن وارد حساب خود شوید.' : 'Log in to reply.'}</span><Link href={`/login?next=/forum/t/${thread.id}`} className="btn btn-primary btn-sm">{fa ? 'ورود' : 'Log in'}</Link></> : <span>{fa ? 'این موضوع بسته شده و پاسخ جدید نمی‌پذیرد.' : 'This thread is locked.'}</span>}</div>}
      </div>
    </MediaShell>
  )
}
