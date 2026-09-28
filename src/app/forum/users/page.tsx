import type { Metadata } from 'next'
import Link from '@/components/AppLink'
import { requireModule } from '@/extensions/server/modules'
import { getForumViewer } from '@/modules/forum/server/forum'
import { userDirectory } from '@/modules/forum/server/people'
import ForumShell from '@/components/forum/ForumShell'
import { Avatar, Pager, TimeAgo, UserName, num } from '@/components/forum/shared'
import { toPublicPath } from '@/platform/routing/aliases'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'کاربران تالار', alternates: { canonical: toPublicPath('/forum/users') } }
const COLUMNS: { key: string; label: string }[] = [{ key: 'likesReceived', label: 'پسند گرفته' }, { key: 'postCount', label: 'پیام' }, { key: 'topicCount', label: 'موضوع' }, { key: 'solvedCount', label: 'راه‌حل' }, { key: 'daysVisited', label: 'روز بازدید' }]

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ sort?: string; q?: string; page?: string }> }) {
  await requireModule('forum')
  const viewer = await getForumViewer()
  const params = await searchParams
  const data = await userDirectory({ sort: params.sort, q: params.q, page: Number(params.page) || 1 })
  const href = (patch: Record<string, string | undefined>) => {
    const query = new URLSearchParams(Object.entries({ sort: data.sort === 'likesReceived' ? undefined : data.sort, q: data.q || undefined, ...patch }).filter((e): e is [string, string] => !!e[1]))
    return `/forum/users${query.size ? `?${query}` : ''}`
  }
  return (
    <ForumShell viewer={viewer} active="users">
      <header className="fx-page-head fx-head-row">
        <div><h1>کاربران</h1><p className="fx-muted">{num(data.total)} عضو</p></div>
        <form className="fx-inline-search" role="search"><input name="q" defaultValue={data.q} className="input" placeholder="نام کاربری…" dir="ltr" aria-label="جست‌وجوی کاربر" /><button className="btn btn-ghost btn-sm">جست‌وجو</button></form>
      </header>
      <div className="fx-table-wrap">
        <table className="fx-directory">
          <thead><tr><th scope="col">کاربر</th>{COLUMNS.map((col) => <th key={col.key} scope="col" className="fx-col-num"><Link href={href({ sort: col.key === 'likesReceived' ? undefined : col.key, page: undefined })} className={data.sort === col.key ? 'is-active' : ''} aria-sort={data.sort === col.key ? 'descending' : undefined}>{col.label}{data.sort === col.key ? ' ▾' : ''}</Link></th>)}<th scope="col"><Link href={href({ sort: 'recent', page: undefined })} className={data.sort === 'recent' ? 'is-active' : ''}>آخرین حضور</Link></th></tr></thead>
          <tbody>{data.users.map((row) => (
            <tr key={row.author.id}>
              <td><span className="fx-dir-user"><Avatar author={row.author} size={36} /><span><UserName author={row.author} /><bdi className="fx-handle" dir="ltr">@{row.author.username}</bdi></span></span></td>
              <td className="fx-col-num">{num(row.likesReceived)}</td><td className="fx-col-num">{num(row.postCount)}</td><td className="fx-col-num">{num(row.topicCount)}</td><td className="fx-col-num">{num(row.solvedCount)}</td><td className="fx-col-num">{num(row.daysVisited)}</td>
              <td className="fx-muted">{row.lastSeenAt ? <TimeAgo date={row.lastSeenAt} /> : '—'}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {!data.users.length && <div className="fx-empty"><p>کاربری پیدا نشد.</p></div>}
      <Pager page={data.page} pages={data.pages} href={(n) => href({ page: n > 1 ? String(n) : undefined })} />
    </ForumShell>
  )
}
