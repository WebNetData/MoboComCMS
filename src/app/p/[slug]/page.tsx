import PageView from '@/modules/site/server/pages/p/[slug]/page'

export const dynamic = 'force-dynamic'
export { generateMetadata } from '@/modules/site/server/pages/p/[slug]/page'
export default async function PageRoute({ params }: { params: Promise<{ slug: string }> }) {
  return <PageView params={params} />
}
