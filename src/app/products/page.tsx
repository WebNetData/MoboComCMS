import type { Metadata } from 'next'
import ProductsView from '@/modules/catalog/server/pages/products/page'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<Metadata> {
  const params = await searchParams
  const filtered = Object.keys(params).length > 0
  return {
    title: 'فروشگاه',
    description: 'خرید آنلاین کالاهای فیزیکی و محصولات دیجیتال با ارسال سریع، ضمانت اصالت و پرداخت امن.',
    alternates: { canonical: typeof params.category === 'string' && Object.keys(params).length === 1 ? `/products?category=${encodeURIComponent(params.category)}` : '/products' },
    robots: filtered && !(typeof params.category === 'string' && Object.keys(params).length === 1) ? { index: false, follow: true } : undefined,
  }
}

export default async function ProductsRoute({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <ProductsView searchParams={searchParams} />
}
