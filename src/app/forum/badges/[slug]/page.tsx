import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireModule } from '@/extensions/server/modules'
import { getForumViewer } from '@/modules/forum/server/forum'
import { findBadge, getBadge } from '@/modules/forum/server/people'
import ForumShell from '@/components/forum/ForumShell'
import { Avatar, TimeAgo, UserName, num } from '@/components/forum/shared'

export const dynamic = 'force-dynamic'
type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const badge = await findBadge((await params).slug)
  return badge ? { title: `نشان ${badge.name} — تالار گفتمان`, description: badge.description } : { title: 'نشان پیدا نشد' }
}

export default async function BadgePage({ params }: Props) {
  await requireModule('forum')
  const viewer = await getForumViewer()
  const data = await getBadge((await params).slug)
  if (!data) notFound()
  const { badge, holders } = data
  return (
    <ForumShell viewer={viewer} active="badges">
      <header className={`fx-badge-hero is-${badge.tier.toLowerCase()}`}>
        <span aria-hidden="true">{badge.icon}</span>
        <div><h1>{badge.name}</h1><p>{badge.description}</p><p className="fx-muted">{num(badge.grantCount)} نفر این نشان را گرفته‌اند{badge.rule ? '' : ' · این نشان را تیم تالار اهدا می‌کند'}</p></div>
      </header>
      <div className="fx-members">{holders.map((row) => (
        <div key={row.id} className="fx-member"><Avatar author={row.author} size={48} /><UserName author={row.author} /><small className="fx-muted"><TimeAgo date={row.grantedAt} /></small></div>
      ))}</div>
      {!holders.length && <div className="fx-empty"><p>هنوز کسی این نشان را نگرفته است. شما اولین نفر باشید!</p></div>}
    </ForumShell>
  )
}
