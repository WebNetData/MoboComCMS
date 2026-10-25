import { toPublicPath } from '@/platform/routing/aliases'
import { productCategoryName } from '@/modules/catalog/server/seo'
import type { Metadata } from 'next'
import { withSectionSeo } from '@/modules/site/server/section-seo'
import ProductsView from '@/modules/catalog/server/pages/products/page'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<Metadata> {
  const params = await searchParams
  const filtered = Object.keys(params).length > 0
  // A category listing is a page of its own: its name in the title and description; an unknown address is not indexed.
  const onlyCategory = typeof params.category === 'string' && Object.keys(params).length === 1
  const categoryName = onlyCategory ? await productCategoryName(params.category as string) : null
  const base: Metadata = {
    title: categoryName ? `${categoryName} — فروشگاه` : 'فروشگاه',
    description: categoryName ? `خرید آنلاین ${categoryName}: مقایسهٔ قیمت و مشخصات، ارسال سریع، ضمانت اصالت و پرداخت امن.` : 'خرید آنلاین کالاهای فیزیکی و محصولات دیجیتال با ارسال سریع، ضمانت اصالت و پرداخت امن.',
    alternates: { canonical: toPublicPath(typeof params.category === 'string' && Object.keys(params).length === 1 ? `/products?category=${encodeURIComponent(params.category)}` : '/products') },
    robots: filtered && !(onlyCategory && categoryName) ? { index: false, follow: true } : undefined,
  }
  return filtered ? base : withSectionSeo('store', base)
}

export default async function ProductsRoute({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <ProductsView searchParams={searchParams} />
}
