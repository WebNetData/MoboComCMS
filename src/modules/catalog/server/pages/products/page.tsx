import { notFound } from 'next/navigation'
import { isStoreEnabled } from '@/modules/catalog/server/storefront'
import BuilderRenderer from '@/components/content/builder/BuilderRenderer'
import { ThemeFooter, ThemeHeader } from '@/components/content/builder/ThemeChrome'
import { resolvePlacedPage } from '@/modules/site/server/theme-templates'
import { editableFor, isPreview, type BuilderPreview } from '@/modules/site/server/builder-preview'
import ShopGrid, { type ShopCategory, type ShopProduct } from '@/components/ShopGrid'
import { db } from '@/platform/database/prisma'
import { getServerLocale, getServerTheme } from '@/i18n/server'
import { dict } from '@/i18n/config'
import { PageIntro } from '@/components/content/ContentPrimitives'
import { richTextToPlain } from '@/shared/content/sanitize'


const SHOP_CONTEXT = { route: 'shop' } as const

export default async function ProductsPage({ searchParams: searchParamsPromise, preview }: { searchParams: Promise<{ category?: string }>; preview?: BuilderPreview }) {
  const searchParams = await searchParamsPromise
  if (!await isStoreEnabled() && !isPreview(preview)) notFound()
  const [locale, theme] = await Promise.all([getServerLocale(), getServerTheme()])
  const t = dict(locale)

  // A published theme page placed as the shop landing replaces the default grid
  // (category filters keep using the default grid).
  const placed = !searchParams.category ? await resolvePlacedPage('shop') : null
  if (placed) {
    const nav = await db.page.findMany({ where: { status: 'PUBLISHED', showInNav: true }, orderBy: { sortOrder: 'asc' }, select: { slug: true, title: true, titleEn: true } }).catch(() => [])
    return (
      <>
        <ThemeHeader context={SHOP_CONTEXT} choice={placed.doc.layout?.header} theme={theme} locale={locale} navPages={nav} preview={preview} />
        <main className="br-page-main"><BuilderRenderer doc={placed.doc} locale={locale} preview={isPreview(preview)} editable={editableFor(preview, placed.meta.id)} /></main>
        <ThemeFooter context={SHOP_CONTEXT} choice={placed.doc.layout?.footer} locale={locale} navPages={nav} preview={preview} />
      </>
    )
  }

  const [products, cats, ratings] = await Promise.all([
    db.product
      .findMany({ where: { active: true }, orderBy: [{ featured: 'desc' }, { sortOrder: 'asc' }, { id: 'desc' }], include: { category: true, variants: { select: { id: true, price: true, stock: true, active: true } } } })
      .catch(() => []),
    db.productCategory.findMany({ orderBy: { name: 'asc' } }).catch(() => []),
    db.productReview
      .groupBy({ by: ['productId'], where: { status: 'APPROVED' }, _avg: { rating: true }, _count: { rating: true } })
      .catch(() => [] as { productId: number; _avg: { rating: number | null }; _count: { rating: number } }[]),
  ])
  const ratingByProduct = new Map(ratings.map(row => [row.productId, { rating: Math.round((row._avg.rating || 0) * 10) / 10, count: row._count.rating }]))
  const navPages = await db.page
    .findMany({ where: { status: 'PUBLISHED', showInNav: true }, orderBy: { sortOrder: 'asc' }, select: { slug: true, title: true, titleEn: true } })
    .catch(() => [])

  const items: ShopProduct[] = products.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    nameEn: p.nameEn,
    description: richTextToPlain(p.description, 300),
    descriptionEn: richTextToPlain(p.descriptionEn, 300),
    price: p.variants.some(variant => variant.active) ? Math.min(...p.variants.filter(variant => variant.active).map(variant => variant.price)) : p.price,
    kind: p.kind,
    hasVariants: p.variants.length > 0,
    currency: p.currency,
    image: p.image,
    stock: p.stock === 0 || (p.variants.length > 0 && !p.variants.some(variant => variant.active && variant.stock !== 0)) ? 0 : p.stock,
    featured: p.featured,
    categoryName: p.category?.name || '',
    categoryNameEn: p.category?.nameEn || '',
    categorySlug: p.category?.slug || '',
    rating: ratingByProduct.get(p.id)?.rating || 0,
    ratingCount: ratingByProduct.get(p.id)?.count || 0,
  }))

  const categories: ShopCategory[] = []
  const visited = new Set<number>()
  function addCategory(parentId: number | null, depth: number) {
    for (const c of cats.filter(category => category.parentId === parentId)) {
      if (visited.has(c.id)) continue
      visited.add(c.id)
      categories.push({ id: c.id, slug: c.slug, name: c.name, nameEn: c.nameEn, parentId: c.parentId, depth })
      addCategory(c.id, depth + 1)
    }
  }
  addCategory(null, 0)
  for (const c of cats) if (!visited.has(c.id)) { categories.push({ id: c.id, slug: c.slug, name: c.name, nameEn: c.nameEn, parentId: c.parentId, depth: 0 }); visited.add(c.id); addCategory(c.id, 1) }

  return (
    <>
      <ThemeHeader context={SHOP_CONTEXT} theme={theme} locale={locale} navPages={navPages} preview={preview} />
      <main className="container page-main content-surface">
        <PageIntro eyebrow={locale === 'fa' ? 'فروشگاه MoboComCMS' : 'MoboComCMS store'} title={t.products} description={t.shopSub} />

        <ShopGrid products={items} categories={categories} initialCategory={searchParams.category || ''} />

        <div className="grid-auto mt-10">
          {(
            [
              ['🔒', t.securePayment, t.faqPayA],
              ['⚡', t.instantActivation, t.why4d],
              ['🛡', t.guarantee, t.why2d],
            ] as [string, string, string][]
          ).map(([icon, title, desc]) => (
            <div key={title} className="tile flex items-start gap-3">
              <div className="tile-icon" style={{ marginBottom: 0 }}>{icon}</div>
              <div>
                <div className="tile-title">{title}</div>
                <p className="muted">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </main>
      <ThemeFooter context={SHOP_CONTEXT} locale={locale} navPages={navPages} preview={preview} />
    </>
  )
}
