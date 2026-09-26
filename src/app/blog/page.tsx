import BlogView from '@/modules/site/server/pages/blog/page'

export const dynamic = 'force-dynamic'
export default async function BlogRoute({ searchParams }: { searchParams: Promise<{ category?: string; q?: string; page?: string }> }) {
  return <BlogView searchParams={searchParams} />
}
