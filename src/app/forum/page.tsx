import type { Metadata } from 'next'
import { requireModule } from '@/extensions/server/modules'
import TopicListPage from '@/components/forum/TopicListPage'
import { sectionLanding } from '@/modules/site/server/pages/section/landing'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'تالار گفتمان',
  description: 'پرسش، پاسخ و گفت‌وگو با کاربران و تیم موبوکام',
  alternates: { canonical: '/forum' },
}

export default async function ForumHome({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  await requireModule('forum')
  const { page } = await searchParams
  const landing = !page ? await sectionLanding('forum') : null
  if (landing) return landing
  return <TopicListPage filter="latest" page={Number(page) || 1} />
}
