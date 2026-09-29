import { SellerShopView, shopMetadata } from '@/modules/marketplace/server/pages/shop'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  return shopMetadata((await params).slug)
}

export default async function ShopPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ sort?: string }> }) {
  const [{ slug }, query] = await Promise.all([params, searchParams])
  return <SellerShopView slug={slug} sort={String(query.sort || '')} />
}
