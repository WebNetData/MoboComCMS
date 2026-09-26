import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireModule } from '@/extensions/server/modules'
import { getForumActor, listBoards } from '@/modules/forum/server/forum'
import { canStartThread } from '@/modules/forum/domain/forum'
import { getServerLocale } from '@/i18n/server'
import MediaShell from '@/components/media/MediaShell'
import { forumNav } from '@/components/media/nav'
import { EmptyState } from '@/components/media/MediaCards'
import NewThreadForm from '@/components/forum/NewThreadForm'

export const dynamic = 'force-dynamic'
type Props = { searchParams: Promise<{ board?: string }> }

export const metadata: Metadata = { title: 'موضوع جدید', robots: { index: false } }

export default async function NewThreadPage({ searchParams }: Props) {
  await requireModule('forum')
  const [query, locale, actor] = await Promise.all([searchParams, getServerLocale(), getForumActor()])
  const fa = locale === 'fa'
  if (!actor.userId) redirect(`/login?next=${encodeURIComponent(`/forum/new${query.board ? `?board=${query.board}` : ''}`)}`)
  const boards = (await listBoards(actor)).filter((board) => canStartThread(board, actor))
  const initial = boards.find((board) => board.slug === query.board)?.id
  return (
    <MediaShell section="forum" active="new" nav={forumNav(fa)}>
      <div className="container md-body fr-new-page">
        <header className="fr-board-head"><div><nav className="cn-crumbs"><Link href="/forum">{fa ? 'تالار گفتمان' : 'Forum'}</Link></nav><h1>{fa ? 'ایجاد موضوع جدید' : 'Start a thread'}</h1></div></header>
        {boards.length ? <NewThreadForm boards={boards.map(({ id, title, slug }) => ({ id, title, slug }))} initial={initial} fa={fa} /> : <EmptyState fa={fa} title={fa ? 'انجمنی برای ارسال در دسترس نیست' : 'No board is open for posting'} />}
      </div>
    </MediaShell>
  )
}
