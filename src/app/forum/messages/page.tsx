import type { Metadata } from 'next'
import Link from '@/components/AppLink'
import { redirect } from 'next/navigation'
import { requireModule } from '@/extensions/server/modules'
import { getForumViewer } from '@/modules/forum/server/forum'
import { INBOX_BOXES, inbox } from '@/modules/forum/server/messages'
import { getForumSettings } from '@/modules/forum/server/community'
import { canStartMessage } from '@/modules/forum/domain/discourse'
import ForumShell from '@/components/forum/ForumShell'
import { Avatar, Pager, TimeAgo, num } from '@/components/forum/shared'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'پیام‌های خصوصی — تالار گفتمان', robots: { index: false } }

const LABELS: Record<(typeof INBOX_BOXES)[number], string> = { inbox: 'صندوق', unread: 'خوانده‌نشده', sent: 'فرستاده‌ها', archived: 'بایگانی' }

export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ box?: string; page?: string }> }) {
  await requireModule('forum')
  const viewer = await getForumViewer()
  if (!viewer.userId) redirect('/login?next=/forum/messages')
  const { box, page } = await searchParams
  const [data, settings] = await Promise.all([inbox(viewer, box, page), getForumSettings()])
  const canStart = canStartMessage(viewer, settings)
  return <ForumShell viewer={viewer} active="messages">
    <header className="fx-page-head fx-pm-list-head">
      <h1>✉ پیام‌های خصوصی</h1>
      {canStart ? <Link href="/forum/messages/new" className="btn btn-primary btn-sm">+ پیام تازه</Link> : <small className="fx-muted">ارسال پیام خصوصی از سطح اعتماد {num(settings.messagesMinTrust)} ممکن می‌شود؛ به پیام‌هایی که دریافت می‌کنید می‌توانید پاسخ دهید.</small>}
    </header>
    <nav className="fx-tabs" aria-label="صندوق‌ها">{INBOX_BOXES.map((key) => <Link key={key} href={`/forum/messages${key === 'inbox' ? '' : `?box=${key}`}`} className={data.box === key ? 'is-active' : ''} aria-current={data.box === key ? 'page' : undefined}>{LABELS[key]}{data.counts[key] > 0 && <em> {num(data.counts[key])}</em>}</Link>)}</nav>
    {data.rows.length === 0 ? <div className="fx-empty"><b>{data.box === 'unread' ? 'پیام خوانده‌نشده‌ای ندارید' : 'اینجا هنوز پیامی نیست'}</b><p className="fx-muted">پیام خصوصی فقط برای شما و گیرندگانش دیده می‌شود.</p></div>
      : <ul className="fx-pm-list">{data.rows.map((row) => <li key={row.id} className={row.unread ? 'is-unread' : ''}>
        <Link href={`/forum/messages/${row.id}`}>
          <span className="fx-pm-avatars">{row.participants.slice(0, 3).map((p) => <Avatar key={p.id} author={p} size={32} />)}</span>
          <span className="fx-pm-text"><b>{row.title}</b><small>{row.lastAuthor.name}: {row.excerpt}</small><small className="fx-muted">{row.participants.map((p) => p.name).join('، ')}</small></span>
          <span className="fx-pm-meta">{row.unread > 0 && <em>{num(row.unread)}</em>}<TimeAgo date={row.lastPostAt} short /></span>
        </Link>
      </li>)}</ul>}
    <Pager page={data.page} pages={data.pages} href={(n) => `/forum/messages?${new URLSearchParams({ ...(data.box !== 'inbox' ? { box: data.box } : {}), ...(n > 1 ? { page: String(n) } : {}) })}`} />
  </ForumShell>
}
