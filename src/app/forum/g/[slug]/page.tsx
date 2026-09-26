import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireModule } from '@/extensions/server/modules'
import { getForumViewer } from '@/modules/forum/server/forum'
import { getGroup } from '@/modules/forum/server/people'
import ForumShell from '@/components/forum/ForumShell'
import GroupActions from '@/components/forum/GroupActions'
import { Avatar, Pager, TimeAgo, UserName, num } from '@/components/forum/shared'

export const dynamic = 'force-dynamic'
type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ page?: string }> }
const LEVEL: Record<string, string> = { SEE: 'مشاهده', REPLY: 'پاسخ', CREATE: 'ایجاد موضوع' }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await getGroup((await params).slug, await getForumViewer())
  return data ? { title: `${data.group.name} — گروه‌های تالار`, description: data.group.description.slice(0, 160) || undefined } : { title: 'گروه پیدا نشد' }
}

export default async function GroupPage({ params, searchParams }: Props) {
  await requireModule('forum')
  const [{ slug }, { page }] = await Promise.all([params, searchParams])
  const viewer = await getForumViewer()
  const data = await getGroup(slug, viewer, Number(page) || 1)
  if (!data) notFound()
  const { group } = data
  return (
    <ForumShell viewer={viewer} active="groups">
      <header className="fx-group-head" style={{ ['--g' as string]: group.color }}>
        <span className="fx-group-icon is-large" aria-hidden="true">{group.icon || '👥'}</span>
        <div>
          <h1>{group.name}</h1>
          <p className="fx-muted">{num(group.memberCount)} عضو{group.title ? ` · عنوان اعضا: «${group.title}»` : ''}</p>
        </div>
        {!group.automatic && <GroupActions slug={group.slug} joinMode={group.joinMode} status={data.membership?.status || 'NONE'} owner={!!data.membership?.owner} signedIn={!!viewer.userId} manager={data.manager} />}
      </header>
      {group.description && <div className="fx-cooked fx-group-desc" dangerouslySetInnerHTML={{ __html: group.descriptionHtml }} />}
      {data.categories.length > 0 && <p className="fx-group-access">دسترسی ویژه: {data.categories.map((c) => <Link key={c.id} href={`/forum/c/${c.slug}`} className="fx-cat"><i style={{ background: c.color }} />{c.title} <small>({LEVEL[c.level]})</small></Link>)}</p>}
      {data.manager && data.requests.length > 0 && (
        <section className="fx-requests">
          <h2>درخواست‌های عضویت</h2>
          <ul>{data.requests.map((user) => <li key={user.id}><Avatar author={user} size={32} /><UserName author={user} showHandle /><small className="fx-muted"><TimeAgo date={user.since} /></small><GroupActions slug={group.slug} joinMode={group.joinMode} status="MANAGE" owner={false} signedIn manager target={user.username} mode="request" /></li>)}</ul>
        </section>
      )}
      <section>
        <h2 className="fx-section-title">اعضا</h2>
        <div className="fx-members">{data.members.map((user) => (
          <div key={user.id} className="fx-member">
            <Avatar author={user} size={48} />
            <UserName author={user} />
            <bdi className="fx-handle" dir="ltr">@{user.username}</bdi>
            {user.owner && <small className="fx-chip">مدیر گروه</small>}
            {data.manager && !group.automatic && <GroupActions slug={group.slug} joinMode={group.joinMode} status="MANAGE" owner={user.owner} signedIn manager target={user.username} mode="member" />}
          </div>
        ))}</div>
        {!data.members.length && <p className="fx-muted">هنوز عضوی ندارد.</p>}
        <Pager page={data.page} pages={data.pages} href={(n) => `/forum/g/${group.slug}${n > 1 ? `?page=${n}` : ''}`} />
      </section>
      {data.manager && !group.automatic && <GroupActions slug={group.slug} joinMode={group.joinMode} status="MANAGE" owner={false} signedIn manager mode="add" />}
    </ForumShell>
  )
}
