import type { Metadata } from 'next'
import { requireModule } from '@/extensions/server/modules'
import { withSectionSeo } from '@/modules/site/server/section-seo'
import { toPublicPath } from '@/platform/routing/aliases'
import HostingLanding from '@/components/hosting/HostingLanding'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  return withSectionSeo('hosting', { title: 'سرور مجازی، ابری و اختصاصی', description: 'سرور مجازی و اختصاصی و سرور ابری با پرداخت ساعتی؛ روشن و خاموش، ری‌استارت، نصب دوباره و کنسول از پنل خودتان.', alternates: { canonical: toPublicPath('/servers') } })
}

export default async function Page() {
  await requireModule('hosting')
  return <HostingLanding group="servers" />
}
