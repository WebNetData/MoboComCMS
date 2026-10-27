import Link from '@/components/AppLink'
import type { ReactNode } from 'react'
import type { ProductCard } from '@/modules/store/server/catalog'
import { StoreIcon, type StoreIconName } from '@/components/store/StoreIcons'
import Countdown from '@/components/store/Countdown'
import Slider from '@/components/site/Slider'
import { Money, PriceBlock, SectionHead } from '@/components/store/Storefront'
import { sized, srcSet } from '@/shared/media/image'

// The shop landing's own pieces: the hero with today's deal, quick routes, the category grid and the numbered
// best-seller list. Built from what the landing already reads (store settings, offers, rails, category tree).

const fa = (value: number) => value.toLocaleString('fa-IR')

function Art({ product, size, className }: { product: Pick<ProductCard, 'image'>; size: number; className?: string }) {
  return product.image
    ? <img className={className} src={sized(product.image, size)} srcSet={srcSet(product.image, size)} alt="" loading="lazy" decoding="async" />
    : <span className={`sx-art-ph${className ? ` ${className}` : ''}`}><StoreIcon name="box" size={Math.round(size / 6)} /></span>
}

/** The landing's welcome when no slides are set: what the shop is, two ways in, and a stage of its products. */
function HeroIntro({ stage, stats }: { stage: ProductCard[]; stats: { label: string; value: number }[] }) {
  return <div className="sx-hero-intro">
    <div className="sx-hero-copy">
      <span className="sx-hero-kicker"><StoreIcon name="store" size={16} />فروشگاه موبوکام</span>
      <h1>هرچه لازم دارید، <em>با ارسال سریع</em> و ضمانت اصالت</h1>
      <p>کالاهای فیزیکی و محصولات دیجیتال را مقایسه کنید، به سبد اضافه کنید و روز و ساعت تحویل را خودتان انتخاب کنید.</p>
      <div className="sx-hero-actions">
        <Link href="/products?discounted=1&sort=discount" className="sx-btn is-primary"><StoreIcon name="percent" size={18} />شگفت‌انگیزها</Link>
        <Link href="/products?sort=bestselling" className="sx-btn is-glass"><StoreIcon name="fire" size={18} />پرفروش‌ترین‌ها</Link>
      </div>
      {stats.length > 0 && <ul className="sx-hero-stats" aria-label="فروشگاه در یک نگاه">{stats.map((item) => <li key={item.label}><b className="num">{fa(item.value)}</b><small>{item.label}</small></li>)}</ul>}
    </div>
    {stage.length > 0 && <div className={`sx-hero-stage is-${stage.length}`} aria-hidden="true">
      {stage.map((product, index) => <span key={product.id} className={`sx-stage-card is-${index + 1}`}>
        <Art product={product} size={320} />
        <b>{product.name}</b>
      </span>)}
      <span className="sx-stage-glow" />
    </div>}
  </div>
}

/** One product in the hero's side column: today's best deal or what just arrived. */
function SideCard({ product, label, icon, tone }: { product: ProductCard; label: string; icon: StoreIconName; tone: 'deal' | 'new' }) {
  return <Link href={`/products/${product.slug}`} className={`sx-side-card is-${tone}`}>
    <span className="sx-side-label"><StoreIcon name={icon} size={15} />{label}</span>
    {tone === 'deal' && product.saleEndsAt && <span className="sx-side-timer"><Countdown until={product.saleEndsAt} /></span>}
    <span className="sx-side-art"><Art product={product} size={240} />{product.discount > 0 && <em className="num">{fa(product.discount)}٪</em>}</span>
    <b className="sx-side-name">{product.name}</b>
    {product.inStock ? <PriceBlock price={product.price} listPrice={product.listPrice} discount={product.discount} currency={product.currency} compact /> : <small>ناموجود</small>}
  </Link>
}

/** The top of the landing: the slider (or the welcome) beside today's deal and the newest product. */
export function ShopHero({ slider, stage, stats, deal, fresh }: { slider: ReactNode; stage: ProductCard[]; stats: { label: string; value: number }[]; deal?: ProductCard; fresh?: ProductCard }) {
  const side = [deal && <SideCard key="deal" product={deal} label="پیشنهاد لحظه‌ای" icon="clock" tone="deal" />, fresh && <SideCard key="new" product={fresh} label="تازه رسید" icon="star" tone="new" />].filter(Boolean)
  return <section className={`sx-hero${side.length ? '' : ' is-wide'}`} aria-label="ویترین فروشگاه">
    <div className="sx-hero-main">{slider || <HeroIntro stage={stage} stats={stats} />}</div>
    {side.length > 0 && <div className="sx-hero-side">{side}</div>}
  </section>
}

const QUICK: { href: string; label: string; text: string; icon: StoreIconName }[] = [
  { href: '/products?discounted=1&sort=discount', label: 'شگفت‌انگیزها', text: 'بیشترین تخفیف‌ها', icon: 'percent' },
  { href: '/products?sort=bestselling', label: 'پرفروش‌ترین‌ها', text: 'انتخاب خریداران', icon: 'fire' },
  { href: '/products?kind=VIRTUAL', label: 'تحویل آنلاین', text: 'لایسنس و گیفت‌کارت', icon: 'bolt' },
  { href: '/products?kind=PHYSICAL', label: 'کالای فیزیکی', text: 'ارسال به سراسر کشور', icon: 'truck' },
  { href: '/products?sort=newest&page=1', label: 'تازه‌ترین‌ها', text: 'جدیدترین کالاها', icon: 'star' },
  { href: '/compare', label: 'مقایسهٔ کالا', text: 'کنار هم ببینید', icon: 'grid' },
]

export function QuickRoutes() {
  return <nav className="sx-quick" aria-label="دسترسی سریع فروشگاه">{QUICK.map((item) => <Link key={item.href} href={item.href} className="sx-quick-item">
    <span className="sx-quick-icon"><StoreIcon name={item.icon} size={22} /></span>
    <span><b>{item.label}</b><small>{item.text}</small></span>
  </Link>)}</nav>
}

export type GridCategory = { slug: string; name: string; image: string; total: number; children: { slug: string; name: string }[] }

/** Top-level categories as picture cards, each with a few of its sub-categories. */
export function CategoryGrid({ categories }: { categories: GridCategory[] }) {
  if (!categories.length) return null
  return <section className="sx-section sx-catgrid-section">
    <SectionHead title="خرید بر اساس دسته‌بندی" icon="grid" sub="هر دسته با زیردسته‌هایش؛ از اینجا شروع کنید." />
    <Slider as="nav" className="sx-catgrid" label="دسته‌بندی‌های فروشگاه">
      {categories.map((category) => <div key={category.slug} className="sx-catcard">
        <Link href={`/products?category=${encodeURIComponent(category.slug)}`} className="sx-catcard-main">
          <span className="sx-catcard-art">{category.image ? <img src={sized(category.image, 240)} srcSet={srcSet(category.image, 240)} alt="" loading="lazy" decoding="async" /> : <StoreIcon name="box" size={40} />}</span>
          <b>{category.name}</b>
          <small className="num">{fa(category.total)} کالا</small>
        </Link>
        {category.children.length > 0 && <span className="sx-catcard-subs">{category.children.slice(0, 3).map((child) => <Link key={child.slug} href={`/products?category=${encodeURIComponent(child.slug)}`}>{child.name}</Link>)}</span>}
      </div>)}
    </Slider>
  </section>
}

/** Best sellers as a numbered list in columns of three (the rank is the point, not a big picture). */
export function TopSellers({ products }: { products: ProductCard[] }) {
  if (products.length < 3) return null
  return <section className="sx-section">
    <SectionHead title="پرفروش‌ترین کالاها" icon="fire" more="/products?sort=bestselling" sub="آنچه خریداران بیشتر از همه برداشته‌اند." />
    <Slider className="sx-top" role="list">{products.slice(0, 12).map((product, index) => <Link role="listitem" key={product.id} href={`/products/${product.slug}`} className="sx-top-item">
      <span className="sx-top-rank num" aria-label={`رتبهٔ ${fa(index + 1)}`}>{fa(index + 1)}</span>
      <span className="sx-top-art"><Art product={product} size={160} /></span>
      <span className="sx-top-body">
        <b>{product.name}</b>
        {product.inStock ? <span className="sx-top-price">{product.discount > 0 && <em className="num">{fa(product.discount)}٪</em>}<Money amount={product.price} currency={product.currency} /></span> : <small>ناموجود</small>}
      </span>
    </Link>)}</Slider>
  </section>
}
