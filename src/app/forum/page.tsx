import type { Metadata } from 'next'
import { requireModule } from '@/extensions/server/modules'
import TopicListPage from '@/components/forum/TopicListPage'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'تالار گفتمان',
  description: 'پرسش، پاسخ و گفت‌وگو با کاربران و تیم موبوکام',
  alternates: { canonical: '/forum' },
}

export default async function ForumHome({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  await requireModule('forum')
  const { page } = await searchParams
  return <TopicListPage filter="latest" page={Number(page) || 1} />
}
