import Link from '@/platform/routing/Link'
import { ThemePlanCards, ThemePublicForm, themeFormatAmount, type ThemeHomeProps } from '@/themes/sdk/server'
import type { ThemeServerModule } from '@/themes/types'
import Icon from './icons'

type LocalText = { fa: string; en: string; [locale: string]: string }
type Section = ThemeHomeProps['site']['sections'][number]
type Showcase = ThemeHomeProps['data']['showcase'][number]

// Section links point at modules; each gets its own icon and colour tone.
const SERVICE_STYLE: [RegExp, string, string][] = [
  [/^\/products/, 'bag', 'violet'], [/^\/blog/, 'news', 'blue'], [/^\/music/, 'music', 'pink'], [/^\/cinema/, 'film', 'red'],
  [/^\/games/, 'game', 'green'], [/^\/software/, 'download', 'cyan'], [/^\/forum/, 'chat', 'amber'], [/^\/vip/, 'crown', 'gold'],
]
const styleOf = (href: string, fallback: string): [string, string] => { const hit = SERVICE_STYLE.find(([pattern]) => pattern.test(href)); return hit ? [hit[1], hit[2]] : [fallback, 'violet'] }
const SHOWCASE: { kind: Showcase['kind']; href: string; fa: string; en: string; icon: string }[] = [
  { kind: 'music', href: '/music', fa: 'موزیک', en: 'Music', icon: 'music' },
  { kind: 'cinema', href: '/cinema', fa: 'فیلم و سریال', en: 'Movies & series', icon: 'film' },
  { kind: 'games', href: '/games', fa: 'بازی', en: 'Games', icon: 'game' },
  { kind: 'software', href: '/software', fa: 'نرم‌افزار', en: 'Software', icon: 'download' },
  { kind: 'forum', href: '/forum', fa: 'تالار گفتمان', en: 'Forum', icon: 'chat' },
]

/**
 * MoboCom corporate homepage. Every section comes from Site Studio (order,
 * copy, visibility); links into switched-off modules are dropped so the page
 * never advertises a section that returns 404.
 */
function MobocomHome(props: ThemeHomeProps) {
  return <main className="mb-home" id="main-content">{props.site.sections.filter(section => section.enabled).map(section => <MobocomSection key={section.id} section={section} {...props}/>)}</main>
}

function MobocomSection({ section, site, locale, data }: ThemeHomeProps & { section: Section }) {
  const fa = locale === 'fa'
  const L = (faText: string, en: string) => site.copy?.[en]?.[locale] || (fa ? faText : en)
  const T = (value: LocalText) => value[locale] || value.fa || value.en
  const live = (href: string) => !!href && !data.disabledPaths.some(path => href === path || href.startsWith(`${path}/`) || href.startsWith(`${path}?`))
  const money = (value: number, currency: string) => themeFormatAmount(value, currency, fa ? 'fa-IR' : 'en-US')
  const heading = (action?: { href: string; label: string }) => <header className="mb-heading">
    <div>{T(section.eyebrow) && <span className="mb-eyebrow">{T(section.eyebrow)}</span>}<h2>{T(section.title)}</h2>{T(section.description) && <p>{T(section.description)}</p>}</div>
    {action && live(action.href) && <Link className="mb-link" href={action.href}>{action.label}<Icon name="arrow" size={16}/></Link>}
  </header>

  switch (section.kind) {
    case 'hero': {
      const tiles = [['/products', L('فروشگاه', 'Shop'), L('کالا و محصولات مجازی', 'Goods & digital'), 'bag', 'violet'], ['/music', L('موزیک', 'Music'), L('آلبوم و پلی‌لیست', 'Albums & playlists'), 'music', 'pink'], ['/cinema', L('فیلم و سریال', 'Movies'), L('دانلود و تماشا', 'Watch & download'), 'film', 'red'], ['/games', L('بازی', 'Games'), L('نقد و دانلود', 'Reviews & downloads'), 'game', 'green']].filter(([href]) => live(href))
      return <section className="mb-hero" id={section.id} aria-labelledby="mb-hero-title">
        <div className="mb-container mb-hero-grid">
          <div className="mb-hero-copy">
            {T(section.eyebrow) && <span className="mb-pill"><Icon name="sparkles" size={14}/>{T(section.eyebrow)}</span>}
            <h1 id="mb-hero-title">{T(section.title).split('\n').map((line, index) => <span key={index}>{line}</span>)}</h1>
            <p className="mb-lead">{T(section.description)}</p>
            <div className="mb-actions">
              {live(section.action.href) && <Link className="mb-btn mb-btn-primary" href={section.action.href}>{T(section.action.label)}<Icon name="arrow" size={18}/></Link>}
              {live('/vip') && <Link className="mb-btn mb-btn-ghost" href="/vip"><Icon name="crown" size={18}/>{L('اشتراک ویژه', 'VIP membership')}</Link>}
            </div>
          </div>
          {tiles.length > 0 && <div className="mb-hero-tiles" aria-label={L('بخش‌های اصلی', 'Main sections')}>{tiles.map(([href, title, text, icon, tone]) => <Link key={href} href={href} className={`mb-tile tone-${tone}`}><span className="mb-tile-icon"><Icon name={icon} size={26}/></span><b>{title}</b><small>{text}</small></Link>)}</div>}
        </div>
        {section.items.length > 0 && <ul className="mb-container mb-values">{section.items.map((item, index) => <li key={index}><span className="mb-icon"><Icon name={item.icon} size={20}/></span><span><strong>{T(item.title)}</strong><small>{T(item.text)}</small></span></li>)}</ul>}
      </section>
    }
    case 'services': {
      const items = section.items.filter(item => live(item.href))
      if (!items.length) return null
      return <section className="mb-container mb-section" id={section.id}>{heading()}
        <div className="mb-services">{items.map((item, index) => { const [icon, tone] = styleOf(item.href, item.icon); return <Link key={index} href={item.href} className={`mb-service tone-${tone}`}><span className="mb-service-icon"><Icon name={icon} size={24}/></span><span><b>{T(item.title)}</b><small>{T(item.text)}</small></span><Icon name="arrow" size={16}/></Link> })}</div>
      </section>
    }
    case 'products':
      if (!data.products.length || !live('/products')) return null
      return <section className="mb-container mb-section" id={section.id}>{heading({ href: '/products', label: L('ورود به فروشگاه', 'Visit the shop') })}
        <div className="mb-products">{data.products.map(product => <Link key={product.id} href={`/products/${product.slug}`} className="mb-card mb-product">
          <span className="mb-product-art">{product.image ? <img src={product.image} alt="" loading="lazy"/> : <Icon name="bag" size={36}/>}</span>
          {product.category && <small className="mb-product-cat">{fa ? product.category.name : product.category.nameEn || product.category.name}</small>}
          <b>{fa ? product.name : product.nameEn || product.name}</b>
          <span className="mb-price"><bdi>{money(product.price, product.currency)}</bdi></span>
        </Link>)}</div>
      </section>
    case 'showcase': {
      const columns = SHOWCASE.filter(column => live(column.href)).map(column => ({ ...column, items: data.showcase.filter(item => item.kind === column.kind) })).filter(column => column.items.length)
      if (!columns.length) return null
      return <section className="mb-container mb-section" id={section.id}>{heading()}
        <div className="mb-showcase">{columns.map(column => <div key={column.kind} className={`mb-card mb-shelf is-${column.kind}`}>
          <header><span className="mb-icon"><Icon name={column.icon} size={18}/></span><b>{fa ? column.fa : column.en}</b><Link href={column.href} className="mb-link">{L('همه', 'All')}<Icon name="arrow" size={14}/></Link></header>
          <ul>{column.items.map(item => <li key={item.href}><Link href={item.href}>{column.kind !== 'forum' && <span className={`mb-thumb is-${column.kind}`}>{item.cover ? <img src={item.cover} alt="" loading="lazy"/> : <Icon name={column.icon} size={18}/>}</span>}<span className="mb-shelf-text"><b>{item.title}</b>{item.meta && <small>{item.meta}</small>}</span>{item.vip && <em className="mb-vip">VIP</em>}</Link></li>)}</ul>
        </div>)}</div>
      </section>
    }
    case 'features':
      return <section className="mb-container mb-section mb-about" id={section.id}>
        <div className="mb-about-copy">{heading()}</div>
        <div className="mb-features">{section.items.map((item, index) => <article key={index} className="mb-card"><span className="mb-icon"><Icon name={item.icon} size={22}/></span><h3>{T(item.title)}</h3><p>{T(item.text)}</p></article>)}</div>
      </section>
    case 'posts':
      if (!data.posts.length || !live('/blog')) return null
      return <section className="mb-container mb-section" id={section.id}>{heading({ href: '/blog', label: L('همهٔ مطالب مجله', 'All articles') })}
        <div className="mb-posts">{data.posts.map((post, index) => <Link key={post.id} href={`/blog/${post.slug}`} className={`mb-card mb-post${index === 0 ? ' is-lead' : ''}`}>
          <span className="mb-post-cover">{post.cover ? <img src={post.cover} alt="" loading="lazy"/> : <Icon name="news" size={34}/>}</span>
          <span className="mb-post-body">{post.category && <small className="mb-eyebrow">{fa ? post.category.name : post.category.nameEn || post.category.name}</small>}<b>{fa ? post.title : post.titleEn || post.title}</b><small>{fa ? post.excerpt : post.excerptEn || post.excerpt}</small><time dateTime={new Date(post.publishedAt).toISOString()}>{new Date(post.publishedAt).toLocaleDateString(fa ? 'fa-IR' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</time></span>
        </Link>)}</div>
      </section>
    case 'plans':
      if (!data.plans.length || !live('/plans')) return null
      return <section className="mb-container mb-section" id={section.id}>{heading({ href: '/plans', label: L('همهٔ پلن‌ها', 'All plans') })}<ThemePlanCards plans={data.plans} tomanRate={data.tomanRate} showWallet={false}/></section>
    case 'steps':
      return <section className="mb-container mb-section" id={section.id}>{heading()}<ol className="mb-steps">{section.items.map((item, index) => <li key={index} className="mb-card"><span className="mb-step">{(index + 1).toLocaleString(fa ? 'fa-IR' : 'en-US')}</span><h3>{T(item.title)}</h3><p>{T(item.text)}</p></li>)}</ol></section>
    case 'faq':
      return <section className="mb-container mb-section mb-faq" id={section.id}>{heading()}
        <div className="mb-faq-list">{section.items.map((item, index) => <details key={index}><summary>{T(item.title)}<Icon name="plus" size={18}/></summary><p>{T(item.text)}</p></details>)}</div>
      </section>
    case 'form': {
      const form = data.forms.find(item => item.slug === section.formSlug)
      return form ? <section className="mb-container mb-section" id={section.id}>{heading()}<div className="mb-card"><ThemePublicForm form={form}/></div></section> : null
    }
    case 'cta':
      return <section className="mb-container mb-section" id={section.id}>
        <div className="mb-cta">
          <span className="mb-cta-crown" aria-hidden="true"><Icon name="crown" size={34}/></span>
          <div>{T(section.eyebrow) && <span className="mb-eyebrow">{T(section.eyebrow)}</span>}<h2>{T(section.title)}</h2><p>{T(section.description)}</p></div>
          {live(section.action.href) && <Link className="mb-btn mb-btn-gold" href={section.action.href}>{T(section.action.label)}<Icon name="arrow" size={18}/></Link>}
        </div>
      </section>
    default:
      return null
  }
}

const Home: NonNullable<ThemeServerModule['Home']> = (props) => <div data-code-theme="mobocom"><MobocomHome {...props}/></div>
export const theme: ThemeServerModule = { Home }
