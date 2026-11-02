import type { Metadata } from 'next'
import BlogView from '@/modules/site/server/pages/blog/page'
import { withSectionSeo } from '@/modules/site/server/section-seo'
import { toPublicPath } from '@/platform/routing/aliases'
import { journalListingMetadata } from '@/modules/journal/server/seo'
import { shareCard } from '@/modules/site/server/seo'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ category?: string; q?: string; page?: string }> }): Promise<Metadata> {
  const params = await searchParams
  // A category, an archive page and a search are pages of their own (docs: journal listing SEO); the home is the section's.
  const listing = await journalListingMetadata(params)
  if (listing) return shareCard(listing)
  return withSectionSeo('journal', { title: 'مجله', description: 'تازه‌ترین مقاله‌ها، اخبار، آموزش‌ها و نقدها', alternates: { canonical: toPublicPath('/blog') } })
}
export default async function BlogRoute({ searchParams }: { searchParams: Promise<{ category?: string; q?: string; page?: string }> }) {
  return <BlogView searchParams={searchParams} />
}
