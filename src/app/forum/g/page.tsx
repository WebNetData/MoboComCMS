import type { Metadata } from 'next'
import Link from '@/components/AppLink'
import { requireModule } from '@/extensions/server/modules'
import { getForumViewer } from '@/modules/forum/server/forum'
import { listGroups } from '@/modules/forum/server/people'
import ForumShell from '@/components/forum/ForumShell'
import { Avatar, num } from '@/components/forum/shared'
import { toPublicPath } from '@/platform/routing/aliases'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'گروه‌های کاربری', description: 'گروه‌های جامعه، اعضایشان و راه پیوستن به آن‌ها', alternates: { canonical: toPublicPath('/forum/g') } }
const JOIN: Record<string, string> = { OPEN: 'عضویت آزاد', REQUEST: 'با درخواست', CLOSED: 'با دعوت' }

export default async function GroupsPage() {
  await requireModule('forum')
  const viewer = await getForumViewer()
  const groups = await listGroups(viewer)
  const mine = groups.filter((group) => group.membership?.status === 'ACTIVE').length
  return (
    <ForumShell viewer={viewer} active="groups" wide>
      <header className="fm-head">
        <div><h1>گروه‌های کاربری</h1><p className="fx-muted">به گروه‌های هم‌علاقه بپیوندید؛ برخی گروه‌ها نشان ویژه یا دسترسی به انجمن‌های خاص می‌دهند.</p></div>
        {groups.length > 0 && <p className="fg-count"><b>{num(groups.length)}</b> گروه{mine > 0 && <> · عضو <b>{num(mine)}</b> گروه هستید</>}</p>}
      </header>
      <ul className="fg-grid">
        {groups.map((group) => {
          const state = group.membership?.status
          return (
            <li key={group.id}>
              <Link href={`/forum/g/${group.slug}`} className="fg-card" style={{ ['--g' as string]: group.color }}>
                <span className="fg-cover" aria-hidden="true" />
                <span className="fg-icon" aria-hidden="true">{group.icon || '👥'}</span>
                {state === 'ACTIVE' && <span className="fg-state is-in">{group.membership?.owner ? 'مدیر گروه' : 'عضو هستید'}</span>}
                {state === 'PENDING' && <span className="fg-state">در انتظار تأیید</span>}
                <b className="fg-name">{group.name}</b>
                <span className="fg-desc">{group.description || (group.title ? `اعضای این گروه عنوان «${group.title}» می‌گیرند.` : 'گروهی از اعضای جامعه.')}</span>
                <span className="fg-foot">
                  <span className="fg-faces" aria-hidden="true">{group.faces.map((face) => <Avatar key={face.id} author={face} size={30} />)}</span>
                  {(!group.automatic || group.memberCount > 0) && <span className="fg-members"><b>{num(group.memberCount)}</b> عضو</span>}
                  <span className="fg-join">{group.automatic ? 'خودکار' : JOIN[group.joinMode] || JOIN.CLOSED}</span>
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
      {!groups.length && <div className="fx-empty"><p>هنوز گروهی ساخته نشده است.</p></div>}
    </ForumShell>
  )
}
