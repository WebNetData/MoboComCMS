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
  // Each half of the shop is a store page of its own (?kind=… alone).
  const kind = typeof params.kind === 'string' && Object.keys(params).length === 1 ? params.kind.toUpperCase() : ''
  const store = kind === 'VIRTUAL' ? { title: 'فروشگاه محصولات دیجیتال', description: 'خرید لایسنس، گیفت‌کارت، اکانت و اشتراک با تحویل آنی در حساب کاربری؛ ضمانت اصالت و پرداخت امن.' }
    : kind === 'PHYSICAL' ? { title: 'فروشگاه کالای فیزیکی', description: 'خرید کالای اصل با ارسال به سراسر کشور، انتخاب روش و زمان ارسال، ضمانت بازگشت و پرداخت امن.' } : null
  if (store) return { title: store.title, description: store.description, alternates: { canonical: toPublicPath(`/products?kind=${kind}`) } }
  // The file store is a page of its own: its name and description from the store settings.
  if (params.files === '1' && Object.keys(params).every((key) => key === 'files' || key === 'kind')) {
    const { getStoreSettings } = await import('@/modules/store/server/catalog')
    const settings = await getStoreSettings()
    return { title: `${settings.fileStoreName} — ${settings.fileStoreTitle}`, description: settings.fileStoreDescription, alternates: { canonical: toPublicPath('/products?files=1') } }
  }
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
