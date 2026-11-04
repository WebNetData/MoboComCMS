import type { Metadata } from 'next'
import { requireModule } from '@/extensions/server/modules'
import { withSectionSeo } from '@/modules/site/server/section-seo'
import { toPublicPath } from '@/platform/routing/aliases'
import HostingLanding from '@/components/hosting/HostingLanding'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  return withSectionSeo('hosting', { title: 'هاست و میزبانی وب', description: 'هاست اشتراکی، نمایندگی و هاست ابری با کنترل‌پنل حرفه‌ای، پرداخت ماهانه تا سالانه یا ساعتی و مدیریت کامل از داشبورد.', alternates: { canonical: toPublicPath('/hosting') } })
}

export default async function Page() {
  await requireModule('hosting')
  return <HostingLanding group="hosting" />
}
