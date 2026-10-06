import type { Metadata } from 'next'
import Link from '@/components/AppLink'
import { requireModule } from '@/extensions/server/modules'
import { getForumViewer } from '@/modules/forum/server/forum'
import { clubRefusal, listClubs } from '@/modules/forum/server/clubs'
import ForumShell from '@/components/forum/ForumShell'
import ClubForm from '@/components/forum/ClubForm'
import { Avatar, TimeAgo, compact, num } from '@/components/forum/shared'
import { toPublicPath } from '@/platform/routing/aliases'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'کلوب‌ها', description: 'کلوب‌هایی که اعضا ساخته‌اند، هر کدام با انجمن خودش', alternates: { canonical: toPublicPath('/forum/clubs') } }

const STATE: Record<string, string> = { OWNER: 'بنیان‌گذار', ACTIVE: 'عضو هستید', PENDING: 'در انتظار تأیید' }

export default async function ClubsPage() {
  await requireModule('forum')
  const viewer = await getForumViewer()
  const clubs = await listClubs(viewer)
  const refusal = clubRefusal(viewer)
  return (
    <ForumShell viewer={viewer} active="clubs" wide>
      <header className="fm-head">
        <div><h1>کلوب‌ها</h1><p className="fx-muted">هر عضو می‌تواند کلوب خودش را بسازد: یک گروه با انجمن اختصاصی، که خودش مدیر آن است.</p></div>
        {!refusal ? <ClubForm /> : viewer.userId ? <p className="fk-why">{refusal}</p> : <Link href="/login?next=/forum/clubs" className="btn btn-primary">برای ساخت کلوب وارد شوید</Link>}
      </header>
      <ul className="fk-grid">
        {clubs.map((club) => (
          <li key={club.slug} className="fk-card" style={{ ['--g' as string]: club.color }}>
            <span className="fk-cover" aria-hidden="true" />
            <span className="fk-icon" aria-hidden="true">{club.icon || '🎪'}</span>
            <span className={`fk-kind-tag is-${club.kind}`}>{club.kind === 'open' ? 'باز' : 'خصوصی'}</span>
            <h2><Link href={`/forum/g/${club.slug}`}>{club.name}</Link>{club.membership !== 'NONE' && <small className={`fk-state is-${club.membership.toLowerCase()}`}>{STATE[club.membership]}</small>}</h2>
            <p className="fk-desc">{club.description || 'کلوبی از اعضای جامعه.'}</p>
            <dl className="fk-stats">
              <div><dd>{compact(club.members)}</dd><dt>عضو</dt></div>
              <div><dd>{club.open ? compact(club.topics) : '—'}</dd><dt>موضوع</dt></div>
              <div><dd>{club.open ? compact(club.posts) : '—'}</dd><dt>پیام</dt></div>
            </dl>
            <div className="fk-foot">
              <span className="fk-faces" aria-hidden="true">{club.faces.map((face) => <Avatar key={face.id} author={face} size={28} />)}</span>
              <small>{club.open && club.lastPostAt ? <>آخرین پیام <TimeAgo date={club.lastPostAt} /></> : club.founder ? <>بنیان‌گذار: {club.founder.name}</> : null}</small>
            </div>
            <div className="fk-actions">
              {club.open && <Link href={`/forum/c/${club.slug}`} className="btn btn-primary btn-sm">ورود به انجمن</Link>}
              <Link href={`/forum/g/${club.slug}`} className="btn btn-ghost btn-sm">{club.membership === 'NONE' ? club.kind === 'open' ? 'پیوستن' : 'درخواست عضویت' : 'صفحهٔ کلوب'}</Link>
            </div>
          </li>
        ))}
      </ul>
      {!clubs.length && <div className="fx-empty"><p>هنوز کلوبی ساخته نشده است. اولین کلوب را شما بسازید.</p></div>}
      {clubs.length > 0 && <p className="fx-muted fk-note">{num(clubs.length)} کلوب</p>}
    </ForumShell>
  )
}
