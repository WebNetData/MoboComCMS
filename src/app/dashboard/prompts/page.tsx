import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { requireModule } from '@/extensions/server/modules'
import { getViewer } from '@/modules/membership/server/membership'
import { memberPromptWorkspace } from '@/modules/prompts/server/prompts'
import MemberPromptShelf from '@/components/prompts/MemberPromptShelf'
import PromptHistory from '@/components/prompts/PromptHistory'
import MemberLibrarySync from '@/components/engage/MemberLibrarySync'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'پرامپت مستر من | موبوکام', robots: { index: false, follow: false } }

export default async function MemberPromptsPage({ searchParams }: { searchParams: Promise<{ pinned?: string }> }) {
  await requireModule('prompt-master')
  const viewer = await getViewer()
  if (!viewer.userId) redirect('/login?next=/dashboard/prompts')
  const [data, query] = await Promise.all([memberPromptWorkspace(viewer.userId), searchParams])
  return <div className="ud" dir="rtl"><header className="ulib-head"><div><h1>فضای پرامپت من</h1><p className="muted">همان حساب موبوکام؛ خروجی‌های خصوصی، علاقه‌مندی‌ها و کالکشن‌های شما در دسترس‌اند.</p></div></header>
    <MemberLibrarySync />
    {data && <MemberPromptShelf data={data} compact />}
    <section className="ud-card" aria-label="تاریخچهٔ خصوصی پرامپت‌ها"><h2>خروجی‌های خصوصی من</h2><PromptHistory key={String(query.pinned === 'true')} initialPinned={query.pinned === 'true'} /></section>
  </div>
}
