import PostView from '@/modules/site/server/pages/blog/[slug]/page'

export const dynamic = 'force-dynamic'
export { generateMetadata } from '@/modules/site/server/pages/blog/[slug]/page'
export default async function PostRoute({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ style?: string | string[] }> }) {
  const style = (await searchParams).style
  return <PostView params={params} askedStyle={typeof style === 'string' ? style.slice(0, 64) : undefined} />
}
