import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { requireModule } from '@/extensions/server/modules'
import { getForumViewer } from '@/modules/forum/server/forum'
import { getForumSettings } from '@/modules/forum/server/community'
import { canStartMessage } from '@/modules/forum/domain/discourse'
import ForumShell from '@/components/forum/ForumShell'
import { NewMessage } from '@/components/forum/Messages'
import { num } from '@/components/forum/shared'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'پیام خصوصی تازه — تالار گفتمان', robots: { index: false } }

export default async function NewMessagePage({ searchParams }: { searchParams: Promise<{ to?: string }> }) {
  await requireModule('forum')
  const viewer = await getForumViewer()
  const { to } = await searchParams
  if (!viewer.userId) redirect(`/login?next=${encodeURIComponent(`/forum/messages/new${to ? `?to=${to}` : ''}`)}`)
  const settings = await getForumSettings()
  return <ForumShell viewer={viewer} active="messages">
    <header className="fx-page-head"><h1>✉ پیام خصوصی تازه</h1></header>
    {canStartMessage(viewer, settings)
      ? <NewMessage to={to ? `@${String(to).replace(/[^a-z0-9_]/gi, '')}` : ''} />
      : <div className="fx-empty"><b>ارسال پیام خصوصی هنوز برای شما باز نیست</b><p className="fx-muted">{settings.messagesEnabled ? `با فعالیت در تالار به سطح اعتماد ${num(settings.messagesMinTrust)} برسید.` : 'پیام خصوصی در این تالار غیرفعال است.'}</p></div>}
  </ForumShell>
}
