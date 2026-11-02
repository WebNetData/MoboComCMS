import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { requireModule } from '@/extensions/server/modules'
import { getViewer } from '@/modules/membership/server/membership'
import { memberOverview } from '@/modules/membership/server/lifecycle'
import { getSettings } from '@/modules/settings/server'
import MediaShell from '@/components/media/MediaShell'
import VipAccount from '@/components/media/VipAccount'
import '../vip-pricing.css'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'اشتراک من', robots: { index: false, follow: false } }

export default async function VipAccountPage({ searchParams }: { searchParams: Promise<{ gift?: string; team?: string }> }) {
  await requireModule('membership')
  const viewer = await getViewer()
  const { gift = '', team = '' } = await searchParams
  const asked = new URLSearchParams({ ...(gift ? { gift } : {}), ...(team ? { team } : {}) }).toString()
  if (!viewer.userId) redirect(`/login?next=${encodeURIComponent(`/vip/account${asked ? `?${asked}` : ''}`)}`)
  const origin = ((await getSettings()).siteUrl || process.env.NEXTAUTH_URL || '').replace(/\/+$/, '')
  return (
    <MediaShell section="vip">
      <div className="container md-body">
        <header className="vip-section-head"><h1>اشتراک من</h1></header>
        <VipAccount initial={await memberOverview(viewer.userId)} giftCode={gift.slice(0, 40)} teamCode={team.slice(0, 40)} origin={origin} />
      </div>
    </MediaShell>
  )
}
