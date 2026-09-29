import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from '@/components/AppLink'
import { db } from '@/platform/database/prisma'
import { getServerLocale, getServerTheme } from '@/i18n/server'
import { ThemeFooter, ThemeHeader } from '@/components/content/builder/ThemeChrome'
import SectionBarSlot from '@/components/site/SectionBarSlot'
import { ProductGrid } from '@/components/store/Storefront'
import { isStoreEnabled } from '@/modules/catalog/server/storefront'
import { productCards } from '@/modules/store/server/catalog'
import { pageMeta } from '@/modules/site/server/seo'
import { publicSeller, sellerBySlug, sellerReviews } from '@/modules/marketplace/server/marketplace'

const SHOP_CONTEXT = { route: 'shop' } as const
const SORTS = [['bestselling', 'پرفروش‌ترین'], ['newest', 'جدیدترین'], ['cheapest', 'ارزان‌ترین'], ['expensive', 'گران‌ترین']] as const
const ORDER = { bestselling: [{ soldCount: 'desc' as const }, { id: 'desc' as const }], newest: [{ id: 'desc' as const }], cheapest: [{ priceMinor: 'asc' as const }], expensive: [{ priceMinor: 'desc' as const }] }

export async function shopMetadata(slug: string): Promise<Metadata> {
  const seller = await sellerBySlug(slug)
  if (!seller) return { title: 'Not found', robots: { index: false, follow: false } }
  return pageMeta({ title: `فروشگاه ${seller.shopName}`, description: seller.about.slice(0, 160) || `محصولات ${seller.shopName}`, path: `/shop/${seller.slug}`, image: seller.banner || seller.logo || undefined, locale: 'fa' })
}

/** /shop/:slug — a marketplace seller's storefront: profile, rating, products and buyer reviews. */
export async function SellerShopView({ slug, sort }: { slug: string; sort: string }) {
  if (!await isStoreEnabled()) notFound()
  const row = await sellerBySlug(slug)
  if (!row) notFound()
  const seller = publicSeller(row)
  const key = (SORTS.some(([value]) => value === sort) ? sort : 'bestselling') as keyof typeof ORDER
  const [locale, theme, products, reviews, navPages] = await Promise.all([
    getServerLocale(), getServerTheme(),
    productCards({ sellerId: row.id }, ORDER[key], 60),
    sellerReviews(row.id, 8),
    db.page.findMany({ where: { status: 'PUBLISHED', showInNav: true }, orderBy: { sortOrder: 'asc' }, select: { slug: true, title: true, titleEn: true } }).catch(() => []),
  ])
  const months = Math.max(1, Math.round((Date.now() - new Date(seller.since).getTime()) / (30 * 86_400_000)))
  return <>
    <ThemeHeader context={SHOP_CONTEXT} theme={theme} locale={locale} navPages={navPages} />
    <SectionBarSlot section="shop" />
    <main className="container sx-page mk-shop">
      <section className="mk-shop-hero" style={seller.banner ? { backgroundImage: `url("${seller.banner.replace(/"/g, '%22')}")` } : undefined}>
        <div className="mk-shop-card">
          {seller.logo ? <img src={seller.logo} alt="" className="mk-shop-logo" /> : <span className="mk-shop-logo is-ph" aria-hidden="true">{seller.shopName.slice(0, 1)}</span>}
          <div className="mk-shop-id">
            <h1>{seller.shopName}</h1>
            <p>{seller.city ? `${seller.city} · ` : ''}{months.toLocaleString('fa-IR')} ماه همراه ما</p>
          </div>
          <dl className="mk-shop-stats">
            <div><dt>عملکرد</dt><dd><span className={`mk-perf is-${seller.performance.tone}`}>{seller.performance.label}</span></dd></div>
            <div><dt>رضایت خریداران</dt><dd>{seller.rating.count ? `★ ${seller.rating.average.toLocaleString('fa-IR')} از ۵` : '—'}<small>{seller.rating.count ? ` (${seller.rating.count.toLocaleString('fa-IR')} رأی)` : ''}</small></dd></div>
            <div><dt>کالای فروخته‌شده</dt><dd>{seller.salesCount.toLocaleString('fa-IR')}</dd></div>
            <div><dt>محصولات</dt><dd>{products.length.toLocaleString('fa-IR')}</dd></div>
          </dl>
        </div>
      </section>
      {seller.about && <p className="mk-shop-about">{seller.about}</p>}
      <nav className="mk-shop-sort" aria-label="مرتب‌سازی">{SORTS.map(([value, label]) => <Link key={value} href={`/shop/${seller.slug}?sort=${value}`} className={key === value ? 'is-active' : ''} aria-current={key === value ? 'true' : undefined}>{label}</Link>)}</nav>
      {products.length ? <ProductGrid products={products} /> : <p className="sx-empty">این فروشگاه هنوز محصولی برای فروش ندارد.</p>}
      {reviews.length > 0 && <section className="mk-shop-reviews" aria-labelledby="mk-reviews"><h2 id="mk-reviews">نظر خریداران دربارهٔ این فروشنده</h2><ul>{reviews.map((review) => <li key={review.id}><span className="mk-stars" aria-label={`${review.rating} از ۵`}>{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</span><b>{review.name}</b>{review.body && <p>{review.body}</p>}{review.reply && <blockquote>پاسخ فروشنده: {review.reply}</blockquote>}</li>)}</ul></section>}
    </main>
    <ThemeFooter context={SHOP_CONTEXT} locale={locale} navPages={navPages} />
  </>
}
