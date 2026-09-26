import PackagePageView from '@/modules/packages/server/pages/package-page'

export const dynamic = 'force-dynamic'
export { generateMetadata } from '@/modules/packages/server/pages/package-page'
export default async function PackagePageRoute({ params }: { params: Promise<{ id: string; slug: string }> }) {
  return <PackagePageView params={params}/>
}
