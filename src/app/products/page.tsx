import { toPublicPath } from '@/platform/routing/aliases'
import type { Metadata } from 'next'
import { withSectionSeo } from '@/modules/site/server/section-seo'
import ProductsView from '@/modules/catalog/server/pages/products/page'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<Metadata> {
  const params = await searchParams
  const filtered = Object.keys(params).length > 0
  const base: Metadata = {
    title: 'فروشگاه',
    description: 'خرید آنلاین کالاهای فیزیکی و محصولات دیجیتال با ارسال سریع، ضمانت اصالت و پرداخت امن.',
    alternates: { canonical: toPublicPath(typeof params.category === 'string' && Object.keys(params).length === 1 ? `/products?category=${encodeURIComponent(params.category)}` : '/products') },
    robots: filtered && !(typeof params.category === 'string' && Object.keys(params).length === 1) ? { index: false, follow: true } : undefined,
  }
  return filtered ? base : withSectionSeo('store', base)
}

export default async function ProductsRoute({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <ProductsView searchParams={searchParams} />
}
