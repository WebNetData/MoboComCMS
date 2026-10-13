import Link from '@/components/AppLink'
import { notFound } from 'next/navigation'
import { isStoreEnabled } from '@/modules/catalog/server/storefront'
import BuilderRenderer from '@/components/content/builder/BuilderRenderer'
import { ThemeFooter, ThemeHeader } from '@/components/content/builder/ThemeChrome'
import { resolvePlacedPage } from '@/modules/site/server/theme-templates'
import { editableFor, isPreview, type BuilderPreview } from '@/modules/site/server/builder-preview'
import { db } from '@/platform/database/prisma'
import { getServerLocale, getServerTheme } from '@/i18n/server'
import SectionBarSlot from '@/components/site/SectionBarSlot'
import StoreSlider from '@/components/store/StoreSlider'
import { StoreIcon } from '@/components/store/StoreIcons'
import {
  BannerGrid, BrandStrip, CategoryCircles, Crumbs, DivisionPanels, OfferBand, ProductGrid, ProductRail, TrustStrip,
} from '@/components/store/Storefront'
import { shopDivisions, shopHome, shopListing, type CategoryNode } from '@/modules/store/server/catalog'
import { SHOP_SORTS, isFiltered, parseShopQuery, shopQueryString, type ShopQuery } from '@/modules/store/domain/store'
import { iranianUnit } from '@/shared/money/format'

const SHOP_CONTEXT = { route: 'shop' } as const
type Params = Record<string, string | string[] | undefined>

const fa = (value: number) => value.toLocaleString('fa-IR')

/** Shop landing (Digikala-style rails) or, with any filter, the listing with facets. */
export default async function ProductsPage({ searchParams: searchParamsPromise, preview }: { searchParams: Promise<Params>; preview?: BuilderPreview }) {
  const params = await searchParamsPromise
  if (!await isStoreEnabled() && !isPreview(preview)) notFound()
  const [locale, theme] = await Promise.all([getServerLocale(), getServerTheme()])
  const query = parseShopQuery(params)
  const filtered = isFiltered(query)
  const navPages = await db.page
    .findMany({ where: { status: 'PUBLISHED', showInNav: true }, orderBy: { sortOrder: 'asc' }, select: { slug: true, title: true, titleEn: true } })
    .catch(() => [])

  // A published theme page placed as the shop landing replaces the default landing (filters keep the listing).
  const placed = !filtered ? await resolvePlacedPage('shop') : null
  if (placed) {
    return <>
      <ThemeHeader context={SHOP_CONTEXT} choice={placed.doc.layout?.header} theme={theme} locale={locale} navPages={navPages} preview={preview} />
      <SectionBarSlot section="shop" />
      <main className="br-page-main"><BuilderRenderer doc={placed.doc} locale={locale} preview={isPreview(preview)} editable={editableFor(preview, placed.meta.id)} /></main>
      <ThemeFooter context={SHOP_CONTEXT} choice={placed.doc.layout?.footer} locale={locale} navPages={navPages} preview={preview} />
    </>
  }

  return <>
    <ThemeHeader context={SHOP_CONTEXT} theme={theme} locale={locale} navPages={navPages} preview={preview} />
    <SectionBarSlot section="shop" searchValue={query.q} />
    <main className="sx-page">
      {filtered ? <Listing query={query} /> : <Landing />}
    </main>
    <ThemeFooter context={SHOP_CONTEXT} locale={locale} navPages={navPages} preview={preview} />
  </>
}

async function Landing() {
  const [home, divisions] = await Promise.all([shopHome(), shopDivisions()])
  const physical = divisions.find((division) => division.kind === 'PHYSICAL'), virtual = divisions.find((division) => division.kind === 'VIRTUAL')
  const circles = home.categories.map((node) => ({ slug: node.slug, name: node.name, image: node.image, icon: node.icon, total: node.total }))
  const empty = !home.newest.length
  return <div className="container sx-landing">
    {home.settings.slides.length > 0
      ? <StoreSlider slides={home.settings.slides} />
      : <section className="sx-intro">
          <div>
            <span className="sx-intro-kicker"><StoreIcon name="store" size={16} />فروشگاه موبوکام</span>
            <h1>هرچه لازم دارید، با ارسال سریع و ضمانت اصالت</h1>
            <p>کالاهای فیزیکی و محصولات دیجیتال را مقایسه کنید، به سبد خرید اضافه کنید و روز و ساعت تحویل را خودتان انتخاب کنید.</p>
            <div className="sx-intro-actions">
              <Link href="/products?sort=bestselling" className="sx-btn is-primary">پرفروش‌ترین‌ها</Link>
              <Link href="/products?discounted=1&sort=discount" className="sx-btn">شگفت‌انگیزها</Link>
            </div>
          </div>
          <ul className="sx-intro-stats" aria-label="فروشگاه در یک نگاه">
            <li><b className="num">{fa(home.categories.reduce((sum, node) => sum + node.total, 0) || home.newest.length)}</b><small>کالای فعال</small></li>
            <li><b className="num">{fa(home.offers.length)}</b><small>پیشنهاد ویژه</small></li>
            <li><b className="num">{fa(home.brands.length)}</b><small>برند</small></li>
          </ul>
        </section>}
    <DivisionPanels divisions={divisions} />
    {home.settings.showCategories && <CategoryCircles categories={circles} />}
    <OfferBand title={home.settings.offerTitle} products={home.offers} />
    <BannerGrid banners={home.settings.banners.slice(0, 2)} />
    <ProductRail title="پرفروش‌ترین کالاها" icon="fire" products={home.bestselling.filter((card) => card.soldCount > 0).length >= 4 ? home.bestselling : []} more="/products?sort=bestselling" ranked />
    <ProductRail title="کالاهای فیزیکی" icon="truck" products={physical && physical.products.length >= 4 ? physical.products : []} more="/products?kind=PHYSICAL" />
    <ProductRail title="محصولات مجازی" icon="bolt" products={virtual && virtual.products.length >= 4 ? virtual.products : []} more="/products?kind=VIRTUAL" />
    {home.rails.map((rail) => <ProductRail key={rail.category.slug} title={rail.category.name} icon="box" products={rail.products} more={`/products?category=${encodeURIComponent(rail.category.slug)}`} />)}
    <BannerGrid banners={home.settings.banners.slice(2, 4)} />
    <BrandStrip brands={home.brands} />
    <ProductRail title="تازه‌ترین کالاها" icon="star" products={home.newest} more="/products?sort=newest&page=1" />
    <ProductRail title="پربازدیدترین‌ها" icon="grid" products={home.popular.filter((card) => card.views > 0).length >= 4 ? home.popular : []} more="/products?sort=views" />
    {empty && <div className="sx-empty"><StoreIcon name="store" size={42} /><b>هنوز کالایی منتشر نشده است</b><small>کالاها را از بخش مدیریت فروشگاه اضافه کنید.</small></div>}
    <TrustStrip />
  </div>
}

function CategoryLinks({ nodes, query, active, depth = 0 }: { nodes: CategoryNode[]; query: ShopQuery; active: string; depth?: number }) {
  if (!nodes.length) return null
  return <ul className={depth ? 'sx-tree-sub' : 'sx-tree'}>{nodes.map((node) => <li key={node.id}>
    <Link href={`/products${shopQueryString(query, { category: node.slug })}`} className={node.slug === active ? 'is-active' : ''} aria-current={node.slug === active ? 'page' : undefined}>
      <span>{node.name}</span><small className="num">{fa(node.total)}</small>
    </Link>
    {depth < 3 && <CategoryLinks nodes={node.children} query={query} active={active} depth={depth + 1} />}
  </li>)}</ul>
}

async function Listing({ query }: { query: ShopQuery }) {
  const result = await shopListing(query)
  const node = result.category?.node
  const title = query.q ? `نتایج جست‌وجو برای «${query.q}»` : node ? node.name : query.discounted ? 'پیشنهادهای شگفت‌انگیز' : 'همهٔ کالاها'
  const unit = iranianUnit(result.currency, 'fa-IR')
  const chips: { label: string; href: string }[] = []
  if (query.q) chips.push({ label: `«${query.q}»`, href: shopQueryString(query, { q: '' }) })
  if (node) chips.push({ label: node.name, href: shopQueryString(query, { category: '' }) })
  for (const slug of query.brands) chips.push({ label: result.brands.find((brand) => brand.slug === slug)?.name || slug, href: shopQueryString(query, { brands: query.brands.filter((item) => item !== slug) }) })
  if (query.min) chips.push({ label: `از ${fa(query.min)} ${unit}`, href: shopQueryString(query, { min: 0 }) })
  if (query.max) chips.push({ label: `تا ${fa(query.max)} ${unit}`, href: shopQueryString(query, { max: 0 }) })
  if (query.available) chips.push({ label: 'فقط کالاهای موجود', href: shopQueryString(query, { available: false }) })
  if (query.discounted) chips.push({ label: 'فقط تخفیف‌دار', href: shopQueryString(query, { discounted: false }) })
  if (query.kind) chips.push({ label: query.kind === 'PHYSICAL' ? 'کالای فیزیکی' : 'محصول دیجیتال', href: shopQueryString(query, { kind: '' }) })

  return <div className="container sx-listing">
    <Crumbs items={[{ label: 'خانه', href: '/' }, { label: 'فروشگاه', href: '/products' }, ...(query.kind ? [{ label: query.kind === 'PHYSICAL' ? 'کالاهای فیزیکی' : 'محصولات مجازی', href: `/products?kind=${query.kind}` }] : []), ...(result.category?.chain || []).map((item, index, chain) => ({ label: item.name, href: index < chain.length - 1 ? `/products?category=${encodeURIComponent(item.slug)}` : undefined })), ...(!node ? [{ label: title }] : [])]} />
    <header className="sx-listing-head">
      <div><h1>{title}</h1>{node?.description && <p>{node.description}</p>}</div>
      <span className="num">{fa(result.total)} کالا</span>
    </header>
    {node && node.children.length > 0 && <nav className="sx-subcats" aria-label="زیردسته‌ها">{node.children.map((child) => <Link key={child.id} href={`/products${shopQueryString(query, { category: child.slug })}`}>
      {child.image ? <img src={child.image} alt="" loading="lazy" /> : <StoreIcon name="box" size={22} />}<span>{child.name}</span>
    </Link>)}</nav>}

    <input type="checkbox" id="sx-filters-toggle" className="sx-filters-toggle" hidden />
    <div className="sx-listing-grid">
      <aside className="sx-filters" aria-label="فیلترها">
        <div className="sx-filters-top"><b><StoreIcon name="filter" size={18} />فیلترها</b>{chips.length > 0 && <Link href="/products">حذف همه</Link>}<label htmlFor="sx-filters-toggle" className="sx-filters-close" aria-label="بستن فیلترها"><StoreIcon name="x" size={20} /></label></div>
        <form action="/products" method="get">
          {query.q && <input type="hidden" name="q" value={query.q} />}
          {query.category && <input type="hidden" name="category" value={query.category} />}
          {query.sort !== 'newest' && <input type="hidden" name="sort" value={query.sort} />}
          <details className="sx-facet" open>
            <summary>دسته‌بندی</summary>
            <Link href={`/products${shopQueryString(query, { category: '' })}`} className={`sx-tree-all${node ? '' : ' is-active'}`}>همهٔ دسته‌ها</Link>
            <CategoryLinks nodes={result.tree} query={query} active={query.category} />
          </details>
          {result.brands.length > 0 && <details className="sx-facet" open>
            <summary>برند</summary>
            <div className="sx-checks">{result.brands.slice(0, 30).map((brand) => <label key={brand.id}>
              <input type="checkbox" name="brand" value={brand.slug} defaultChecked={query.brands.includes(brand.slug)} />
              <span>{brand.name}</span><small className="num">{fa(brand.count)}</small>
            </label>)}</div>
          </details>}
          <details className="sx-facet" open>
            <summary>محدودهٔ قیمت {unit && <small>({unit})</small>}</summary>
            <div className="sx-range">
              <label><span>از</span><input name="min" inputMode="numeric" defaultValue={query.min || ''} placeholder={result.priceBounds.min ? fa(result.priceBounds.min) : '۰'} /></label>
              <label><span>تا</span><input name="max" inputMode="numeric" defaultValue={query.max || ''} placeholder={result.priceBounds.max ? fa(result.priceBounds.max) : ''} /></label>
            </div>
          </details>
          <details className="sx-facet" open>
            <summary>نوع کالا</summary>
            <div className="sx-checks">
              {[['', 'همه'], ['PHYSICAL', 'کالای فیزیکی'], ['VIRTUAL', 'محصول دیجیتال']].map(([value, label]) => <label key={value}><input type="radio" name="kind" value={value} defaultChecked={query.kind === value} /><span>{label}</span></label>)}
            </div>
          </details>
          <div className="sx-switches">
            <label className="sx-switch"><input type="checkbox" name="available" value="1" defaultChecked={query.available} /><span>فقط کالاهای موجود</span></label>
            <label className="sx-switch"><input type="checkbox" name="discounted" value="1" defaultChecked={query.discounted} /><span>فقط کالاهای تخفیف‌دار</span></label>
          </div>
          <button type="submit" className="sx-btn is-primary is-block">اعمال فیلترها</button>
        </form>
      </aside>

      <section className="sx-results" aria-label="نتایج">
        <div className="sx-toolbar">
          <label htmlFor="sx-filters-toggle" className="sx-btn sx-filters-open"><StoreIcon name="filter" size={16} />فیلترها{chips.length > 0 && <span className="num">{fa(chips.length)}</span>}</label>
          <nav className="sx-sorts" aria-label="مرتب‌سازی">
            <span><StoreIcon name="sort" size={16} />مرتب‌سازی:</span>
            {SHOP_SORTS.map((sort) => <Link key={sort.key} href={`/products${shopQueryString(query, { sort: sort.key })}`} className={query.sort === sort.key ? 'is-active' : ''} aria-current={query.sort === sort.key ? 'true' : undefined}>{sort.label}</Link>)}
          </nav>
        </div>
        {chips.length > 0 && <div className="sx-chips">{chips.map((chip) => <Link key={chip.label} href={`/products${chip.href}`} aria-label={`حذف فیلتر ${chip.label}`}>{chip.label}<StoreIcon name="x" size={13} /></Link>)}</div>}
        {result.products.length
          ? <ProductGrid products={result.products} />
          : <div className="sx-empty"><StoreIcon name="filter" size={40} /><b>کالایی با این مشخصات پیدا نشد</b><small>فیلترها را کمتر کنید یا عبارت دیگری جست‌وجو کنید.</small><Link href="/products" className="sx-btn">مشاهدهٔ همهٔ کالاها</Link></div>}
        {result.pages > 1 && <nav className="sx-pager" aria-label="صفحه‌بندی">
          {result.page > 1 && <Link href={`/products${shopQueryString(query, { page: result.page - 1 })}`} rel="prev">قبلی</Link>}
          {Array.from({ length: result.pages }, (_, i) => i + 1).filter((n) => n === 1 || n === result.pages || Math.abs(n - result.page) <= 2).map((n, i, list) => <span key={n} className="sx-pager-item">
            {i > 0 && n - list[i - 1] > 1 && <span className="sx-pager-gap">…</span>}
            <Link href={`/products${shopQueryString(query, { page: n })}`} className={n === result.page ? 'is-active' : ''} aria-current={n === result.page ? 'page' : undefined}>{fa(n)}</Link>
          </span>)}
          {result.page < result.pages && <Link href={`/products${shopQueryString(query, { page: result.page + 1 })}`} rel="next">بعدی</Link>}
        </nav>}
      </section>
    </div>
  </div>
}
