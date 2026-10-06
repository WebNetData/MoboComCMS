import type { Metadata } from 'next'
import { moderatesAnything } from '@/modules/forum/domain/community'
import { notFound } from 'next/navigation'
import { requireModule } from '@/extensions/server/modules'
import { getForumViewer } from '@/modules/forum/server/forum'
import { reviewQueue } from '@/modules/forum/server/moderation'
import ForumShell from '@/components/forum/ForumShell'
import { ReviewQueue } from '@/components/forum/Messages'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'صف بررسی — تالار گفتمان', robots: { index: false } }

export default async function ReviewPage() {
  await requireModule('forum')
  const viewer = await getForumViewer()
  if (!moderatesAnything(viewer)) notFound()
  const items = await reviewQueue(viewer)
  return <ForumShell viewer={viewer} active="review">
    <header className="fx-page-head"><h1>⚖ صف بررسی</h1><p className="fx-muted">پیام‌های کاربران تازه‌وارد و پیام‌های دارای واژه‌های تحت نظر پیش از انتشار اینجا تأیید می‌شوند. گزارش‌های کاربران در مدیریت تالار (بخش گزارش‌ها) است.</p></header>
    <ReviewQueue items={JSON.parse(JSON.stringify(items))} />
  </ForumShell>
}
