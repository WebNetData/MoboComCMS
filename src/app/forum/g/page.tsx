import type { Metadata } from 'next'
import Link from '@/components/AppLink'
import { requireModule } from '@/extensions/server/modules'
import { getForumViewer } from '@/modules/forum/server/forum'
import { listGroups } from '@/modules/forum/server/people'
import ForumShell from '@/components/forum/ForumShell'
import { num } from '@/components/forum/shared'
import { toPublicPath } from '@/platform/routing/aliases'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'گروه‌های تالار', alternates: { canonical: toPublicPath('/forum/g') } }
const JOIN: Record<string, string> = { OPEN: 'عضویت آزاد', REQUEST: 'با درخواست', CLOSED: 'با دعوت' }

export default async function GroupsPage() {
  await requireModule('forum')
  const viewer = await getForumViewer()
  const groups = await listGroups(viewer)
  return (
    <ForumShell viewer={viewer} active="groups">
      <header className="fx-page-head"><h1>گروه‌ها</h1><p className="fx-muted">به گروه‌های هم‌علاقه بپیوندید؛ برخی گروه‌ها به دسته‌های ویژه دسترسی می‌دهند.</p></header>
      <div className="fx-groups">
        {groups.map((group) => (
          <Link key={group.id} href={`/forum/g/${group.slug}`} className="fx-group-card" style={{ ['--g' as string]: group.color }}>
            <span className="fx-group-icon" aria-hidden="true">{group.icon || '👥'}</span>
            <span className="fx-group-body">
              <b>{group.name}{group.membership?.status === 'ACTIVE' && <small className="fx-chip">عضو هستید</small>}{group.membership?.status === 'PENDING' && <small className="fx-chip">در انتظار</small>}</b>
              {group.description && <small>{group.description}</small>}
              <em>{num(group.memberCount)} عضو · {group.automatic ? 'خودکار' : JOIN[group.joinMode]}</em>
            </span>
          </Link>
        ))}
      </div>
      {!groups.length && <div className="fx-empty"><p>هنوز گروهی ساخته نشده است.</p></div>}
    </ForumShell>
  )
}
