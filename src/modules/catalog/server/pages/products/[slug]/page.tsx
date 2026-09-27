import Link from 'next/link'
import { isStoreEnabled } from '@/modules/catalog/server/storefront'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import ProductBuy from '@/components/ProductBuy'
import { ItemActionBar } from '@/components/engage/Engagement'
import ProductTabs from '@/components/ProductTabs'
import ProductGallery from '@/components/ProductGallery'
import { Breadcrumbs } from '@/components/content/ContentPrimitives'
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
import { legacyNumber } from '@/shared/money'


async function loadProduct(slug: string, preview = false) {
  if (!await isStoreEnabled() && !preview) return null
  return db.product.findUnique({ where: { slug }, include: { category: true, variants: { orderBy: { id: 'asc' } } } }).catch(() => null)
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
    title: name,
    description: richTextToPlain(raw, 160) || `${name} — ${formatAmount(displayPrice, product.currency, isFa ? 'fa-IR' : 'en-US')}`,
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

  const galleryNode = <ProductGallery images={[product.image, ...parseJson<string[]>(product.gallery, [])]} alt={name} />
  const infoNode = (
          <div className="store-product-details">
            <span className="store-eyebrow">{product.category ? `${isFa ? product.category.name : product.category.nameEn || product.category.name} / MOBOCOMCMS` : 'MOBOCOMCMS / STORE'}</span>
            <h1>{name}</h1>
            <div className="store-product-badges">
              <span className="store-kind-chip">{product.kind === 'PHYSICAL' ? (isFa ? 'کالای فیزیکی' : 'Physical') : (isFa ? 'محصول مجازی' : 'Digital')}</span>
              {product.featured && <span className="store-featured-chip">{t.featured}</span>}
              <a className="store-rating-chip" href="#store-tab-reviews">
                <span className="store-rating-chip-star" aria-hidden="true">★</span>
                <strong className="num">{reviewCount > 0 ? reviewScore._avg.rating?.toFixed(1) : '—'}</strong>
                <span className="store-rating-chip-count num">{reviewCount} {isFa ? 'دیدگاه' : 'reviews'}</span>
              </a>
            </div>
            {html && <p className="store-product-summary">{richTextToPlain(html, 420)}</p>}
            {highlights.length > 0 && <div className="store-product-highlights"><h2>{isFa ? 'ویژگی‌های شاخص' : 'Highlights'}</h2><dl>{highlights.map(field => <div key={field.key}><dt>{isFa ? field.label : field.labelEn || field.label}</dt><dd>{specificationValues[field.key]}</dd></div>)}</dl></div>}
            {product.kind === 'PHYSICAL'
              ? <div className="store-product-kind-note">{isFa ? 'اطلاعات ارسال در زمان خرید ثبت می‌شود.' : 'Shipping details are entered at checkout.'}</div>
              : <div className="store-digital-card">
                  <div className="store-digital-head">
                    <span className="store-digital-icon" aria-hidden="true">⚡</span>
                    <div>
                      <strong>{isFa ? 'تحویل آنی پس از پرداخت' : 'Instant digital delivery'}</strong>
                      <p>{isFa ? 'محصول بلافاصله پس از پرداخت در حساب کاربری شما فعال می‌شود.' : 'Your product activates in your account right after payment.'}</p>
                    </div>
                  </div>
                  <ul className="store-digital-list">
                    <li>{isFa ? 'درگاه پرداخت امن و بانکی' : 'Secure bank-grade checkout'}</li>
                    <li>{isFa ? 'دسترسی فوری در بخش سفارش‌ها' : 'Immediate access in your orders'}</li>
                    <li>{isFa ? 'پشتیبانی اختصاصی در تیکتینگ' : 'Dedicated ticket support'}</li>
                  </ul>
                </div>}
          </div>
  )
  const [viewer, vipOn] = await Promise.all([getViewer(), isModuleEnabled('membership')])
  const purchaseNode = (
          <aside className="store-purchase-card" aria-label={isFa ? 'خرید محصول' : 'Purchase product'}>
            <div className="store-purchase-head">
              <span className="store-purchase-label">{isFa ? 'قیمت محصول' : 'Price'}</span>
              <span className={`store-purchase-stock ${inStock ? 'is-in' : 'is-out'}`}>{inStock ? (isFa ? 'موجود در انبار' : 'In stock') : (isFa ? 'ناموجود' : 'Out of stock')}</span>
            </div>
            <strong className="store-hero-price num">{activeVariants.length ? `${isFa ? 'از ' : 'From '}${formatAmount(Math.min(...activeVariants.map(variant => variant.price)), product.currency, isFa ? 'fa-IR' : 'en-US')}` : formatAmount(product.price, product.currency, isFa ? 'fa-IR' : 'en-US')}</strong>
            <ProductBuy productId={product.id} slug={product.slug} inStock={inStock} price={product.price} currency={product.currency} kind={product.kind} variants={activeVariants.map(variant => ({ id: variant.id, name: variant.name, nameEn: variant.nameEn, price: variant.price, stock: variant.stock, attributes: variant.attributes, memberPrice: vipOn && variant.memberPriceMinor > 0n ? legacyNumber(variant.memberPriceMinor, product.currency) : 0 }))} vip={vipOn ? { member: viewer.member, loggedIn: !!viewer.userId, access: product.access, memberPrice: product.memberPriceMinor > 0n ? legacyNumber(product.memberPriceMinor, product.currency) : 0, giftDays: product.vipGiftDays } : undefined} />
            <ItemActionBar item={{ type: 'product', id: product.id }} title={isFa ? product.name : product.nameEn || product.name} image={product.image} followLabel="تخفیف و موجودی" />
            <div className="store-purchase-perks">
              {product.kind !== 'PHYSICAL' && <span>⚡ {isFa ? 'تحویل آنی' : 'Instant delivery'}</span>}
              <span>✓ {isFa ? 'پرداخت امن' : 'Secure payment'}</span>
              <span>✓ {isFa ? 'پشتیبانی ۲۴/۷' : '24/7 support'}</span>
            </div>
            <div className="store-purchase-trust"><span>✓ {isFa ? 'تضمین بازگشت وجه' : 'Refund guarantee'}</span><span>✓ {isFa ? 'فعال‌سازی سریع' : 'Fast activation'}</span></div>
          </aside>
  )
  const heroNode = (
    <section className={`store-product-hero ${product.kind === 'PHYSICAL' ? 'is-physical' : 'is-virtual'}`} aria-label={name}>
      {galleryNode}
      {infoNode}
      {purchaseNode}
    </section>
  )
  const uspNode = product.kind !== 'PHYSICAL' ? (
<section className="store-usp" aria-label={isFa ? 'مزایای خرید' : 'Purchase benefits'}>
            {[
              ['⚡', isFa ? 'تحویل آنی' : 'Instant delivery', isFa ? 'فعال‌سازی در کمتر از یک دقیقه' : 'Activated in under a minute'],
              ['🛡', isFa ? 'پرداخت امن' : 'Secure payment', isFa ? 'درگاه بانکی معتبر و رمزنگاری‌شده' : 'Encrypted, bank-grade checkout'],
              ['💬', isFa ? 'پشتیبانی ۲۴ ساعته' : '24/7 support', isFa ? 'پاسخ‌گویی از طریق تیکتینگ' : 'Answers through the ticket desk'],
              ['↩', isFa ? 'تضمین بازگشت' : 'Money back', isFa ? 'در صورت عدم فعال‌سازی' : 'If activation fails'],
            ].map(([icon, title, desc]) => (
              <div className="store-usp-item" key={desc}>
                <span className="store-usp-icon" aria-hidden="true">{icon}</span>
                <div>
                  <strong>{title}</strong>
                  <small>{desc}</small>
                </div>
              </div>
            ))}
          </section>
  ) : null
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
  const breadcrumbsNode = <Breadcrumbs label={isFa ? 'مسیر صفحه' : 'Breadcrumb'} items={[{ label: isFa ? 'خانه' : 'Home', href: '/' }, { label: t.shop, href: '/products' }, { label: name }]} />
  const ldNodes = <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productLd) }} />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }} />
  </>
  return (
    <>
      <ThemeHeader context={renderContext} choice={chromeDoc?.layout?.header} theme={theme} locale={locale} navPages={navPages} builderContext={builderContext} preview={preview} />
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
        <main className="container page-main content-surface store-product-page">
          {breadcrumbsNode}
          {ldNodes}
          <nav className="store-product-breadcrumb" aria-label={isFa ? 'دستهٔ محصول' : 'Product category'}><Link href="/products">{isFa ? 'فروشگاه' : 'Shop'}</Link><span aria-hidden="true">/</span>{product.category && <span>{isFa ? product.category.name : product.category.nameEn || product.category.name}</span>}<span className="store-kind">{product.kind === 'PHYSICAL' ? isFa ? 'کالای فیزیکی' : 'Physical product' : isFa ? 'محصول مجازی' : 'Digital product'}</span></nav>
          {heroNode}
          {uspNode}
          {tabsNode}
          {builderDoc && <div className="store-product-builder"><BuilderRenderer doc={builderDoc} locale={locale} preview={isPreview(preview)} editable={ownEditable} context={builderContext} /></div>}
        </main>
      )}
      <ThemeFooter context={renderContext} choice={chromeDoc?.layout?.footer} locale={locale} navPages={navPages} builderContext={builderContext} preview={preview} />
    </>
  )
}
