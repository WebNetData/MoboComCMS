import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { requireModule } from '@/extensions/server/modules'
import { getViewer } from '@/modules/membership/server/membership'
import { memberOverview } from '@/modules/membership/server/lifecycle'
import MediaShell from '@/components/media/MediaShell'
import VipAccount from '@/components/media/VipAccount'
import '../vip-pricing.css'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'اشتراک من', robots: { index: false, follow: false } }

export default async function VipAccountPage() {
  await requireModule('membership')
  const viewer = await getViewer()
  if (!viewer.userId) redirect('/login?next=/vip/account')
  return (
    <MediaShell section="vip">
      <div className="container md-body">
        <header className="vip-section-head"><h1>اشتراک من</h1></header>
        <VipAccount initial={await memberOverview(viewer.userId)} />
      </div>
    </MediaShell>
  )
}
