import { sectionDisplayName } from '@/modules/site/server/section-names'
import type { Metadata } from 'next'
import { requireModule } from '@/extensions/server/modules'
import { withSectionSeo } from '@/modules/site/server/section-seo'
import { toPublicPath } from '@/platform/routing/aliases'
import CloudLanding from '@/components/hosting/CloudLanding'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const name = await sectionDisplayName('hosting', true, { fa: 'موبوکام کلاد', en: 'MoboCom Cloud' })
  return withSectionSeo('hosting', { title: `${name} — هاست، سرور، ابر و دامنه`, description: 'هاست و میزبانی وب، سرور مجازی و اختصاصی، سرور ابری با پرداخت ساعتی و ثبت دامنه؛ با یک حساب، یک کیف پول و یک داشبورد.', alternates: { canonical: toPublicPath('/cloud') } })
}

export default async function Page() {
  await requireModule('hosting')
  return <CloudLanding />
}
