import Link from '@/components/AppLink'
import type { ReactNode } from 'react'
import type { ProductCard, ShopDivision } from '@/modules/store/server/catalog'
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

export type HeroCopy = {
  kicker: string
  icon: StoreIconName
  /** The title before and the highlighted words in it. */
  title: [string, string, string]
  text: string
  actions: { href: string; label: string; icon: StoreIconName; primary?: boolean }[]
  /** Searching from the hero stays inside this half of the shop. */
  searchKind?: 'PHYSICAL' | 'VIRTUAL'
  searchLabel?: string
}

const SHOP_COPY: HeroCopy = {
  kicker: 'فروشگاه موبوکام', icon: 'store', title: ['هرچه لازم دارید، ', 'با ارسال سریع', ' و ضمانت اصالت'],
  text: 'کالاهای فیزیکی و محصولات دیجیتال را مقایسه کنید، به سبد اضافه کنید و روز و ساعت تحویل را خودتان انتخاب کنید.',
  actions: [{ href: '/products?discounted=1&sort=discount', label: 'شگفت‌انگیزها', icon: 'percent', primary: true }, { href: '/products?sort=bestselling', label: 'پرفروش‌ترین‌ها', icon: 'fire' }],
}

/** The hero's welcome when no slides are set: what this shop is, its ways in, and a stage of its products. */
function HeroIntro({ copy, stage, stats }: { copy: HeroCopy; stage: ProductCard[]; stats: { label: string; value: number }[] }) {
  return <div className="sx-hero-intro">
    <div className="sx-hero-copy">
      <span className="sx-hero-kicker"><StoreIcon name={copy.icon} size={16} />{copy.kicker}</span>
      <h1>{copy.title[0]}<em>{copy.title[1]}</em>{copy.title[2]}</h1>
      <p>{copy.text}</p>
      {copy.searchKind && <form action="/products" method="get" role="search" className="sx-hero-search">
        <input type="hidden" name="kind" value={copy.searchKind} />
        <StoreIcon name="filter" size={18} />
        <input name="q" type="search" aria-label={copy.searchLabel} placeholder={copy.searchLabel} maxLength={80} />
        <button type="submit" className="sx-btn is-primary">جست‌وجو</button>
      </form>}
      <div className="sx-hero-actions">
        {copy.actions.map((action) => <Link key={action.href} href={action.href} className={`sx-btn ${action.primary ? 'is-primary' : 'is-glass'}`}><StoreIcon name={action.icon} size={18} />{action.label}</Link>)}
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
export function ShopHero({ slider, stage, stats, deal, fresh, copy = SHOP_COPY, tone = '' }: { slider: ReactNode; stage: ProductCard[]; stats: { label: string; value: number }[]; deal?: ProductCard; fresh?: ProductCard; copy?: HeroCopy; tone?: '' | 'digital' | 'physical' }) {
  const side = [deal && <SideCard key="deal" product={deal} label="پیشنهاد لحظه‌ای" icon="clock" tone="deal" />, fresh && <SideCard key="new" product={fresh} label="تازه رسید" icon="star" tone="new" />].filter(Boolean)
  return <section className={`sx-hero${side.length ? '' : ' is-wide'}${tone ? ` is-${tone}` : ''}`} aria-label="ویترین فروشگاه">
    <div className="sx-hero-main">{slider || <HeroIntro copy={copy} stage={stage} stats={stats} />}</div>
    {side.length > 0 && <div className="sx-hero-side">{side}</div>}
  </section>
}

export type QuickRoute = { href: string; label: string; text: string; icon: StoreIconName }

const QUICK: QuickRoute[] = [
  { href: '/products?discounted=1&sort=discount', label: 'شگفت‌انگیزها', text: 'بیشترین تخفیف‌ها', icon: 'percent' },
  { href: '/products?sort=bestselling', label: 'پرفروش‌ترین‌ها', text: 'انتخاب خریداران', icon: 'fire' },
  { href: '/products?kind=VIRTUAL', label: 'تحویل آنلاین', text: 'لایسنس و گیفت‌کارت', icon: 'bolt' },
  { href: '/products?kind=PHYSICAL', label: 'کالای فیزیکی', text: 'ارسال به سراسر کشور', icon: 'truck' },
  { href: '/products?sort=newest&page=1', label: 'تازه‌ترین‌ها', text: 'جدیدترین کالاها', icon: 'star' },
  { href: '/compare', label: 'مقایسهٔ کالا', text: 'کنار هم ببینید', icon: 'grid' },
]

export function QuickRoutes({ items = QUICK }: { items?: QuickRoute[] }) {
  return <nav className="sx-quick" aria-label="دسترسی سریع فروشگاه">{items.map((item) => <Link key={item.href} href={item.href} className="sx-quick-item">
    <span className="sx-quick-icon"><StoreIcon name={item.icon} size={22} /></span>
    <span><b>{item.label}</b><small>{item.text}</small></span>
  </Link>)}</nav>
}

export type GridCategory = { slug: string; name: string; image: string; total: number; children: { slug: string; name: string }[] }

/** Top-level categories as picture cards, each with a few of its sub-categories. */
/** `base`: a store half's address, so its category links stay in that half. */
export function CategoryGrid({ categories, base = '/products?' }: { categories: GridCategory[]; base?: string }) {
  const link = (slug: string) => `${base}${base.endsWith('?') ? '' : '&'}category=${encodeURIComponent(slug)}`
  if (!categories.length) return null
  return <section className="sx-section sx-catgrid-section">
    <SectionHead title="خرید بر اساس دسته‌بندی" icon="grid" sub="هر دسته با زیردسته‌هایش؛ از اینجا شروع کنید." />
    <Slider as="nav" className="sx-catgrid" label="دسته‌بندی‌های فروشگاه">
      {categories.map((category) => <div key={category.slug} className="sx-catcard">
        <Link href={link(category.slug)} className="sx-catcard-main">
          <span className="sx-catcard-art">{category.image ? <img src={sized(category.image, 240)} srcSet={srcSet(category.image, 240)} alt="" loading="lazy" decoding="async" /> : <StoreIcon name="box" size={40} />}</span>
          <b>{category.name}</b>
          <small className="num">{fa(category.total)} کالا</small>
        </Link>
        {category.children.length > 0 && <span className="sx-catcard-subs">{category.children.slice(0, 3).map((child) => <Link key={child.slug} href={link(child.slug)}>{child.name}</Link>)}</span>}
      </div>)}
    </Slider>
  </section>
}

/** Best sellers as a numbered list in columns of three (the rank is the point, not a big picture). */
export function TopSellers({ products, more = '/products?sort=bestselling', title = 'پرفروش‌ترین کالاها' }: { products: ProductCard[]; more?: string; title?: string }) {
  if (products.length < 3) return null
  return <section className="sx-section">
    <SectionHead title={title} icon="fire" more={more} sub="آنچه خریداران بیشتر از همه برداشته‌اند." />
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

const DOOR = {
  VIRTUAL: { title: 'فروشگاه محصولات دیجیتال', kicker: 'تحویل آنلاین و آنی', text: 'لایسنس، گیفت‌کارت، اکانت و اشتراک؛ بدون ارسال پستی، همان لحظه در حساب کاربری شما.', icon: 'bolt', cta: 'ورود به فروشگاه دیجیتال', tone: 'digital', points: ['تحویل آنی کد', 'ضمانت اصالت', 'پشتیبانی فعال‌سازی'] },
  PHYSICAL: { title: 'فروشگاه کالای فیزیکی', kicker: 'ارسال به سراسر کشور', text: 'کالای اصل با ضمانت بازگشت؛ روش ارسال و روز و ساعت تحویل را خودتان انتخاب می‌کنید.', icon: 'truck', cta: 'ورود به فروشگاه فیزیکی', tone: 'physical', points: ['ارسال سریع', 'ضمانت بازگشت', 'پرداخت امن'] },
} as const

/** The shop's front: two doors, one for digital products and one for goods that are shipped. */
export function StoreDoors({ divisions }: { divisions: ShopDivision[] }) {
  // An empty half is not drawn; the other then takes the whole row.
  const shown = (['VIRTUAL', 'PHYSICAL'] as const).map((kind) => divisions.find((division) => division.kind === kind)).filter((division): division is ShopDivision => !!division && division.total > 0)
  if (!shown.length) return null
  return <section className={`sx-doors${shown.length === 1 ? ' is-single' : ''}`} aria-label="دو فروشگاه">
    {shown.map((division) => {
      const door = DOOR[division.kind], href = `/products?kind=${division.kind}`
      const pictures = division.products.filter((product) => product.image).slice(0, 3)
      return <article key={division.kind} className={`sx-door is-${door.tone}`}>
        <div className="sx-door-copy">
          <span className="sx-door-kicker"><StoreIcon name={door.icon} size={16} />{door.kicker}</span>
          <h2><Link href={href} className="sx-door-link">{door.title}</Link></h2>
          <p>{door.text}</p>
          <ul className="sx-door-points">{door.points.map((point) => <li key={point}><StoreIcon name="check" size={14} />{point}</li>)}</ul>
          {division.categories.length > 0 && <nav className="sx-door-cats" aria-label={`دسته‌بندی‌های ${door.title}`}>{division.categories.slice(0, 5).map((category) => <Link key={category.slug} href={`${href}&category=${encodeURIComponent(category.slug)}`}>{category.name}<small className="num">{fa(category.total)}</small></Link>)}</nav>}
          <span className="sx-door-foot"><b className="num">{fa(division.total)}</b> کالا<span className="sx-door-cta">{door.cta}<StoreIcon name="chevron" size={16} /></span></span>
        </div>
        <div className="sx-door-art" aria-hidden="true">
          {pictures.length ? pictures.map((product, index) => <span key={product.id} className={`sx-door-pic is-${index + 1}`}><Art product={product} size={240} /></span>) : <span className="sx-door-icon"><StoreIcon name={door.icon} size={64} /></span>}
        </div>
      </article>
    })}
  </section>
}

/** Hero copy and quick routes of one half of the shop. */
export function divisionCopy(kind: 'PHYSICAL' | 'VIRTUAL'): { hero: HeroCopy; quick: QuickRoute[]; other: { href: string; label: string } } {
  const base = `/products?kind=${kind}`
  if (kind === 'VIRTUAL') return {
    hero: {
      kicker: 'فروشگاه محصولات دیجیتال', icon: 'bolt', title: ['لایسنس، گیفت‌کارت و اشتراک؛ ', 'تحویل آنی', ' در حساب شما'],
      text: 'بدون انتظار و بدون ارسال پستی: پس از پرداخت، کد یا لینک محصول همان لحظه در پنل کاربری و ایمیل شما است.',
      actions: [{ href: `${base}&instant=1`, label: 'تحویل آنی', icon: 'bolt', primary: true }, { href: `${base}&discounted=1&sort=discount`, label: 'تخفیف‌دارها', icon: 'percent' }, { href: '/products?kind=PHYSICAL', label: 'فروشگاه فیزیکی', icon: 'truck' }],
      searchKind: kind, searchLabel: 'جست‌وجو در محصولات دیجیتال',
    },
    quick: [
      { href: `${base}&instant=1`, label: 'تحویل آنی', text: 'کد همان لحظه', icon: 'bolt' },
      { href: `${base}&discounted=1&sort=discount`, label: 'شگفت‌انگیزها', text: 'بیشترین تخفیف‌ها', icon: 'percent' },
      { href: `${base}&sort=bestselling`, label: 'پرفروش‌ترین‌ها', text: 'انتخاب خریداران', icon: 'fire' },
      { href: `${base}&rating=4`, label: 'محبوب‌ترین‌ها', text: 'امتیاز ۴ به بالا', icon: 'star' },
      { href: `${base}&sort=newest&page=1`, label: 'تازه‌ترین‌ها', text: 'جدیدترین محصولات', icon: 'gift' },
      { href: '/compare', label: 'مقایسهٔ کالا', text: 'کنار هم ببینید', icon: 'grid' },
    ],
    other: { href: '/products?kind=PHYSICAL', label: 'فروشگاه کالای فیزیکی' },
  }
  return {
    hero: {
      kicker: 'فروشگاه کالای فیزیکی', icon: 'truck', title: ['کالای اصل، ', 'ارسال سریع', ' به سراسر کشور'],
      text: 'روش ارسال را خودتان انتخاب کنید؛ پیک، پست یا باربری، با ضمانت بازگشت و پرداخت امن.',
      actions: [{ href: `${base}&discounted=1&sort=discount`, label: 'شگفت‌انگیزها', icon: 'percent', primary: true }, { href: `${base}&available=1`, label: 'فقط موجودها', icon: 'check' }, { href: '/products?kind=VIRTUAL', label: 'فروشگاه دیجیتال', icon: 'bolt' }],
      searchKind: kind, searchLabel: 'جست‌وجو در کالاهای فیزیکی',
    },
    quick: [
      { href: `${base}&discounted=1&sort=discount`, label: 'شگفت‌انگیزها', text: 'بیشترین تخفیف‌ها', icon: 'percent' },
      { href: `${base}&sort=bestselling`, label: 'پرفروش‌ترین‌ها', text: 'انتخاب خریداران', icon: 'fire' },
      { href: `${base}&available=1`, label: 'آمادهٔ ارسال', text: 'فقط کالاهای موجود', icon: 'truck' },
      { href: `${base}&rating=4`, label: 'محبوب‌ترین‌ها', text: 'امتیاز ۴ به بالا', icon: 'star' },
      { href: `${base}&sort=cheap`, label: 'اقتصادی‌ها', text: 'ارزان‌ترین اول', icon: 'card' },
      { href: '/compare', label: 'مقایسهٔ کالا', text: 'کنار هم ببینید', icon: 'grid' },
    ],
    other: { href: '/products?kind=VIRTUAL', label: 'فروشگاه محصولات دیجیتال' },
  }
}
