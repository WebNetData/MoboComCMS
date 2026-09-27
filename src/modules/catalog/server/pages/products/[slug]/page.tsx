import Link from 'next/link'
import { isStoreEnabled } from '@/modules/catalog/server/storefront'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import BuyBox from '@/components/store/BuyBox'
import { StoreIcon } from '@/components/store/StoreIcons'
import { Crumbs, ProductRail, TrustStrip } from '@/components/store/Storefront'
import { countProductView, getStoreSettings, relatedProducts } from '@/modules/store/server/catalog'
import { unitPrice } from '@/modules/store/server/pricing'
import { lineLimit } from '@/modules/store/domain/store'
import { getDeliverySettings } from '@/modules/shipping/server/shipping'
import { ItemActionBar } from '@/components/engage/Engagement'
import ProductTabs from '@/components/ProductTabs'
import ProductGallery from '@/components/ProductGallery'
import { attributeFieldsForCategory, parseJson } from '@/modules/catalog/server/product-config'
import { db } from '@/platform/database/prisma'
import { getServerLocale, getServerTheme } from '@/i18n/server'
import { dict } from '@/i18n/config'
import { cleanRichText, richTextToPlain } from '@/shared/content/sanitize'
import { breadcrumbJsonLd, pageMeta, productJsonLd, siteBase } from '@/modules/site/server/seo'
import { formatAmount } from '@/shared/money/format'
import BuilderRenderer from '@/components/content/builder/BuilderRenderer'
import { ThemeFooter, ThemeHeader } from '@/components/content/builder/ThemeChrome'
import { editableFor, isPreview, previewTemplate, resolveBuilderDoc, type BuilderPreview } from '@/modules/site/server/builder-preview'
import { productContext, resolveEntryLayout } from '@/modules/site/server/theme-templates'
import { PRODUCT_SLOT_TYPES, docHasSlotWidget, ensureProductSlots } from '@/modules/site/domain/builder'
import { getViewer } from '@/modules/membership/server/membership'
import { isModuleEnabled } from '@/extensions/server/modules'
import { minorToNumber } from '@/shared/money'
import SectionBarSlot from '@/components/site/SectionBarSlot'


async function loadProduct(slug: string, preview = false) {
  if (!await isStoreEnabled() && !preview) return null
  return db.product.findUnique({ where: { slug }, include: { category: true, brand: true, variants: { orderBy: { id: 'asc' } } } }).catch(() => null)
}

export async function generateMetadata({ params: paramsPromise }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const params = await paramsPromise
  const product = await loadProduct(params.slug)
  if (!product || !product.active) return { title: 'Not found', robots: { index: false, follow: false } }
  const locale = await getServerLocale()
  const isFa = locale === 'fa'
  const name = isFa ? product.name : product.nameEn || product.name
  const raw = isFa ? product.description : product.descriptionEn || product.description
  const activeVariants = product.variants.filter(variant => variant.active)
  const displayPrice = activeVariants.length ? Math.min(...activeVariants.map(variant => variant.price)) : product.price
  return pageMeta({
    title: product.seoTitle || name,
    description: product.seoDescription || product.shortDescription.slice(0, 160) || richTextToPlain(raw, 160) || `${name} — ${formatAmount(displayPrice, product.currency, isFa ? 'fa-IR' : 'en-US')}`,
    path: `/products/${product.slug}`,
    image: product.image || undefined,
    type: 'product',
    locale,
    keywords: [name, isFa ? 'خرید' : 'buy', 'VPN', 'MoboComCMS'],
  })
}

export default async function ProductPage({ params: paramsPromise, preview }: { params: Promise<{ slug: string }>; preview?: BuilderPreview }) {
  const params = await paramsPromise
  const [locale, theme] = await Promise.all([getServerLocale(), getServerTheme()])
  const t = dict(locale)
  const isFa = locale === 'fa'

  const product = await loadProduct(params.slug, isPreview(preview))
  if (!product || (product.active !== true && !isPreview(preview))) notFound()

  const navPages = await db.page
    .findMany({ where: { status: 'PUBLISHED', showInNav: true }, orderBy: { sortOrder: 'asc' }, select: { slug: true, title: true, titleEn: true } })
    .catch(() => [])

  const [reviewCount, reviewScore, questionCount] = await Promise.all([
    db.productReview.count({ where: { productId: product.id, status: 'APPROVED' } }),
    db.productReview.aggregate({ where: { productId: product.id, status: 'APPROVED' }, _avg: { rating: true } }),
    db.productQuestion.count({ where: { productId: product.id, status: 'APPROVED' } }),
  ])
  const builderDoc = await resolveBuilderDoc(preview, `product-${product.id}`)
  const renderContext = await productContext(product.kind, product.categoryId)
  const editingTemplate = previewTemplate(preview, 'single-product')
  const templateDoc = await resolveEntryLayout('product', product.id, renderContext, editingTemplate)
  const builderContext = { productCategoryId: product.categoryId ?? null, currentProductId: product.id }
  const ownEditable = editableFor(preview, `product-${product.id}`)

  const name = isFa ? product.name : product.nameEn || product.name
  const htmlFa = cleanRichText(product.description)
  const htmlEn = cleanRichText(product.descriptionEn || product.description)
  const html = isFa ? htmlFa : htmlEn
  const activeVariants = product.variants.filter(variant => variant.active)
  const fields = await attributeFieldsForCategory(product.categoryId)
  const specificationValues = parseJson<Record<string, string>>(product.specifications, {})
  const highlights = fields.filter(field => !field.variant && specificationValues[field.key]).slice(0, 5)
  const inStock = product.stock !== 0 && (!product.variants.length || activeVariants.some(variant => variant.stock !== 0))
  const base = await siteBase()

  const breadcrumbs = breadcrumbJsonLd(base, [
    { name: isFa ? 'خانه' : 'Home', path: '/' },
    { name: isFa ? 'فروشگاه' : 'Shop', path: '/products' },
    { name, path: `/products/${product.slug}` },
  ])
  const productLd = productJsonLd({
    name,
    description: richTextToPlain(html, 300),
    price: activeVariants.length ? Math.min(...activeVariants.map(variant => variant.price)) : product.price,
    currency: product.currency,
    image: product.image || undefined,
    url: `${base}/products/${product.slug}`,
    inStock,
    rating: reviewScore._avg.rating || 0,
    reviewCount,
  })

  const [viewer, vipOn, storeSettings, related, deliverySettings] = await Promise.all([getViewer(), isModuleEnabled('membership'), getStoreSettings(), relatedProducts(product), getDeliverySettings()])
  if (!isPreview(preview)) countProductView(product.id)
  const regular = unitPrice(product, null, false)
  const variantAxes = fields.filter(field => field.variant).map(field => ({ key: field.key, label: isFa ? field.label : field.labelEn || field.label, color: field.kind === 'color' }))
  const buyVariants = activeVariants.map(variant => {
    const priced = unitPrice(product, variant, false)
    return {
      id: variant.id, name: isFa ? variant.name : variant.nameEn || variant.name, attributes: parseJson<Record<string, string>>(variant.attributes, {}),
      price: minorToNumber(priced.unitMinor, priced.currency), listPrice: priced.listMinor ? minorToNumber(priced.listMinor, priced.currency) : 0,
      memberPrice: vipOn && variant.memberPriceMinor > 0n ? minorToNumber(variant.memberPriceMinor, priced.currency) : 0,
      stock: variant.stock, limit: product.stock === 0 ? 0 : lineLimit(product.stock, variant.stock, product.maxPerOrder),
    }
  })
  const shippingNote = deliverySettings.enabled ? 'ارسال با انتخاب روز و ساعت تحویل' : 'ارسال توسط فروشگاه'
  const galleryNode = <ProductGallery images={[product.image, ...parseJson<string[]>(product.gallery, [])]} alt={name} />
  const infoNode = (
    <div className="sx-pinfo">
      <div className="sx-pinfo-top">
        {product.brand && <Link href={`/products?brand=${encodeURIComponent(product.brand.slug)}`} className="sx-pinfo-brand">{product.brand.name}</Link>}
        {product.category && <Link href={`/products?category=${encodeURIComponent(product.category.slug)}`} className="sx-pinfo-cat">{product.category.name}</Link>}
      </div>
      <h1>{name}</h1>
      {product.nameEn && isFa && <p className="sx-pinfo-en" dir="ltr">{product.nameEn}</p>}
      <div className="sx-pinfo-stats">
        {reviewCount > 0 && <a href="#store-tab-reviews"><StoreIcon name="star" size={15} /><b className="num">{(reviewScore._avg.rating || 0).toLocaleString('fa-IR', { maximumFractionDigits: 1 })}</b><small className="num">({reviewCount.toLocaleString('fa-IR')} دیدگاه)</small></a>}
        {questionCount > 0 && <a href="#store-tab-questions"><StoreIcon name="chevron" size={13} />{questionCount.toLocaleString('fa-IR')} پرسش</a>}
        {product.soldCount > 0 && <span className="num">{product.soldCount.toLocaleString('fa-IR')} فروش</span>}
        {product.kind === 'VIRTUAL' && <span className="sx-pill is-accent"><StoreIcon name="bolt" size={13} />تحویل آنی</span>}
      </div>
      {(product.shortDescription || html) && <p className="sx-pinfo-lead">{product.shortDescription || richTextToPlain(html, 320)}</p>}
      {highlights.length > 0 && <div className="sx-pinfo-specs"><h2>ویژگی‌ها</h2><ul>{highlights.map(field => <li key={field.key}><span>{isFa ? field.label : field.labelEn || field.label}</span><b>{specificationValues[field.key]}</b></li>)}</ul>{fields.some(field => !field.variant && specificationValues[field.key]) && <a href="#store-tab-specifications" className="sx-link">مشاهدهٔ همهٔ مشخصات</a>}</div>}
      <ItemActionBar item={{ type: 'product', id: product.id }} title={name} image={product.image} followLabel="تخفیف و موجودی" />
    </div>
  )
  const purchaseNode = (
    <aside className="sx-pbuy" aria-label="خرید کالا">
      <BuyBox
        productId={product.id} slug={product.slug} kind={product.kind} currency={regular.currency}
        price={minorToNumber(regular.unitMinor, regular.currency)} listPrice={regular.listMinor ? minorToNumber(regular.listMinor, regular.currency) : 0}
        memberPrice={vipOn && product.memberPriceMinor > 0n ? minorToNumber(product.memberPriceMinor, regular.currency) : 0}
        limit={lineLimit(product.stock, null, product.maxPerOrder)} inStock={inStock} lowStockAt={product.lowStockAt || storeSettings.lowStockDefault}
        saleEndsAt={product.saleEndsAt && regular.listMinor ? product.saleEndsAt.toISOString() : null}
        variants={buyVariants} axes={variantAxes}
        vip={{ enabled: vipOn, member: viewer.member, access: product.access, giftDays: vipOn ? product.vipGiftDays : 0 }}
        warranty={product.warranty} badges={storeSettings.badges} shipping={shippingNote}
      />
    </aside>
  )
  const heroNode = (
    <section className={`sx-phero ${product.kind === 'PHYSICAL' ? 'is-physical' : 'is-virtual'}`} aria-label={name}>
      <div className="sx-pgallery">{galleryNode}</div>
      {infoNode}
      {purchaseNode}
    </section>
  )
  const uspNode = <TrustStrip />
  const tabsNode = <ProductTabs slug={product.slug} descriptionFa={htmlFa} descriptionEn={htmlEn} rating={reviewScore._avg.rating || 0} reviewCount={reviewCount} questionCount={questionCount} />
  const slots = {
    'product-hero': heroNode,
    'product-gallery': <div className="store-product-hero-part">{galleryNode}</div>,
    'product-info': infoNode,
    'product-purchase': purchaseNode,
    'product-usp': uspNode,
    'product-tabs': tabsNode,
  }

  // A product's own document with product parts is a full custom layout; otherwise a
  // chosen/matching single-product template; otherwise the default store layout.
  const ownLayout = !editingTemplate && !!builderDoc && builderDoc.mode === 'builder' && PRODUCT_SLOT_TYPES.some(type => docHasSlotWidget(builderDoc, type))
  const layoutDoc = ownLayout ? builderDoc : templateDoc && templateDoc.mode === 'builder' ? templateDoc : null
  const chromeDoc = layoutDoc || builderDoc
  const breadcrumbsNode = <Crumbs items={[{ label: t.shop, href: '/products' }, ...(product.category ? [{ label: product.category.name, href: `/products?category=${encodeURIComponent(product.category.slug)}` }] : []), { label: name }]} />
  const ldNodes = <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productLd) }} />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }} />
  </>
  return (
    <>
      <ThemeHeader context={renderContext} choice={chromeDoc?.layout?.header} theme={theme} locale={locale} navPages={navPages} builderContext={builderContext} preview={preview} />
      <SectionBarSlot section="shop" />
      {layoutDoc ? (
        <main className="store-product-page store-product-built">
          <div className="br-container">{breadcrumbsNode}</div>
          {ldNodes}
          <BuilderRenderer
            doc={ownLayout ? layoutDoc : ensureProductSlots(layoutDoc)}
            locale={locale}
            preview={isPreview(preview)}
            editable={ownLayout ? ownEditable : !!editingTemplate}
            context={builderContext}
            slots={slots}
          />
          {!ownLayout && builderDoc && <div className="store-product-builder"><BuilderRenderer doc={builderDoc} locale={locale} preview={isPreview(preview)} editable={ownEditable} context={builderContext} /></div>}
        </main>
      ) : (
        <main className="container sx-page sx-product store-product-page">
          {breadcrumbsNode}
          {ldNodes}
          {heroNode}
          {uspNode}
          {tabsNode}
          <ProductRail title="کالاهای مشابه" icon="box" products={related} more={product.category ? `/products?category=${encodeURIComponent(product.category.slug)}` : '/products'} />
          {builderDoc && <div className="store-product-builder"><BuilderRenderer doc={builderDoc} locale={locale} preview={isPreview(preview)} editable={ownEditable} context={builderContext} /></div>}
        </main>
      )}
      <ThemeFooter context={renderContext} choice={chromeDoc?.layout?.footer} locale={locale} navPages={navPages} builderContext={builderContext} preview={preview} />
    </>
  )
}
