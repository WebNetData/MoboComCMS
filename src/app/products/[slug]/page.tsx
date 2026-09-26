import ProductView from '@/modules/catalog/server/pages/products/[slug]/page'

export const dynamic = 'force-dynamic'
export { generateMetadata } from '@/modules/catalog/server/pages/products/[slug]/page'
export default async function ProductRoute({ params }: { params: Promise<{ slug: string }> }) {
  return <ProductView params={params} />
}
