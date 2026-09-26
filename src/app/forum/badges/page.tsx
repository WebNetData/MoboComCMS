import type { Metadata } from 'next'
import Link from 'next/link'
import { requireModule } from '@/extensions/server/modules'
import { listBadges } from '@/modules/forum/server/people'
import { getForumViewer } from '@/modules/forum/server/forum'
import ForumShell from '@/components/forum/ForumShell'
import { num } from '@/components/forum/shared'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'نشان‌های تالار', alternates: { canonical: '/forum/badges' } }
const TIERS = [{ key: 'GOLD', label: 'طلایی' }, { key: 'SILVER', label: 'نقره‌ای' }, { key: 'BRONZE', label: 'برنزی' }]

export default async function BadgesPage() {
  await requireModule('forum')
  const viewer = await getForumViewer()
  const { badges, owned } = await listBadges(viewer)
  return (
    <ForumShell viewer={viewer} active="badges">
      <header className="fx-page-head"><h1>نشان‌ها</h1><p className="fx-muted">با مشارکت در تالار نشان بگیرید؛ نشان‌ها روی پروفایل شما دیده می‌شوند.</p></header>
      {TIERS.map((tier) => {
        const list = badges.filter((badge) => badge.tier === tier.key)
        if (!list.length) return null
        return (
          <section key={tier.key}>
            <h2 className="fx-section-title">نشان‌های {tier.label}</h2>
            <div className="fx-badge-grid">{list.map((badge) => (
              <Link key={badge.id} href={`/forum/badges/${badge.slug}`} className={`fx-badge-card is-${badge.tier.toLowerCase()}${owned.has(badge.id) ? ' is-owned' : ''}`}>
                <span aria-hidden="true">{badge.icon}</span><b>{badge.name}</b><small>{badge.description}</small>
                <em>{num(badge.grantCount)} نفر{owned.has(badge.id) ? ' · شما دارید ✓' : ''}{!badge.rule ? ' · اهدایی' : ''}</em>
              </Link>
            ))}</div>
          </section>
        )
      })}
    </ForumShell>
  )
}
