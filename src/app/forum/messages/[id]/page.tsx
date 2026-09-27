import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { requireModule } from '@/extensions/server/modules'
import { getForumViewer } from '@/modules/forum/server/forum'
import { getConversation } from '@/modules/forum/server/messages'
import ForumShell from '@/components/forum/ForumShell'
import { Conversation, type ConversationData } from '@/components/forum/Messages'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'پیام خصوصی — تالار گفتمان', robots: { index: false } }

export default async function ConversationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string }> }) {
  await requireModule('forum')
  const viewer = await getForumViewer()
  const [{ id }, { page }] = await Promise.all([params, searchParams])
  if (!viewer.userId) redirect(`/login?next=${encodeURIComponent(`/forum/messages/${id}`)}`)
  const data = await getConversation(viewer, Number(id), page)
  if (!data) notFound()
  return <ForumShell viewer={viewer} active="messages">
    <Conversation data={JSON.parse(JSON.stringify(data)) as ConversationData} />
  </ForumShell>
}
