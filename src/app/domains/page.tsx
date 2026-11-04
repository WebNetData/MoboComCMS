import type { Metadata } from 'next'
import { requireModule } from '@/extensions/server/modules'
import { withSectionSeo } from '@/modules/site/server/section-seo'
import { toPublicPath } from '@/platform/routing/aliases'
import DomainLanding from '@/components/hosting/DomainLanding'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  return withSectionSeo('hosting', { title: 'ثبت و انتقال دامنه', description: 'ثبت دامنه‌های .ir و بین‌المللی، جست‌وجوی هم‌زمان روی همهٔ پسوندها، انتقال دامنه و تمدید خودکار از کیف پول.', alternates: { canonical: toPublicPath('/domains') } })
}

export default async function Page() {
  await requireModule('hosting')
  return <DomainLanding />
}
