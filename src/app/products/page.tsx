import ProductsView from '@/modules/catalog/server/pages/products/page'

export const dynamic = 'force-dynamic'
export default async function ProductsRoute({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  return <ProductsView searchParams={searchParams} />
}
