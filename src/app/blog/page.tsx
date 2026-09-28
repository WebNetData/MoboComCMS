import type { Metadata } from 'next'
import BlogView from '@/modules/site/server/pages/blog/page'
import { withSectionSeo } from '@/modules/site/server/section-seo'
import { toPublicPath } from '@/platform/routing/aliases'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ category?: string; q?: string; page?: string }> }): Promise<Metadata> {
  const params = await searchParams
  const base: Metadata = { title: 'مجله', description: 'تازه‌ترین مقاله‌ها، اخبار، آموزش‌ها و نقدها', alternates: { canonical: toPublicPath('/blog') } }
  return params.category || params.q || params.page ? { ...base, robots: params.q ? { index: false } : undefined } : withSectionSeo('journal', base)
}
export default async function BlogRoute({ searchParams }: { searchParams: Promise<{ category?: string; q?: string; page?: string }> }) {
  return <BlogView searchParams={searchParams} />
}
