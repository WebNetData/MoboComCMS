import type { Metadata } from 'next'
import Link from '@/components/AppLink'
import { requireModule } from '@/extensions/server/modules'
import { getForumViewer } from '@/modules/forum/server/forum'
import { forumTeam, type TeamMember } from '@/modules/forum/server/board'
import { FORUM_RANK_LABELS, type ForumRank } from '@/modules/forum/domain/community'
import ForumShell from '@/components/forum/ForumShell'
import { Avatar, num } from '@/components/forum/shared'
import { toPublicPath } from '@/platform/routing/aliases'
import { profileAddress } from '@/modules/identity/domain/profile-address'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'تیم تالار', description: 'مدیران، معاونان و مدیران انجمن‌های تالار گفتمان', alternates: { canonical: toPublicPath('/forum/staff') } }

const ABOUT: Record<ForumRank, string> = {
  admin: 'تالار را اداره می‌کنند: انجمن‌ها، گروه‌ها و قوانین.',
  deputy: 'در همهٔ انجمن‌ها ناظرند و به گزارش‌ها رسیدگی می‌کنند.',
  moderator: 'هر کدام مدیر یک یا چند انجمن هستند.',
}

function Rank({ rank, people }: { rank: ForumRank; people: TeamMember[] }) {
  if (!people.length) return null
  return <section className={`ft-rank is-${rank}`} aria-labelledby={`ft-${rank}`}>
    <header><h2 id={`ft-${rank}`}>{FORUM_RANK_LABELS[rank]}<em>{num(people.length)}</em></h2><p>{ABOUT[rank]}</p></header>
    <ul className="ft-grid">{people.map((person) => <li key={person.id} className="ft-card">
      <Link href={profileAddress(person.username)} className="ft-face" aria-label={`پروفایل ${person.name}`}><Avatar author={person} size={64} /></Link>
      <div className="ft-id">
        <Link href={profileAddress(person.username)} className="ft-name">{person.name}</Link>
        <bdi className="fx-handle" dir="ltr">@{person.username}</bdi>
        <span className={`tp-rank is-${rank}`}>{FORUM_RANK_LABELS[rank]}</span>
        {person.forums.length > 0 && <span className="ft-forums">{person.forums.map((forum) => <Link key={forum.slug} href={`/forum/c/${forum.slug}`} className="fx-cat"><i style={{ background: forum.color }} />{forum.title}</Link>)}</span>}
      </div>
      <dl className="ft-stats"><div><dd>{num(person.posts)}</dd><dt>پیام</dt></div><div><dd>{num(person.reputation)}</dd><dt>اعتبار</dt></div></dl>
    </li>)}</ul>
  </section>
}

export default async function ForumStaffPage() {
  await requireModule('forum')
  const viewer = await getForumViewer()
  const team = await forumTeam(viewer)
  const empty = !team.admins.length && !team.deputies.length && !team.moderators.length
  return <ForumShell viewer={viewer} active="staff" wide>
    <header className="fm-head"><div><h1>تیم تالار</h1><p className="fx-muted">کسانی که تالار را اداره و بر گفت‌وگوها نظارت می‌کنند. برای گزارش یک پیام از دکمهٔ ⚑ زیر همان پیام استفاده کنید.</p></div></header>
    <Rank rank="admin" people={team.admins} />
    <Rank rank="deputy" people={team.deputies} />
    <Rank rank="moderator" people={team.moderators} />
    {empty && <div className="fx-empty"><p>هنوز کسی در تیم تالار معرفی نشده است.</p></div>}
  </ForumShell>
}
