import PostView from '@/modules/site/server/pages/blog/[slug]/page'

export const dynamic = 'force-dynamic'
export { generateMetadata } from '@/modules/site/server/pages/blog/[slug]/page'
export default async function PostRoute({ params }: { params: Promise<{ slug: string }> }) {
  return <PostView params={params} />
}
