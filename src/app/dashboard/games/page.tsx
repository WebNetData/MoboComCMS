import type { Metadata } from 'next'
import { requireModule } from '@/extensions/server/modules'
import { MyGamesView } from '@/modules/games/server/pages/my-games'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'کتابخانهٔ بازی من', robots: { index: false } }
export default async function MyGamesPage({ searchParams }: { searchParams: Promise<{ status?: string; page?: string }> }) {
  await requireModule('games')
  const params = await searchParams
  return <MyGamesView status={params.status} page={params.page} />
}
