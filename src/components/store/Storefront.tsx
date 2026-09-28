import Link from '@/components/AppLink'
import type { CSSProperties, ReactNode } from 'react'
import type { ProductCard } from '@/modules/store/server/catalog'
import type { StoreTile } from '@/modules/store/domain/store'
import { iranianUnit } from '@/shared/money/format'
import { StoreIcon, type StoreIconName } from '@/components/store/StoreIcons'
import Countdown from '@/components/store/Countdown'
import Slider from '@/components/site/Slider'

// Storefront building blocks (Digikala-style commerce on the SDS tokens):
// price, product tile, rails, the timed-offer band, category circles,
// brand strip, banners and the trust strip. Server-renderable.

const fa = (value: number) => value.toLocaleString('fa-IR')

/** Amount with its unit set smaller (IRT/IRR), or the locale currency format. */
export function Money({ amount, currency, className }: { amount: number; currency: string; className?: string }) {
  const unit = iranianUnit(currency, 'fa-IR')
  if (unit) return <span className={`sx-money ${className || ''}`}><b className="num">{Math.round(amount).toLocaleString('fa-IR')}</b><small>{unit}</small></span>
  return <span className={`sx-money ${className || ''}`}><b className="num">{new Intl.NumberFormat('fa-IR', { style: 'currency', currency }).format(amount)}</b></span>
}

export function PriceBlock({ price, listPrice, discount, currency, compact = false }: { price: number; listPrice: number; discount: number; currency: string; compact?: boolean }) {
  return <div className={`sx-price${compact ? ' is-compact' : ''}`}>
    {discount > 0 && <div className="sx-price-was"><s className="num">{Math.round(listPrice).toLocaleString('fa-IR')}</s><span className="sx-off">{fa(discount)}٪</span></div>}
    <Money amount={price} currency={currency} />
  </div>
}

export function Stars({ rating, count }: { rating: number; count?: number }) {
  if (!rating) return null
  return <span className="sx-stars" aria-label={`امتیاز ${fa(rating)} از ۵`}><StoreIcon name="star" size={14} /><b className="num">{fa(rating)}</b>{count ? <small className="num">({fa(count)})</small> : null}</span>
}

/** Product tile used in grids and rails. */
export function ProductTile({ product, rank }: { product: ProductCard; rank?: number }) {
  return <article className={`sx-tile${product.inStock ? '' : ' is-out'}`}>
    <Link href={`/products/${product.slug}`} className="sx-tile-link">
      <span className="sx-tile-art">
        {product.image ? <img src={product.image} alt="" loading="lazy" decoding="async" /> : <span className="sx-tile-ph"><StoreIcon name="box" size={40} /></span>}
        {rank !== undefined && <span className="sx-rank num">{fa(rank)}</span>}
        {product.vipOnly && <span className="sx-flag is-vip">VIP</span>}
        {product.kind === 'VIRTUAL' && <span className="sx-flag is-digital"><StoreIcon name="bolt" size={12} />تحویل آنی</span>}
      </span>
      <span className="sx-tile-body">
        {product.brand && <small className="sx-tile-brand">{product.brand}</small>}
        <b className="sx-tile-name">{product.name}</b>
        <span className="sx-tile-meta">
          {product.lowStock > 0 ? <span className="sx-low">تنها {fa(product.lowStock)} عدد در انبار</span> : product.kind === 'PHYSICAL' && product.inStock ? <span className="sx-ship"><StoreIcon name="truck" size={13} />ارسال فروشگاه</span> : <span />}
          <Stars rating={product.rating} />
        </span>
        {product.inStock
          ? <PriceBlock price={product.price} listPrice={product.listPrice} discount={product.discount} currency={product.currency} />
          : <span className="sx-unavailable">ناموجود</span>}
      </span>
    </Link>
  </article>
}

export function SectionHead({ title, icon, more, moreLabel = 'مشاهدهٔ همه', sub }: { title: string; icon?: StoreIconName; more?: string; moreLabel?: string; sub?: string }) {
  return <header className="sx-head">
    <div><h2>{icon && <StoreIcon name={icon} size={20} />}{title}</h2>{sub && <p>{sub}</p>}</div>
    {more && <Link href={more} className="sx-more">{moreLabel}<StoreIcon name="chevron" size={16} /></Link>}
  </header>
}

/** A horizontally scrolling rail of tiles. */
export function ProductRail({ title, icon, products, more, ranked = false }: { title: string; icon?: StoreIconName; products: ProductCard[]; more?: string; ranked?: boolean }) {
  if (!products.length) return null
  return <section className="sx-section">
    <SectionHead title={title} icon={icon} more={more} />
    <Slider className="sx-rail" role="list">{products.map((product, index) => <div role="listitem" key={product.id}><ProductTile product={product} rank={ranked ? index + 1 : undefined} /></div>)}</Slider>
  </section>
}

export function ProductGrid({ products }: { products: ProductCard[] }) {
  return <div className="sx-grid">{products.map((product) => <ProductTile key={product.id} product={product} />)}</div>
}

/** The red "amazing offers" band with the countdown of the soonest-ending offer. */
export function OfferBand({ title, products }: { title: string; products: ProductCard[] }) {
  if (!products.length) return null
  const ends = products.map((product) => product.saleEndsAt).filter((value): value is string => !!value).sort()[0]
  return <section className="sx-offers" aria-label={title}>
    <div className="sx-offers-lead">
      <StoreIcon name="percent" size={40} />
      <h2>{title}</h2>
      {ends && <Countdown until={ends} />}
      <Link href="/products?discounted=1&sort=discount" className="sx-offers-all">همهٔ پیشنهادها<StoreIcon name="chevron" size={16} /></Link>
    </div>
    <Slider className="sx-offers-track" role="list">
      {products.map((product) => <Link role="listitem" key={product.id} href={`/products/${product.slug}`} className="sx-offer">
        <span className="sx-offer-art">{product.image ? <img src={product.image} alt="" loading="lazy" decoding="async" /> : <StoreIcon name="box" size={36} />}</span>
        <b>{product.name}</b>
        <PriceBlock price={product.price} listPrice={product.listPrice} discount={product.discount} currency={product.currency} compact />
      </Link>)}
      <Link role="listitem" href="/products?discounted=1&sort=discount" className="sx-offer is-more"><span><StoreIcon name="chevron" size={22} /></span>مشاهدهٔ همه</Link>
    </Slider>
  </section>
}

export type CircleCategory = { slug: string; name: string; image: string; icon: string; total: number }

export function CategoryCircles({ categories }: { categories: CircleCategory[] }) {
  if (!categories.length) return null
  return <section className="sx-section">
    <SectionHead title="خرید بر اساس دسته‌بندی" icon="grid" />
    <Slider as="nav" className="sx-circles" label="دسته‌بندی‌های فروشگاه">
      {categories.map((category) => <Link key={category.slug} href={`/products?category=${encodeURIComponent(category.slug)}`} className="sx-circle">
        <span>{category.image ? <img src={category.image} alt="" loading="lazy" /> : <StoreIcon name="box" size={30} />}</span>
        <b>{category.name}</b>
        <small className="num">{fa(category.total)} کالا</small>
      </Link>)}
    </Slider>
  </section>
}

export function BrandStrip({ brands }: { brands: { id: number; slug: string; name: string; logo: string }[] }) {
  if (!brands.length) return null
  return <section className="sx-section">
    <SectionHead title="محبوب‌ترین برندها" icon="star" />
    <Slider as="nav" className="sx-brands" label="برندها">{brands.map((brand) => <Link key={brand.id} href={`/products?brand=${encodeURIComponent(brand.slug)}`} className="sx-brand" title={brand.name}>
      {brand.logo ? <img src={brand.logo} alt={brand.name} loading="lazy" /> : <b>{brand.name}</b>}
    </Link>)}</Slider>
  </section>
}

export function BannerGrid({ banners }: { banners: StoreTile[] }) {
  if (!banners.length) return null
  return <section className={`sx-banners is-${banners.length}`}>{banners.map((banner, index) => {
    const body = <img src={banner.image} alt={banner.title} loading="lazy" />
    return banner.href ? <Link key={index} href={banner.href} className="sx-banner">{body}</Link> : <span key={index} className="sx-banner">{body}</span>
  })}</section>
}

const TRUST: { icon: StoreIconName; title: string; text: string }[] = [
  { icon: 'truck', title: 'ارسال سریع', text: 'انتخاب روز و ساعت تحویل' },
  { icon: 'card', title: 'پرداخت امن', text: 'درگاه بانکی و کیف پول' },
  { icon: 'return', title: 'ضمانت بازگشت', text: 'هفت روز ضمانت بازگشت کالا' },
  { icon: 'shield', title: 'ضمانت اصالت', text: 'تضمین اصل بودن کالا' },
  { icon: 'headset', title: 'پشتیبانی', text: 'هفت روز هفته پاسخ‌گو هستیم' },
]

export function TrustStrip() {
  return <section className="sx-trust" aria-label="خدمات فروشگاه">{TRUST.map((item) => <div key={item.title}><StoreIcon name={item.icon} size={28} /><span><b>{item.title}</b><small>{item.text}</small></span></div>)}</section>
}

export function Crumbs({ items }: { items: { label: string; href?: string }[] }) {
  return <nav className="sx-crumbs" aria-label="مسیر صفحه"><ol>{items.map((item, index) => <li key={index}>{item.href ? <Link href={item.href}>{item.label}</Link> : <span aria-current="page">{item.label}</span>}</li>)}</ol></nav>
}

export function Pill({ children, tone = 'default', style }: { children: ReactNode; tone?: 'default' | 'accent' | 'danger' | 'ok'; style?: CSSProperties }) {
  return <span className={`sx-pill is-${tone}`} style={style}>{children}</span>
}
