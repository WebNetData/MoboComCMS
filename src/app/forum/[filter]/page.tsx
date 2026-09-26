import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireModule } from '@/extensions/server/modules'
import TopicListPage from '@/components/forum/TopicListPage'
import type { TopPeriod, TopicFilter } from '@/modules/forum/server/forum'

export const dynamic = 'force-dynamic'

// /forum/top, /forum/unread, /forum/new-topics, /forum/bookmarks, /forum/mine, /forum/unanswered, /forum/solved
const FILTERS: Record<string, { filter: TopicFilter; title: string; index: boolean }> = {
  top: { filter: 'top', title: 'برترین موضوع‌ها', index: true },
  unread: { filter: 'unread', title: 'خوانده‌نشده‌ها', index: false },
  'new-topics': { filter: 'new', title: 'موضوع‌های تازه', index: false },
  bookmarks: { filter: 'bookmarks', title: 'نشان‌شده‌ها', index: false },
  mine: { filter: 'mine', title: 'فعالیت من', index: false },
  unanswered: { filter: 'unanswered', title: 'موضوع‌های بی‌پاسخ', index: true },
  solved: { filter: 'solved', title: 'موضوع‌های حل‌شده', index: true },
}

type Props = { params: Promise<{ filter: string }>; searchParams: Promise<{ page?: string; period?: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const entry = FILTERS[(await params).filter]
  if (!entry) return {}
  return { title: `${entry.title} — تالار گفتمان`, robots: entry.index ? undefined : { index: false }, alternates: { canonical: `/forum/${(await params).filter}` } }
}

export default async function ForumFilterPage({ params, searchParams }: Props) {
  await requireModule('forum')
  const entry = FILTERS[(await params).filter]
  if (!entry) notFound()
  const { page, period } = await searchParams
  return <TopicListPage filter={entry.filter} period={period as TopPeriod | undefined} page={Number(page) || 1} />
}
