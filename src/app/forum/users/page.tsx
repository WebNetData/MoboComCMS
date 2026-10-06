import type { Metadata } from 'next'
import Link from '@/components/AppLink'
import { requireModule } from '@/extensions/server/modules'
import { getForumViewer } from '@/modules/forum/server/forum'
import { userDirectory, type DirectorySort } from '@/modules/forum/server/people'
import { TRUST_NAMES } from '@/modules/forum/domain/community'
import ForumShell from '@/components/forum/ForumShell'
import { Avatar, Pager, TimeAgo, UserName, num } from '@/components/forum/shared'
import { toPublicPath } from '@/platform/routing/aliases'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'اعضای جامعه', description: 'اعضای تالار، گروه‌هایشان و فعال‌ترین‌ها', alternates: { canonical: toPublicPath('/forum/users') } }

const SORTS: { key: DirectorySort; label: string; unit: string }[] = [
  { key: 'likesReceived', label: 'بیشترین اعتبار', unit: 'اعتبار' }, { key: 'postCount', label: 'بیشترین پیام', unit: 'پیام' }, { key: 'topicCount', label: 'بیشترین موضوع', unit: 'موضوع' },
  { key: 'solvedCount', label: 'بیشترین راه‌حل', unit: 'راه‌حل' }, { key: 'daysVisited', label: 'پرحضورترین', unit: 'روز بازدید' }, { key: 'recent', label: 'آخرین حضور', unit: '' },
]
const MEDALS = ['نفر اول', 'نفر دوم', 'نفر سوم']

type Row = Awaited<ReturnType<typeof userDirectory>>['users'][number]
/** What stands under a member's name: their own title, else their group, else their trust rank. */
const roleOf = (row: Row) => row.author.staff ? 'تیم موبوکام' : row.author.title || row.author.flair?.name || TRUST_NAMES[row.author.trustLevel] || TRUST_NAMES[0]

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ sort?: string; q?: string; page?: string; group?: string }> }) {
  await requireModule('forum')
  const viewer = await getForumViewer()
  const params = await searchParams
  const data = await userDirectory({ sort: params.sort, q: params.q, group: params.group, page: Number(params.page) || 1 }, viewer)
  const href = (patch: Record<string, string | undefined>) => {
    const query = new URLSearchParams(Object.entries({ sort: data.sort === 'likesReceived' ? undefined : data.sort, q: data.q || undefined, group: data.group?.slug, ...patch }).filter((e): e is [string, string] => !!e[1]))
    return `/forum/users${query.size ? `?${query}` : ''}`
  }
  const sort = SORTS.find((item) => item.key === data.sort) || SORTS[0]
  const valueOf = (row: Row) => data.sort === 'recent' ? 0 : row[data.sort as Exclude<DirectorySort, 'recent'>]
  // The first three stand on a podium while the list is a ranking: first page, no search, and a real lead.
  const podium = data.page === 1 && !data.q && data.sort !== 'recent' && data.users.length >= 3 && valueOf(data.users[2]) > 0 ? data.users.slice(0, 3) : []
  const rest = data.users.slice(podium.length)
  const rankFrom = (data.page - 1) * 30 + podium.length

  return (
    <ForumShell viewer={viewer} active="users" wide>
      <header className="fm-head">
        <div><h1>اعضای جامعه</h1><p className="fx-muted">{data.group ? <>{num(data.total)} عضو در گروه «{data.group.name}»</> : <>{num(data.total)} عضو فعال</>}</p></div>
        <form className="fm-search" role="search" action="/forum/users">
          {data.sort !== 'likesReceived' && <input type="hidden" name="sort" value={data.sort} />}
          {data.group && <input type="hidden" name="group" value={data.group.slug} />}
          <input name="q" defaultValue={data.q} className="input" placeholder="نام کاربری…" dir="ltr" aria-label="جست‌وجوی عضو" /><button className="btn btn-primary btn-sm">جست‌وجو</button>
        </form>
      </header>

      <nav className="fx-strip" aria-label="ترتیب">{SORTS.map((item) => <Link key={item.key} href={href({ sort: item.key === 'likesReceived' ? undefined : item.key, page: undefined })} className={data.sort === item.key ? 'is-active' : ''} aria-current={data.sort === item.key ? 'true' : undefined}>{item.label}</Link>)}</nav>
      {data.groups.length > 0 && <nav className="fx-strip fm-groups" aria-label="گروه کاربری">
        <Link href={href({ group: undefined, page: undefined })} className={data.group ? '' : 'is-active'}>همهٔ اعضا</Link>
        {data.groups.map((group) => <Link key={group.slug} href={href({ group: group.slug, page: undefined })} className={data.group?.slug === group.slug ? 'is-active' : ''} style={{ ['--g' as string]: group.color }}><i aria-hidden="true" />{group.name}<em>{num(group.memberCount)}</em></Link>)}
      </nav>}

      {podium.length > 0 && <ol className="fm-podium" aria-label={`سه نفر نخست در ${sort.unit}`}>{podium.map((row, index) => (
        <li key={row.author.id} className={`fm-step is-${index + 1}`} style={{ ['--c' as string]: row.author.avatarColor || 'var(--md-accent)' }}>
          <span className="fm-medal" aria-label={MEDALS[index]}>{num(index + 1)}</span>
          <Link href={`/forum/u/${row.author.username}`} className="fm-face" aria-label={`پروفایل ${row.author.name}`}><Avatar author={row.author} size={index === 0 ? 92 : 76} /></Link>
          <UserName author={row.author} />
          <small className="fm-role">{roleOf(row)}</small>
          <p className="fm-score"><b>{num(valueOf(row))}</b><span>{sort.unit}</span></p>
        </li>
      ))}</ol>}

      <ul className="fm-grid">{rest.map((row, index) => (
        <li key={row.author.id} className="fm-card" style={{ ['--c' as string]: row.author.avatarColor || 'var(--md-accent)' }}>
          <span className="fm-cover" aria-hidden="true" />
          {data.sort !== 'recent' && !data.q && <span className="fm-rank" title="رتبه در این فهرست">{num(rankFrom + index + 1)}</span>}
          <Link href={`/forum/u/${row.author.username}`} className="fm-face" aria-label={`پروفایل ${row.author.name}`}><Avatar author={row.author} size={68} /></Link>
          <UserName author={row.author} />
          <bdi className="fx-handle" dir="ltr">@{row.author.username}</bdi>
          <small className="fm-role">{roleOf(row)}</small>
          <dl className="fm-stats">
            <div className={data.sort === 'postCount' ? 'is-lead' : ''}><dt>پیام</dt><dd>{num(row.postCount)}</dd></div>
            <div className={data.sort === 'likesReceived' ? 'is-lead' : ''}><dt>اعتبار</dt><dd>{num(row.likesReceived)}</dd></div>
            {data.sort === 'topicCount' ? <div className="is-lead"><dt>موضوع</dt><dd>{num(row.topicCount)}</dd></div>
              : data.sort === 'daysVisited' ? <div className="is-lead"><dt>روز بازدید</dt><dd>{num(row.daysVisited)}</dd></div>
              : <div className={data.sort === 'solvedCount' ? 'is-lead' : ''}><dt>راه‌حل</dt><dd>{num(row.solvedCount)}</dd></div>}
          </dl>
          <p className="fm-seen">{row.lastSeenAt ? <>آخرین حضور <TimeAgo date={row.lastSeenAt} /></> : 'هنوز سر نزده'}</p>
        </li>
      ))}</ul>
      {!data.users.length && <div className="fx-empty"><p>{data.q ? 'عضوی با این نام پیدا نشد.' : 'هنوز عضوی برای نمایش نیست.'}</p>{(data.q || data.group) && <Link href="/forum/users" className="btn btn-ghost btn-sm">همهٔ اعضا</Link>}</div>}
      <Pager page={data.page} pages={data.pages} href={(n) => href({ page: n > 1 ? String(n) : undefined })} />
    </ForumShell>
  )
}
