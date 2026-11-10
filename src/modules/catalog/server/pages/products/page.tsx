import { sectionDisplayName } from '@/modules/site/server/section-names'
import Link from '@/components/AppLink'
import { notFound } from 'next/navigation'
import { isStoreEnabled } from '@/modules/catalog/server/storefront'
import BuilderRenderer from '@/components/content/builder/BuilderRenderer'
import { ThemeFooter, ThemeHeader } from '@/components/content/builder/ThemeChrome'
import { resolvePlacedPage } from '@/modules/site/server/theme-templates'
import type { ReactNode } from 'react'
import ThemeFrame from '@/components/content/builder/ThemeFrame'
import { editableFor, isPreview, type BuilderPreview } from '@/modules/site/server/builder-preview'
import { db } from '@/platform/database/prisma'
import { getServerLocale, getServerTheme } from '@/i18n/server'
import SectionBarSlot from '@/components/site/SectionBarSlot'
import StoreSlider from '@/components/store/StoreSlider'
import { StoreIcon, type StoreIconName } from '@/components/store/StoreIcons'
import { sized, srcSet } from '@/shared/media/image'
import {
  BannerGrid, BrandStrip, Crumbs, DIGITAL_TRUST, OfferBand, ProductGrid, ProductRail, TrustStrip,
} from '@/components/store/Storefront'
import { CategoryGrid, QuickRoutes, ShopHero, StoreDoors, TopSellers, divisionCopy } from '@/components/store/ShopHome'
import { FileStoreDoor } from '@/components/store/ProductDownloads'
import { FacetFind, FilterAutoApply, PriceSlider } from '@/components/store/ShopFilters'
import { colorSwatch } from '@/modules/store/domain/colors'
import { shopDivisionHome, shopDivisions, shopHome, shopListing, type CategoryNode, type ProductCard } from '@/modules/store/server/catalog'
import { SHOP_SORTS, SPEC_PARAM, isFiltered, isStoreFront, parseShopQuery, shopQueryString, type ShopQuery } from '@/modules/store/domain/store'
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
      {isStoreFront(query) && query.kind ? <StoreFront kind={query.kind} /> : filtered ? <ShopArchive query={query} locale={locale === 'fa' ? 'fa' : 'en'}><Listing query={query} /></ShopArchive> : <Landing />}
    </main>
    <ThemeFooter context={SHOP_CONTEXT} locale={locale} navPages={navPages} preview={preview} />
  </>
}

/** A filtered shop listing inside the archive theme template that matches its category, when one is published. */
async function ShopArchive({ query, locale, children }: { query: ShopQuery; locale: 'fa' | 'en'; children: ReactNode }) {
  const nodes = query.category ? await db.productCategory.findMany({ select: { id: true, slug: true, name: true, parentId: true } }).catch(() => []) : []
  const ancestry: number[] = []
  for (let node = nodes.find((c) => c.slug === query.category); node && !ancestry.includes(node.id); node = nodes.find((c) => c.id === node!.parentId)) ancestry.push(node.id)
  const current = nodes.find((c) => c.slug === query.category)
  const title = current?.name || (query.q ? (locale === 'fa' ? `نتایج «${query.q}»` : `Results for “${query.q}”`) : locale === 'fa' ? 'فروشگاه' : 'Shop')
  return <ThemeFrame type="archive" locale={locale} context={{ route: 'archive', archiveOf: 'products', archiveCategoryIds: ancestry }} values={{ title }}>{children}</ThemeFrame>
}

const STORE_NAME = { VIRTUAL: 'فروشگاه دیجیتال', PHYSICAL: 'فروشگاه فیزیکی' } as const
const unique = (cards: ProductCard[]) => cards.filter((card, index, all) => all.findIndex((other) => other.id === card.id) === index)

/** The shop's front: two doors (digital and physical), then what is worth seeing across both. */
async function Landing() {
  const [home, divisions] = await Promise.all([shopHome(), shopDivisions()])
  const physical = divisions.find((division) => division.kind === 'PHYSICAL'), virtual = divisions.find((division) => division.kind === 'VIRTUAL')
  const grid = home.categories.filter((node) => node.total > 0).map((node) => ({ slug: node.slug, name: node.name, image: node.image, total: node.total, children: node.children.filter((child) => child.total > 0).map((child) => ({ slug: child.slug, name: child.name })) }))
  const empty = !home.newest.length
  const ranked = home.bestselling.filter((card) => card.soldCount > 0)
  return <div className="container sx-landing">
    {home.settings.slides.length > 0 && <StoreSlider slides={home.settings.slides} />}
    <header className="sx-gate-head">
      <h1>فروشگاه موبوکام</h1>
      <p>دو فروشگاه در یک جا: محصولات دیجیتال با تحویل آنلاین، و کالای فیزیکی با ارسال به سراسر کشور.</p>
    </header>
    <StoreDoors divisions={divisions} />
    <FileStoreDoor settings={home.settings} />
    <QuickRoutes />
    {home.settings.showCategories && <CategoryGrid categories={grid} />}
    <OfferBand title={home.settings.offerTitle} products={home.offers} />
    <BannerGrid banners={home.settings.banners.slice(0, 2)} />
    <TopSellers products={ranked.length >= 3 ? ranked : []} />
    <ProductRail title="برگزیده‌های فروشگاه دیجیتال" icon="bolt" products={virtual && virtual.products.length >= 4 ? virtual.products : []} more="/products?kind=VIRTUAL" />
    <ProductRail title="برگزیده‌های فروشگاه فیزیکی" icon="truck" products={physical && physical.products.length >= 4 ? physical.products : []} more="/products?kind=PHYSICAL" />
    {home.rails.map((rail) => <ProductRail key={rail.category.slug} title={rail.category.name} icon="box" products={rail.products} more={`/products?category=${encodeURIComponent(rail.category.slug)}`} />)}
    <BannerGrid banners={home.settings.banners.slice(2, 4)} />
    <BrandStrip brands={home.brands} />
    <ProductRail title="تازه‌ترین کالاها" icon="star" products={home.newest} more="/products?sort=newest&page=1" />
    <ProductRail title="پربازدیدترین‌ها" icon="grid" products={home.popular.filter((card) => card.views > 0).length >= 4 ? home.popular : []} more="/products?sort=views" />
    {empty && <div className="sx-empty"><StoreIcon name="store" size={42} /><b>هنوز کالایی منتشر نشده است</b><small>کالاها را از بخش مدیریت فروشگاه اضافه کنید.</small></div>}
    <TrustStrip />
  </div>
}

/** One half of the shop as a store of its own: its hero and search, categories, offers, best sellers and brands. */
async function StoreFront({ kind }: { kind: 'PHYSICAL' | 'VIRTUAL' }) {
  const home = await shopDivisionHome(kind)
  const copy = divisionCopy(kind), base = `/products?kind=${kind}`
  const tone = kind === 'VIRTUAL' ? 'digital' : 'physical'
  const stage = unique([...home.offers, ...home.bestselling, ...home.newest]).filter((card) => card.image).slice(0, 3)
  const deal = home.offers.find((card) => card.inStock)
  const fresh = home.newest.find((card) => card.id !== deal?.id && card.image) || home.newest.find((card) => card.id !== deal?.id)
  const stats = [
    { label: kind === 'VIRTUAL' ? 'محصول دیجیتال' : 'کالای فیزیکی', value: home.division.total },
    { label: 'دسته‌بندی', value: home.division.categories.length },
    { label: 'پیشنهاد ویژه', value: home.offers.length },
  ].filter((item) => item.value > 0)
  const grid = home.division.categories.map((category) => ({ slug: category.slug, name: category.name, image: category.image, total: category.total, children: category.children }))
  const ranked = home.bestselling.filter((card) => card.soldCount > 0)
  return <div className={`container sx-landing sx-store is-${tone}`}>
    {kind === 'VIRTUAL' && <FileStoreDoor settings={home.settings} />}
    <Crumbs items={[{ label: 'خانه', href: '/' }, { label: await sectionDisplayName('store', true, { fa: 'فروشگاه', en: 'Shop' }), href: '/products' }, { label: STORE_NAME[kind] }]} />
    <ShopHero slider={null} stage={stage} stats={stats} deal={deal} fresh={fresh} copy={copy.hero} tone={tone} />
    <QuickRoutes items={copy.quick} />
    <CategoryGrid categories={grid} base={base} />
    <OfferBand title={kind === 'VIRTUAL' ? 'شگفت‌انگیزهای دیجیتال' : 'شگفت‌انگیزهای فیزیکی'} products={home.offers} />
    <TopSellers products={ranked.length >= 3 ? ranked : []} more={`${base}&sort=bestselling`} title={kind === 'VIRTUAL' ? 'پرفروش‌ترین محصولات دیجیتال' : 'پرفروش‌ترین کالاهای فیزیکی'} />
    {home.rails.map((rail) => <ProductRail key={rail.category.slug} title={rail.category.name} icon="box" products={rail.products} more={`${base}&category=${encodeURIComponent(rail.category.slug)}`} />)}
    <BrandStrip brands={home.brands} />
    <ProductRail title="تازه‌ها" icon="star" products={home.newest} more={`${base}&sort=newest&page=1`} />
    <ProductRail title="پربازدیدها" icon="grid" products={home.popular.filter((card) => card.views > 0).length >= 4 ? home.popular : []} more={`${base}&sort=views`} />
    {!home.division.total && <div className="sx-empty"><StoreIcon name={kind === 'VIRTUAL' ? 'bolt' : 'truck'} size={42} /><b>هنوز کالایی در {STORE_NAME[kind]} منتشر نشده است</b><Link href={copy.other.href} className="sx-btn">{copy.other.label}</Link></div>}
    <Link href={copy.other.href} className="sx-store-switch"><StoreIcon name={kind === 'VIRTUAL' ? 'truck' : 'bolt'} size={22} /><span><small>به فروشگاه دیگر سر بزنید</small><b>{copy.other.label}</b></span><StoreIcon name="chevron" size={18} /></Link>
    <TrustStrip items={kind === 'VIRTUAL' ? DIGITAL_TRUST : undefined} />
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
  const rootKind = result.category?.chain[0]?.kind
  const storeKind = query.kind || (rootKind === 'PHYSICAL' || rootKind === 'VIRTUAL' ? rootKind : '')
  const title = query.q ? `نتایج جست‌وجو برای «${query.q}»` : node ? node.name : query.files ? 'فروشگاه فایل' : query.discounted ? 'پیشنهادهای شگفت‌انگیز' : query.kind === 'VIRTUAL' ? 'همهٔ محصولات دیجیتال' : query.kind === 'PHYSICAL' ? 'همهٔ کالاهای فیزیکی' : 'همهٔ کالاها'
  // Inside one store the category tree holds that store's categories only.
  const tree = query.kind ? result.tree.filter((item) => (item.kind === query.kind || item.kind === '') && item.total > 0) : result.tree
  const home = query.kind ? `/products?kind=${query.kind}` : '/products'
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
  if (query.rating) chips.push({ label: `امتیاز ${fa(query.rating)} به بالا`, href: shopQueryString(query, { rating: 0 }) })
  if (query.instant) chips.push({ label: 'تحویل آنی', href: shopQueryString(query, { instant: false }) })
  if (query.files) chips.push({ label: 'فایل‌های دانلودی', href: shopQueryString(query, { files: false }) })
  for (const [key, values] of Object.entries(query.specs)) for (const value of values) {
    const facet = result.specFacets.find((item) => item.key === key)
    const rest = values.filter((item) => item !== value)
    const specs = { ...query.specs }; if (rest.length) specs[key] = rest; else delete specs[key]
    chips.push({ label: `${facet?.label || key}: ${value}`, href: shopQueryString(query, { specs }) })
  }
  const icon: StoreIconName = query.q ? 'filter' : query.discounted ? 'percent' : query.kind === 'VIRTUAL' ? 'bolt' : query.kind === 'PHYSICAL' ? 'truck' : 'grid'
  const parent = result.category && result.category.chain.length > 1 ? result.category.chain[result.category.chain.length - 2] : null
  const kicker = parent ? parent.name : node ? (storeKind ? STORE_NAME[storeKind] : 'دسته‌بندی فروشگاه') : query.q ? 'جست‌وجو در فروشگاه' : storeKind ? STORE_NAME[storeKind] : 'فروشگاه موبوکام'
  // One tap on or off; the full set stays in the filter panel.
  const quick: { label: string; on: boolean; patch: Partial<ShopQuery>; icon: StoreIconName }[] = [
    { label: 'فقط موجود', on: query.available, patch: { available: !query.available }, icon: 'check' },
    { label: 'تخفیف‌دار', on: query.discounted, patch: { discounted: !query.discounted }, icon: 'percent' },
    ...(storeKind !== 'PHYSICAL' && (result.toggles.instant > 0 || query.instant) ? [{ label: 'تحویل آنی', on: query.instant, patch: { instant: !query.instant }, icon: 'bolt' as StoreIconName }] : []),
    { label: '۴ ستاره به بالا', on: query.rating === 4, patch: { rating: query.rating === 4 ? 0 : 4 }, icon: 'star' },
    { label: 'فایل‌های دانلودی', on: !!query.files, patch: { files: !query.files, kind: 'VIRTUAL' }, icon: 'bolt' },
    { label: 'تحویل آنلاین', on: query.kind === 'VIRTUAL', patch: { kind: query.kind === 'VIRTUAL' ? '' : 'VIRTUAL' }, icon: 'bolt' },
    { label: 'کالای فیزیکی', on: query.kind === 'PHYSICAL', patch: { kind: query.kind === 'PHYSICAL' ? '' : 'PHYSICAL' }, icon: 'truck' },
  ]

  return <div className="container sx-listing">
    <Crumbs items={[{ label: 'خانه', href: '/' }, { label: await sectionDisplayName('store', true, { fa: 'فروشگاه', en: 'Shop' }), href: '/products' }, ...(storeKind ? [{ label: STORE_NAME[storeKind], href: `/products?kind=${storeKind}` }] : []), ...(result.category?.chain || []).map((item, index, chain) => ({ label: item.name, href: index < chain.length - 1 ? `/products?category=${encodeURIComponent(item.slug)}` : undefined })), ...(!node ? [{ label: title }] : [])]} />
    <header className={`sx-lhero${node?.image ? ' has-art' : ''}${storeKind ? ` is-${storeKind === 'VIRTUAL' ? 'digital' : 'physical'}` : ''}`}>
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
    {node && node.children.some((child) => child.total > 0) && <nav className="sx-subcats" aria-label="زیردسته‌ها">{node.children.filter((child) => child.total > 0).map((child) => <Link key={child.id} href={`/products${shopQueryString(query, { category: child.slug })}`}>
      <span className="sx-subcat-art">{child.image ? <img src={sized(child.image, 96)} alt="" loading="lazy" /> : <StoreIcon name="box" size={22} />}</span><span>{child.name}</span><small className="num">{fa(child.total)}</small>
    </Link>)}</nav>}

    <input type="checkbox" id="sx-filters-toggle" className="sx-filters-toggle" hidden />
    <div className="sx-listing-grid">
      <aside className="sx-filters" aria-label="فیلترها">
        <div className="sx-filters-top"><b><StoreIcon name="filter" size={18} />فیلترها</b>{chips.length > 0 && <Link href={home}>حذف همه</Link>}<label htmlFor="sx-filters-toggle" className="sx-filters-close" aria-label="بستن فیلترها"><StoreIcon name="x" size={20} /></label></div>
        <form action="/products" method="get" id="sx-filter-form">
          {query.q && <input type="hidden" name="q" value={query.q} />}
          {query.category && <input type="hidden" name="category" value={query.category} />}
          {query.sort !== 'newest' && <input type="hidden" name="sort" value={query.sort} />}
          <details className="sx-facet" open>
            <summary>دسته‌بندی</summary>
            <Link href={`/products${shopQueryString(query, { category: '' })}`} className={`sx-tree-all${node ? '' : ' is-active'}`}>همهٔ دسته‌ها</Link>
            <CategoryLinks nodes={tree} query={query} active={query.category} />
          </details>
          {result.brands.length > 0 && <details className="sx-facet" open>
            <summary>برند {query.brands.length > 0 && <small className="sx-facet-on num">{fa(query.brands.length)}</small>}</summary>
            {result.brands.length > 8 && <FacetFind target="sx-brand-list" label="جست‌وجوی برند" />}
            <div className="sx-checks" id="sx-brand-list">{result.brands.slice(0, 30).map((brand) => <label key={brand.id}>
              <input type="checkbox" name="brand" value={brand.slug} defaultChecked={query.brands.includes(brand.slug)} />
              <span>{brand.name}</span><small className="num">{fa(brand.count)}</small>
            </label>)}</div>
          </details>}
          <details className="sx-facet" open>
            <summary>محدودهٔ قیمت {unit && <small>({unit})</small>}</summary>
            {result.priceRange ? <PriceSlider formId="sx-filter-form" min={result.priceRange.min} max={result.priceRange.max} from={query.min} to={query.max} unit={unit} /> : <div className="sx-range">
              <label><span>از</span><input name="min" inputMode="numeric" defaultValue={query.min || ''} placeholder={result.priceBounds.min ? fa(result.priceBounds.min) : '۰'} /></label>
              <label><span>تا</span><input name="max" inputMode="numeric" defaultValue={query.max || ''} placeholder={result.priceBounds.max ? fa(result.priceBounds.max) : ''} /></label>
            </div>}
            {result.priceSteps.length > 0 && <div className="sx-price-steps">{result.priceSteps.map((step) => {
              const on = query.min === step.min && query.max === step.max
              return <Link key={`${step.min}-${step.max}`} href={`/products${shopQueryString(query, on ? { min: 0, max: 0 } : { min: step.min, max: step.max })}`} className={on ? 'is-on' : ''} aria-current={on ? 'true' : undefined}>
                {step.min && step.max ? `${fa(step.min)} تا ${fa(step.max)}` : step.max ? `تا ${fa(step.max)}` : `از ${fa(step.min)}`}
              </Link>
            })}</div>}
          </details>
          {result.specFacets.map((facet) => <details key={facet.key} className="sx-facet" open={!!query.specs[facet.key] || result.specFacets.indexOf(facet) < 3}>
            <summary>{facet.label} {query.specs[facet.key] && <small className="sx-facet-on num">{fa(query.specs[facet.key].length)}</small>}</summary>
            {facet.values.length > 8 && <FacetFind target={`sx-spec-${facet.key}`} label={`جست‌وجو در ${facet.label}`} />}
            <div className="sx-checks" id={`sx-spec-${facet.key}`}>{facet.values.map((item) => <label key={item.value} className={item.count ? '' : 'is-empty'}>
              <input type="checkbox" name={`${SPEC_PARAM}${facet.key}`} value={item.value} defaultChecked={query.specs[facet.key]?.includes(item.value)} />
              {facet.color && <i className="sx-dot" style={{ background: colorSwatch(item.value) || 'var(--sx-subtle)' }} aria-hidden="true" />}<span>{item.value}</span><small className="num">{fa(item.count)}</small>
            </label>)}</div>
          </details>)}
          <details className="sx-facet" open={!!query.rating}>
            <summary>امتیاز خریداران</summary>
            <div className="sx-checks">
              {([[0, 'همه', 0], [4, '۴ ستاره و بالاتر', result.toggles.rating4], [3, '۳ ستاره و بالاتر', result.toggles.rating3]] as const).map(([value, label, count]) => <label key={value}>
                <input type="radio" name="rating" value={value || ''} defaultChecked={query.rating === value} />
                <span>{value ? <><span className="sx-stars-mini" aria-hidden="true">{'★'.repeat(value)}</span>{label}</> : label}</span>{value > 0 && <small className="num">{fa(count)}</small>}
              </label>)}
            </div>
          </details>
          <details className="sx-facet" open>
            <summary>نوع کالا</summary>
            <div className="sx-checks">
              {[['', 'همه'], ['PHYSICAL', 'کالای فیزیکی'], ['VIRTUAL', 'محصول دیجیتال']].map(([value, label]) => <label key={value}><input type="radio" name="kind" value={value} defaultChecked={query.kind === value} /><span>{label}</span></label>)}
            </div>
          </details>
          <div className="sx-switches">
            {storeKind !== 'PHYSICAL' && <label className="sx-switch"><input type="checkbox" name="files" value="1" defaultChecked={query.files} /><span>فقط فایل‌های دانلودی</span></label>}
            <label className="sx-switch"><input type="checkbox" name="available" value="1" defaultChecked={query.available} /><span>فقط کالاهای موجود</span><small className="num">{fa(result.toggles.available)}</small></label>
            <label className="sx-switch"><input type="checkbox" name="discounted" value="1" defaultChecked={query.discounted} /><span>فقط کالاهای تخفیف‌دار</span><small className="num">{fa(result.toggles.discounted)}</small></label>
            {storeKind !== 'PHYSICAL' && (result.toggles.instant > 0 || query.instant) && <label className="sx-switch"><input type="checkbox" name="instant" value="1" defaultChecked={query.instant} /><span>فقط تحویل آنی</span><small className="num">{fa(result.toggles.instant)}</small></label>}
          </div>
          <button type="submit" className="sx-btn is-primary is-block">اعمال فیلترها</button>
        </form>
        <FilterAutoApply formId="sx-filter-form" />
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
