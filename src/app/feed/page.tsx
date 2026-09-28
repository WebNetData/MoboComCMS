import type { Metadata } from 'next'
import { requireModule } from '@/extensions/server/modules'
import { getViewer } from '@/modules/membership/server/membership'
import { FeedPage } from '@/modules/community/server/pages/feed'
import { withSectionSeo } from '@/modules/site/server/section-seo'
import { toPublicPath } from '@/platform/routing/aliases'

export const dynamic = 'force-dynamic'
type Search = { mode?: string; tag?: string }

export async function generateMetadata({ searchParams }: { searchParams: Promise<Search> }): Promise<Metadata> {
  const { tag } = await searchParams
  if (tag) return { title: `#${tag}`, alternates: { canonical: toPublicPath(`/feed?tag=${encodeURIComponent(tag)}`) } }
  return withSectionSeo('community', { title: 'تازه‌ها — جامعهٔ موبوکام', description: 'پست‌ها و فعالیت‌های کاربران موبوکام دربارهٔ بازی، فیلم، موزیک و نرم‌افزار', alternates: { canonical: toPublicPath('/feed') } })
}

export default async function FeedRoute({ searchParams }: { searchParams: Promise<Search> }) {
  await requireModule('community')
  const [viewer, params] = await Promise.all([getViewer(), searchParams])
  return <FeedPage viewerId={viewer.userId ?? null} mode={params.mode} tag={params.tag} />
}
