import type { Metadata } from 'next'
import Link from '@/components/AppLink'
import { requireModule } from '@/extensions/server/modules'
import { getForumViewer } from '@/modules/forum/server/forum'
import { leaderboard, type LeaderPeriod, type LeaderRow } from '@/modules/forum/server/leaderboard'
import { FORUM_RANK_LABELS } from '@/modules/forum/domain/community'
import ForumShell from '@/components/forum/ForumShell'
import { Avatar, UserName, num } from '@/components/forum/shared'
import { toPublicPath } from '@/platform/routing/aliases'
import { profileAddress } from '@/modules/identity/domain/profile-address'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'جدول برترین‌ها', description: 'اعضایی که بیشترین اعتبار را گرفته‌اند، پرکارترین‌ها و محبوب‌ترین پیام‌ها', alternates: { canonical: toPublicPath('/forum/leaderboard') } }

const PERIODS: [LeaderPeriod, string][] = [['today', 'امروز'], ['week', 'این هفته'], ['month', '۳۰ روز اخیر'], ['all', 'همیشه']]
const SCOPE: Record<LeaderPeriod, string> = { today: 'امروز', week: 'در هفت روز اخیر', month: 'در ۳۰ روز اخیر', all: 'از آغاز' }

function Board({ id, title, unit, rows, empty }: { id: string; title: string; unit: string; rows: LeaderRow[]; empty: string }) {
  const [first, ...rest] = rows
  return <section className="fl-board" aria-labelledby={id}>
    <h2 id={id}>{title}</h2>
    {!first ? <p className="fx-muted fl-empty">{empty}</p> : <>
      <div className="fl-first">
        <span className="fl-crown" aria-hidden="true">۱</span>
        <Link href={profileAddress(first.author.username)} className="fl-first-face" aria-label={`پروفایل ${first.author.name}`}><Avatar author={first.author} size={72} /></Link>
        <div><UserName author={first.author} />{first.author.rank && <span className={`tp-rank is-${first.author.rank}`}>{FORUM_RANK_LABELS[first.author.rank]}</span>}</div>
        <p><b>{num(first.points)}</b><span>{unit}</span></p>
      </div>
      {rest.length > 0 && <ol className="fl-list" start={2}>{rest.map((row, index) => <li key={row.author.id}>
        <span className={`fl-place${index < 2 ? ` is-${index + 2}` : ''}`}>{num(index + 2)}</span>
        <Avatar author={row.author} size={36} />
        <UserName author={row.author} />
        <span className="fl-points"><b>{num(row.points)}</b>{unit}</span>
      </li>)}</ol>}
    </>}
  </section>
}

export default async function LeaderboardPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  await requireModule('forum')
  const [query, viewer] = await Promise.all([searchParams, getForumViewer()])
  const data = await leaderboard(viewer, query)
  const day = (at: Date) => {
    const parts = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Tehran' }).formatToParts(at)
    const part = (type: string) => parts.find((item) => item.type === type)?.value || ''
    return `${part('weekday')} ${part('day')} ${part('month')}`
  }
  return <ForumShell viewer={viewer} active="leaderboard" wide>
    <header className="fm-head">
      <div><h1>جدول برترین‌ها</h1><p className="fx-muted">هر واکنشی که دیگران به پیام‌های یک عضو می‌دهند یک امتیاز اعتبار است. {SCOPE[data.period]}.</p></div>
      {data.mine && <p className="fl-mine">{data.mine.place ? <>جایگاه شما: <b>{num(data.mine.place)}</b> · </> : null}<b>{num(data.mine.points)}</b> اعتبار {SCOPE[data.period]}</p>}
    </header>
    <nav className="fx-strip" aria-label="بازهٔ زمانی">{PERIODS.map(([key, label]) => <Link key={key} href={key === 'week' ? '/forum/leaderboard' : `/forum/leaderboard?period=${key}`} className={data.period === key ? 'is-active' : ''} aria-current={data.period === key ? 'page' : undefined}>{label}</Link>)}</nav>

    <div className="fl-boards">
      <Board id="fl-reputation" title="بیشترین اعتبار" unit="اعتبار" rows={data.reputation} empty="در این بازه هنوز کسی اعتباری نگرفته است." />
      <Board id="fl-writers" title="پرکارترین‌ها" unit="پیام" rows={data.writers} empty="در این بازه پیامی نوشته نشده است." />
    </div>

    {data.posts.length > 0 && <section className="fp-card fl-posts" aria-labelledby="fl-posts-title">
      <h2 id="fl-posts-title">محبوب‌ترین پیام‌ها</h2>
      <ol className="fp-list">{data.posts.map((post) => <li key={post.id}><Link href={`/forum/t/${post.topic.id}?post=${post.number}`}>
        <b>{post.topic.title}</b><span>{post.excerpt}</span><small>{post.author.name} · {num(post.points)} واکنش</small>
      </Link></li>)}</ol>
    </section>}

    {data.past.length > 0 && <section className="fl-past" aria-labelledby="fl-past-title">
      <h2 id="fl-past-title">برندگان روزهای گذشته</h2>
      <ul>{data.past.map((row) => <li key={row.day}>
        <small>{day(row.at)}</small>
        <Link href={profileAddress(row.author.username)} className="fl-past-face" aria-label={`پروفایل ${row.author.name}`}><Avatar author={row.author} size={52} /></Link>
        <UserName author={row.author} />
        <span>{num(row.points)} اعتبار</span>
      </li>)}</ul>
    </section>}
  </ForumShell>
}
