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
import { StoreIcon, type StoreIconName } from '@/components/store/StoreIcons'
import { sized, srcSet } from '@/shared/media/image'
import {
  BannerGrid, BrandStrip, Crumbs, DivisionPanels, OfferBand, ProductGrid, ProductRail, TrustStrip,
} from '@/components/store/Storefront'
import { CategoryGrid, QuickRoutes, ShopHero, TopSellers } from '@/components/store/ShopHome'
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
  const grid = home.categories.filter((node) => node.total > 0).map((node) => ({ slug: node.slug, name: node.name, image: node.image, total: node.total, children: node.children.filter((child) => child.total > 0).map((child) => ({ slug: child.slug, name: child.name })) }))
  const empty = !home.newest.length
  // The hero's stage: up to three distinct products with pictures, offers first.
  const stage = [...home.offers, ...home.bestselling, ...home.newest].filter((card, index, all) => card.image && all.findIndex((other) => other.id === card.id) === index).slice(0, 3)
  const deal = home.offers.find((card) => card.inStock)
  const fresh = home.newest.find((card) => card.id !== deal?.id && card.image) || home.newest.find((card) => card.id !== deal?.id)
  const stats = [
    { label: 'کالای فعال', value: home.categories.reduce((sum, node) => sum + node.total, 0) || home.newest.length },
    { label: 'پیشنهاد ویژه', value: home.offers.length },
    { label: 'برند', value: home.brands.length },
  ].filter((item) => item.value > 0)
  const ranked = home.bestselling.filter((card) => card.soldCount > 0)
  return <div className="container sx-landing">
    <ShopHero slider={home.settings.slides.length > 0 ? <StoreSlider slides={home.settings.slides} /> : null} stage={stage} stats={stats} deal={deal} fresh={fresh} />
    <QuickRoutes />
    {home.settings.showCategories && <CategoryGrid categories={grid} />}
    <OfferBand title={home.settings.offerTitle} products={home.offers} />
    <BannerGrid banners={home.settings.banners.slice(0, 2)} />
    <TopSellers products={ranked.length >= 3 ? ranked : []} />
    <DivisionPanels divisions={divisions} />
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
  const icon: StoreIconName = query.q ? 'filter' : query.discounted ? 'percent' : query.kind === 'VIRTUAL' ? 'bolt' : query.kind === 'PHYSICAL' ? 'truck' : 'grid'
  const parent = result.category && result.category.chain.length > 1 ? result.category.chain[result.category.chain.length - 2] : null
  const kicker = parent ? parent.name : node ? 'دسته‌بندی فروشگاه' : query.q ? 'جست‌وجو در فروشگاه' : 'فروشگاه موبوکام'
  // One tap on or off; the full set stays in the filter panel.
  const quick: { label: string; on: boolean; patch: Partial<ShopQuery>; icon: StoreIconName }[] = [
    { label: 'فقط موجود', on: query.available, patch: { available: !query.available }, icon: 'check' },
    { label: 'تخفیف‌دار', on: query.discounted, patch: { discounted: !query.discounted }, icon: 'percent' },
    { label: 'تحویل آنلاین', on: query.kind === 'VIRTUAL', patch: { kind: query.kind === 'VIRTUAL' ? '' : 'VIRTUAL' }, icon: 'bolt' },
    { label: 'کالای فیزیکی', on: query.kind === 'PHYSICAL', patch: { kind: query.kind === 'PHYSICAL' ? '' : 'PHYSICAL' }, icon: 'truck' },
  ]

  return <div className="container sx-listing">
    <Crumbs items={[{ label: 'خانه', href: '/' }, { label: 'فروشگاه', href: '/products' }, ...(query.kind ? [{ label: query.kind === 'PHYSICAL' ? 'کالاهای فیزیکی' : 'محصولات مجازی', href: `/products?kind=${query.kind}` }] : []), ...(result.category?.chain || []).map((item, index, chain) => ({ label: item.name, href: index < chain.length - 1 ? `/products?category=${encodeURIComponent(item.slug)}` : undefined })), ...(!node ? [{ label: title }] : [])]} />
    <header className={`sx-lhero${node?.image ? ' has-art' : ''}`}>
      <span className="sx-lhero-art">{node?.image ? <img src={sized(node.image, 240)} srcSet={srcSet(node.image, 240)} alt="" decoding="async" /> : <StoreIcon name={icon} size={40} />}</span>
      <div className="sx-lhero-copy">
        <small className="sx-lhero-kicker">{kicker}</small>
        <h1>{title}</h1>
        {node?.description && <p>{node.description}</p>}
        <ul className="sx-lhero-facts">
          <li><b className="num">{fa(result.total)}</b> کالا</li>
          {result.brands.length > 0 && <li><b className="num">{fa(result.brands.length)}</b> برند</li>}
        </ul>
      </div>
    </header>
    {node && node.children.length > 0 && <nav className="sx-subcats" aria-label="زیردسته‌ها">{node.children.map((child) => <Link key={child.id} href={`/products${shopQueryString(query, { category: child.slug })}`}>
      <span className="sx-subcat-art">{child.image ? <img src={sized(child.image, 96)} alt="" loading="lazy" /> : <StoreIcon name="box" size={22} />}</span><span>{child.name}</span><small className="num">{fa(child.total)}</small>
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
          <span className="sx-toolbar-count"><b className="num">{fa(result.total)}</b> کالا</span>
        </div>
        <nav className="sx-qf" aria-label="فیلترهای سریع">{quick.map((item) => <Link key={item.label} href={`/products${shopQueryString(query, item.patch)}`} className={item.on ? 'is-on' : ''} aria-current={item.on ? 'true' : undefined}>
          <StoreIcon name={item.on ? 'check' : item.icon} size={15} />{item.label}
        </Link>)}</nav>
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
