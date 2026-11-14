import type { Metadata } from 'next'
import { requireModule } from '@/extensions/server/modules'
import SharedCart from '@/components/store/SharedCart'
import SiteHeader from '@/components/SiteHeader'
import SiteFooter from '@/components/SiteFooter'
import { getServerTheme } from '@/i18n/server'
export const metadata: Metadata = { title: 'سبد خرید مشترک', robots: { index: false, follow: false }, referrer: 'no-referrer' }
export const dynamic = 'force-dynamic'
export default async function SharedCartPage({ params }: { params: Promise<{ token: string }> }) {
  await requireModule('store')
  return <><SiteHeader theme={await getServerTheme()} /><main><SharedCart token={(await params).token} /></main><SiteFooter /></>
}
