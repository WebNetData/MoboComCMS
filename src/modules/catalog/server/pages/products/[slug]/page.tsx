import { sectionDisplayName } from '@/modules/site/server/section-names'
import type { CheckoutSurface } from '@/modules/checkout/domain/surface'
import { contentRouteParams } from '@/shared/routing/params'
import Link from '@/components/AppLink'
import ManageBar from '@/components/admin/ManageBar'
import { isStoreEnabled } from '@/modules/catalog/server/storefront'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import BuyBox from '@/components/store/BuyBox'
import { StoreIcon } from '@/components/store/StoreIcons'
import { Crumbs, ProductRail, TrustStrip } from '@/components/store/Storefront'
import { categoryTree, countProductView, findCategory, getStoreSettings, relatedProducts } from '@/modules/store/server/catalog'
import { unitPrice } from '@/modules/store/server/pricing'
import { lineLimit } from '@/modules/store/domain/store'
import { getDeliverySettings } from '@/modules/shipping/server/shipping'
import { ItemActionBar } from '@/components/engage/Engagement'
import ProductTabs from '@/components/ProductTabs'
import ProductBundles from '@/components/store/ProductBundles'
import ProductGallery from '@/components/ProductGallery'
import DeviceCompatibilityLookup from '@/components/store/DeviceCompatibilityLookup'
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
import { customerGatewayLabel, installmentConfig, isInstallmentGateway, listCheckoutGateways } from '@/modules/billing/server/gateways'
import { getLoyaltySettings } from '@/modules/store/server/marketing'
import { productSeller } from '@/modules/marketplace/server/marketplace'
import SellerCard from '@/components/marketplace/SellerCard'
import PromoSlot from '@/components/promo/PromoSlot'
import { safeJsonLd } from '@/shared/seo/json-ld'
import { deliversInstantly } from '@/modules/store/domain/digital-codes'
import { openCurrenciesOf, readOrderFields } from '@/modules/store/domain/order-inputs'
import { opensAudience } from '@/modules/account/server/item-audience'
import { groupDeal } from '@/modules/account/server/user-groups'
import { productFileAccess } from '@/modules/store/server/product-files'
import ProductDownloads from '@/components/store/ProductDownloads'


async function loadProduct(slug: string, preview = false) {
  if (!await isStoreEnabled() && !preview) return null
  return db.product.findUnique({ where: { slug }, include: { category: true, brand: true, variants: { orderBy: { id: 'asc' } } } }).catch(() => null)
}

export async function generateMetadata({ params: paramsPromise }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const params = await contentRouteParams(paramsPromise)
  const product = await loadProduct(params.slug)
  if (!product || !product.active || product.approval !== 'APPROVED' || !await opensAudience(product.audienceGroups, 'product')) return { title: 'Not found', robots: { index: false, follow: false } }
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

export default async function ProductPage({ params: paramsPromise, preview, surface = 'public' }: { params: Promise<{ slug: string }>; preview?: BuilderPreview; surface?: CheckoutSurface }) {
  const params = await contentRouteParams(paramsPromise)
  const [locale, theme] = await Promise.all([getServerLocale(), getServerTheme()])
  const t = dict(locale)
  const isFa = locale === 'fa'

  const product = await loadProduct(params.slug, isPreview(preview))
  if (!product || (!isPreview(preview) && (product.active !== true || product.approval !== 'APPROVED' || !await opensAudience(product.audienceGroups, 'product')))) notFound()

  if (surface === 'dashboard' && product.kind !== 'VIRTUAL') notFound()

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
  renderContext.productId = product.id
  const templateDoc = await resolveEntryLayout('product', product.id, renderContext, editingTemplate)
  const builderContext = { productCategoryId: product.categoryId ?? null, currentProductId: product.id }
  const ownEditable = editableFor(preview, `product-${product.id}`)

  const name = isFa ? product.name : product.nameEn || product.name
  const htmlFa = cleanRichText(product.description)
  const htmlEn = cleanRichText(product.descriptionEn || product.description)
  const html = isFa ? htmlFa : htmlEn
  const conditionLabels: Record<string, string> = { NEW: isFa ? 'نو' : 'New', OPEN_BOX: isFa ? 'جعبه‌باز' : 'Open box', USED: isFa ? 'کارکرده' : 'Used', REFURBISHED: isFa ? 'بازسازی‌شده' : 'Refurbished' }
  const activeVariants = product.variants.filter(variant => variant.active)
  const fields = await attributeFieldsForCategory(product.categoryId)
  const specificationValues = parseJson<Record<string, string>>(product.specifications, {})
  const highlights = fields.filter(field => !field.variant && specificationValues[field.key]).slice(0, 5)
  const inStock = product.stock !== 0 && (!product.variants.length || activeVariants.some(variant => variant.stock !== 0))
  const base = await siteBase()

  // The path of the product: home, the shop, the half it belongs to, the categories above its category, its category, then its name.
  const half = product.kind === 'PHYSICAL' ? { label: isFa ? 'کالاهای فیزیکی' : 'Physical goods', href: '/products?kind=PHYSICAL' } : { label: isFa ? 'محصولات مجازی' : 'Digital products', href: '/products?kind=VIRTUAL' }
  const categoryChain = product.category ? findCategory(await categoryTree(), product.category.slug)?.chain || [] : []
  const trail = [
    { label: isFa ? 'خانه' : 'Home', href: '/' },
    { label: await sectionDisplayName('store', isFa, { fa: 'فروشگاه', en: 'Shop' }), href: '/products' },
    half,
    ...categoryChain.map((node) => ({ label: node.name, href: `${half.href}&category=${encodeURIComponent(node.slug)}` })),
  ]
  const breadcrumbs = breadcrumbJsonLd(base, [...trail.map((step) => ({ name: step.label, path: step.href })), { name, path: `/products/${product.slug}` }])
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

  const [viewer, vipOn, storeSettings, related, deliverySettings, checkoutGateways, loyalty] = await Promise.all([getViewer(), isModuleEnabled('membership'), getStoreSettings(), relatedProducts(product), getDeliverySettings(), listCheckoutGateways(product.currency).catch(() => []), getLoyaltySettings()])
  const installments = checkoutGateways.filter((gateway) => isInstallmentGateway(gateway.provider)).map((gateway) => ({ label: customerGatewayLabel(gateway), count: installmentConfig(gateway.config).installments }))
  if (!isPreview(preview)) countProductView(product.id)
  const deal = await groupDeal(viewer.userId, [product.id])
  const regular = unitPrice(product, null, viewer.member, undefined, deal)
  const vipQuote = unitPrice(product, null, true, undefined, deal)
  const fileAccess = product.digitalMode === 'FILES' ? await productFileAccess(product.id, viewer.userId) : null
  const variantAxes = fields.filter(field => field.variant).map(field => ({ key: field.key, label: isFa ? field.label : field.labelEn || field.label, color: field.kind === 'color' }))
  const buyVariants = activeVariants.map(variant => {
    const priced = unitPrice(product, variant, viewer.member, undefined, deal)
    const vipVariant = unitPrice(product, variant, true, undefined, deal)
    return {
      id: variant.id, name: isFa ? variant.name : variant.nameEn || variant.name, attributes: parseJson<Record<string, string>>(variant.attributes, {}),
      price: minorToNumber(priced.unitMinor, priced.currency), listPrice: priced.listMinor ? minorToNumber(priced.listMinor, priced.currency) : 0,
      memberPrice: vipOn && vipVariant.unitMinor > 0n ? minorToNumber(vipVariant.unitMinor, priced.currency) : 0,
      stock: variant.stock, limit: product.stock === 0 ? 0 : lineLimit(product.stock, variant.stock, product.maxPerOrder), image: variant.image || undefined,
    }
  })
  const shippingNote = deliverySettings.enabled ? 'ارسال با انتخاب روز و ساعت تحویل' : 'ارسال توسط فروشگاه'
  const galleryNode = <ProductGallery images={[product.image, ...parseJson<string[]>(product.gallery, [])]} alt={name} productId={product.id} />
  const conditionNode = product.kind === 'PHYSICAL' ? <section className="sx-pinfo-specs" aria-labelledby="product-condition-title"><h2 id="product-condition-title">{isFa ? 'وضعیت و سلامت کالا' : 'Condition and item health'}</h2><ul><li><span>{isFa ? 'وضعیت' : 'Condition'}</span><b>{conditionLabels[product.condition] || product.condition}</b></li>{product.condition !== 'NEW' && product.conditionGrade && <li><span>{isFa ? 'درجهٔ ظاهری' : 'Grade'}</span><b>{product.conditionGrade}</b></li>}</ul>{product.condition !== 'NEW' && product.conditionNotes && <p>{product.conditionNotes}</p>}{product.condition !== 'NEW' && product.healthReport && <p>{product.healthReport}</p>}</section> : null
  const infoNode = (
    <div className="sx-pinfo">
      <div className="sx-pinfo-top">
        {product.brand && <Link href={`/products?brand=${encodeURIComponent(product.brand.slug)}`} className="sx-pinfo-brand">{product.brand.name}</Link>}
        {product.category && <Link href={`/products?category=${encodeURIComponent(product.category.slug)}`} className="sx-pinfo-cat">{product.category.name}</Link>}
      </div>
      <h1>{name}</h1>
      {product.nameEn && isFa && <p className="sx-pinfo-en" dir="ltr">{product.nameEn}</p>}
      {conditionNode}
      {product.kind === 'PHYSICAL' && <DeviceCompatibilityLookup slug={product.slug} isFa={isFa} />}
      <div className="sx-pinfo-stats">
        {reviewCount > 0 && <a href="#store-tab-reviews"><StoreIcon name="star" size={15} /><b className="num">{(reviewScore._avg.rating || 0).toLocaleString('fa-IR', { maximumFractionDigits: 1 })}</b><small className="num">({reviewCount.toLocaleString('fa-IR')} دیدگاه)</small></a>}
        {questionCount > 0 && <a href="#store-tab-questions"><StoreIcon name="chevron" size={13} />{questionCount.toLocaleString('fa-IR')} پرسش</a>}
        {product.soldCount > 0 && <span className="num">{product.soldCount.toLocaleString('fa-IR')} فروش</span>}
        {product.kind === 'VIRTUAL' && <span className="sx-pill is-accent"><StoreIcon name="bolt" size={13} />{deliversInstantly(product) ? 'تحویل آنی' : 'تحویل دیجیتال'}</span>}
      </div>
      {(product.shortDescription || html) && <p className="sx-pinfo-lead">{product.shortDescription || richTextToPlain(html, 320)}</p>}
      {highlights.length > 0 && <div className="sx-pinfo-specs"><h2>ویژگی‌ها</h2><ul>{highlights.map(field => <li key={field.key}><span>{isFa ? field.label : field.labelEn || field.label}</span><b>{specificationValues[field.key]}</b></li>)}</ul>{fields.some(field => !field.variant && specificationValues[field.key]) && <a href="#store-tab-specifications" className="sx-link">مشاهدهٔ همهٔ مشخصات</a>}</div>}
      <ItemActionBar item={{ type: 'product', id: product.id }} title={name} image={product.image} followLabel="تخفیف و موجودی" />
    </div>
  )
  const seller = await productSeller(product.id)
  const purchaseNode = (
    <aside className="sx-pbuy" id="product-purchase" aria-label="خرید کالا">
      <BuyBox surface={surface}
        seller={seller ? { name: seller.shopName, label: seller.performance.label, href: `/shop/${seller.slug}` } : null}
        productId={product.id} slug={product.slug} kind={product.kind} instant={deliversInstantly(product)} currency={regular.currency}
        price={minorToNumber(regular.unitMinor, regular.currency)} listPrice={regular.listMinor ? minorToNumber(regular.listMinor, regular.currency) : 0}
        memberPrice={vipOn && vipQuote.unitMinor > 0n ? minorToNumber(vipQuote.unitMinor, regular.currency) : 0}
        fileAccess={fileAccess ? { open: fileAccess.open, reason: fileAccess.reason, count: fileAccess.files.length } : undefined}
        vipFree={vipOn && vipQuote.unitMinor === 0n}
        limit={lineLimit(product.stock, null, product.maxPerOrder)} inStock={inStock && (product.digitalMode !== 'FILES' || !!fileAccess?.files.length)} lowStockAt={product.lowStockAt || storeSettings.lowStockDefault}
        saleEndsAt={product.saleEndsAt && regular.listMinor ? product.saleEndsAt.toISOString() : null}
        variants={buyVariants} axes={variantAxes}
        vip={{ enabled: vipOn, member: viewer.member, access: product.access, giftDays: vipOn ? product.vipGiftDays : 0 }}
        warranty={product.warranty} badges={storeSettings.badges} shipping={shippingNote}
        installments={installments} club={loyalty.enabled && loyalty.earnPoints > 0 ? { earnPoints: loyalty.earnPoints, earnStepToman: loyalty.earnStepToman } : null}
        orderFields={readOrderFields(product.orderFields)}
        open={product.openAmount ? { currencies: openCurrenciesOf(product), min: product.openMinMinor > 0n ? (Number(product.openMinMinor) / 100).toString() : '', max: product.openMaxMinor > 0n ? (Number(product.openMaxMinor) / 100).toString() : '' } : null}
      />
      {seller && <SellerCard seller={seller} />}
    </aside>
  )
  if (surface === 'dashboard') return <section className="do-detail sx-product"><div className="do-summary"><h1>{name}</h1>{product.shortDescription && <p>{product.shortDescription}</p>}<div dangerouslySetInnerHTML={{ __html: html }} />{fileAccess && <ProductDownloads access={fileAccess} slug={product.slug} title={name} />}</div>{purchaseNode}</section>

  const heroNode = (
    <section className={`sx-phero ${product.kind === 'PHYSICAL' ? 'is-physical' : 'is-virtual'}`} aria-label={name}>
      <div className="sx-pgallery">{galleryNode}</div>
      {infoNode}
      {purchaseNode}
    </section>
  )
  const uspNode = <TrustStrip />
  const tabsNode = <>{fileAccess && <ProductDownloads access={fileAccess} slug={product.slug} title={name} />}{storeSettings.showProductBundles && <ProductBundles slug={product.slug} />}<ProductTabs slug={product.slug} descriptionFa={htmlFa} descriptionEn={htmlEn} rating={reviewScore._avg.rating || 0} reviewCount={reviewCount} questionCount={questionCount} showPriceHistory={storeSettings.showPriceHistory} showFrequentlyBoughtTogether={storeSettings.showFrequentlyBoughtTogether} showProductRelationships={storeSettings.showProductRelationships} historyVariants={buyVariants.map(({ id, name }) => ({ id, name }))} /></>
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
  const breadcrumbsNode = <Crumbs items={[...trail, { label: name }]} />
  const ldNodes = <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(productLd) }} />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbs) }} />
  </>
  return (
    <>
      {!isPreview(preview) && <ManageBar title="مدیریت محصول" anyOf={['cms.products']} links={[{ href: `/admin/store/products/${product.id}`, label: 'ویرایش محصول' }, { href: '/admin/store/products', label: 'همهٔ محصولات' }]} />}
      <ThemeHeader context={renderContext} choice={chromeDoc?.layout?.header} theme={theme} locale={locale} navPages={navPages} builderContext={builderContext} preview={preview} />
      <SectionBarSlot section="shop" />
      {layoutDoc ? (
        <main className="store-product-page store-product-built">
          <div className="br-container">{breadcrumbsNode}</div>
          {ldNodes}
          <BuilderRenderer
            values={{ title: product.name, cover: product.image || '', url: `/products/${product.slug}`, kind: product.kind }} doc={ownLayout ? layoutDoc : ensureProductSlots(layoutDoc)}
            locale={locale}
            preview={isPreview(preview)}
            editable={ownLayout ? ownEditable : !!editingTemplate}
            context={builderContext}
            slots={slots}
          />
          {fileAccess && !docHasSlotWidget(layoutDoc, 'product-tabs') && <div className="br-container"><ProductDownloads access={fileAccess} slug={product.slug} title={name} /></div>}
          {!ownLayout && builderDoc && <div className="store-product-builder"><BuilderRenderer doc={builderDoc} locale={locale} preview={isPreview(preview)} editable={ownEditable} context={builderContext} /></div>}
        </main>
      ) : (
        <main className="container sx-page sx-product store-product-page">
          {breadcrumbsNode}
          {ldNodes}
          <PromoSlot placement="content-top" />
          {heroNode}
          {uspNode}
          {tabsNode}
          <PromoSlot placement="content-bottom" />
          <ProductRail title="کالاهای مشابه" icon="box" products={related} more={product.category ? `/products?category=${encodeURIComponent(product.category.slug)}` : '/products'} />
          {builderDoc && <div className="store-product-builder"><BuilderRenderer doc={builderDoc} locale={locale} preview={isPreview(preview)} editable={ownEditable} context={builderContext} /></div>}
        </main>
      )}
      <ThemeFooter context={renderContext} choice={chromeDoc?.layout?.footer} locale={locale} navPages={navPages} builderContext={builderContext} preview={preview} />
    </>
  )
}
