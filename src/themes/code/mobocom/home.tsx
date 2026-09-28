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
      // Immersive stage: headline + site search, live counters, and a bento of the newest content.
      const pick = (kind: Showcase['kind']) => data.showcase.find(item => item.kind === kind && (item.image || item.cover))
      const game = pick('games')
      const film = pick('cinema')
      const album = pick('music')
      const product = live('/products') ? data.products[0] : undefined
      const stats = (data.stats || []).filter(stat => live(stat.href)).slice(0, 5)
      const chips = [['/games/calendar', L('تقویم انتشار بازی', 'Release calendar')], ['/software', L('آخرین نرم‌افزارها', 'Latest software')], ['/cinema', L('فیلم‌های تازه', 'New films')], ['/feed', L('تازه‌های جامعه', 'Community feed')], ['/products', L('پیشنهاد ویژه', 'Deals')]].filter(([href]) => live(href)).slice(0, 4)
      return <section className="mbx-hero" id={section.id} aria-labelledby="mb-hero-title">
        <div className="mbx-hero-glow" aria-hidden="true" />
        <div className="mb-container mbx-hero-grid">
          <div className="mbx-hero-copy">
            {T(section.eyebrow) && <span className="mbx-pill"><Icon name="sparkles" size={14}/>{T(section.eyebrow)}</span>}
            <h1 id="mb-hero-title">{T(section.title).split('\n').map((line, index) => <span key={index} className={index === 1 ? 'is-accent' : undefined}>{line}</span>)}</h1>
            <p className="mbx-lead">{T(section.description)}</p>
            {live('/search') && <form className="mbx-search" action="/search" role="search"><Icon name="search" size={20}/><input name="q" type="search" placeholder={L('جست‌وجوی بازی، فیلم، آهنگ، نرم‌افزار یا محصول…', 'Search games, films, music, apps or products…')} aria-label={L('جست‌وجو در سایت', 'Search the site')}/><button type="submit">{L('جست‌وجو', 'Search')}</button></form>}
            {chips.length > 0 && <nav className="mbx-chips" aria-label={L('میان‌برها', 'Shortcuts')}><span>{L('پرطرفدار:', 'Popular:')}</span>{chips.map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}</nav>}
            <div className="mb-actions">
              {live(section.action.href) && <Link className="mb-btn mb-btn-primary" href={section.action.href}>{T(section.action.label)}<Icon name="arrow" size={18}/></Link>}
              {live('/vip') && <Link className="mb-btn mbx-btn-glass" href="/vip"><Icon name="crown" size={18}/>{L('اشتراک ویژه', 'VIP membership')}</Link>}
            </div>
            {stats.length > 0 && <dl className="mbx-stats">{stats.map(stat => <div key={stat.key}><dt>{stat.label}</dt><dd><Link href={stat.href}>{stat.value.toLocaleString(fa ? 'fa-IR' : 'en-US')}{stat.value >= 10 ? '+' : ''}</Link></dd></div>)}</dl>}
          </div>
          <div className="mbx-bento" aria-label={L('تازه‌ترین‌ها', 'Newest')}>
            {game && <Link href={game.href} className="mbx-tile is-wide" style={{ backgroundImage: `url("${encodeURI(game.image || game.cover)}")` }}><span className="mbx-tile-shade" aria-hidden="true"/><em><Icon name="game" size={14}/>{L('بازی', 'Game')}</em>{game.score != null && <span className="mbx-score">{game.score.toLocaleString(fa ? 'fa-IR' : 'en-US')}</span>}<b>{game.title}</b><small>{game.meta}</small></Link>}
            {film && <Link href={film.href} className="mbx-tile is-tall" style={{ backgroundImage: `url("${encodeURI(film.cover || film.image || '')}")` }}><span className="mbx-tile-shade" aria-hidden="true"/><em><Icon name="film" size={14}/>{L('فیلم و سریال', 'Film')}</em><b>{film.title}</b><small>{film.meta}</small></Link>}
            {album && <Link href={album.href} className="mbx-tile" style={{ backgroundImage: `url("${encodeURI(album.cover)}")` }}><span className="mbx-tile-shade" aria-hidden="true"/><em><Icon name="music" size={14}/>{L('موزیک', 'Music')}</em><b>{album.title}</b></Link>}
            {product && <Link href={`/products/${product.slug}`} className="mbx-tile is-product"><span className="mbx-product-art">{product.image ? <img src={product.image} alt="" loading="lazy"/> : <Icon name="bag" size={32}/>}</span><em><Icon name="bag" size={14}/>{L('فروشگاه', 'Shop')}</em><b>{fa ? product.name : product.nameEn || product.name}</b><span className="mbx-price"><bdi>{money(product.price, product.currency)}</bdi></span></Link>}
          </div>
        </div>
        {section.items.length > 0 && <ul className="mb-container mbx-values">{section.items.map((item, index) => <li key={index}><span className="mb-icon"><Icon name={item.icon} size={20}/></span><span><strong>{T(item.title)}</strong><small>{T(item.text)}</small></span></li>)}</ul>}
      </section>
    }
    case 'services': {
      const items = section.items.filter(item => live(item.href))
      if (!items.length) return null
      const count = (href: string) => (data.stats || []).find(stat => href === stat.href || href.startsWith(`${stat.href}/`))
      const art = (href: string) => { const kind = SHOWCASE.find(column => href.startsWith(column.href))?.kind; const item = kind ? data.showcase.find(entry => entry.kind === kind && (entry.image || entry.cover)) : undefined; return item?.image || item?.cover || (href.startsWith('/products') ? data.products.find(p => p.image)?.image : '') || '' }
      return <section className="mb-container mb-section" id={section.id}>{heading()}
        <div className="mbx-sections">{items.map((item, index) => { const [icon, tone] = styleOf(item.href, item.icon); const stat = count(item.href); const image = art(item.href); return <Link key={index} href={item.href} className={`mbx-section tone-${tone}${index < 2 ? ' is-big' : ''}`}>
          {image && <span className="mbx-section-art" style={{ backgroundImage: `url("${encodeURI(image)}")` }} aria-hidden="true"/>}
          <span className="mbx-section-icon"><Icon name={icon} size={24}/></span>
          <span className="mbx-section-copy"><b>{T(item.title)}</b><small>{T(item.text)}</small></span>
          {stat && <span className="mbx-section-count">{stat.value.toLocaleString(fa ? 'fa-IR' : 'en-US')} {stat.label}</span>}
          <span className="mbx-section-go" aria-hidden="true"><Icon name="arrow" size={16}/></span>
        </Link> })}</div>
      </section>
    }
    case 'products':
      if (!data.products.length || !live('/products')) return null
      return <section className="mb-container mb-section" id={section.id}>{heading({ href: '/products', label: L('ورود به فروشگاه', 'Visit the shop') })}
        <div className="mbx-products">{data.products.slice(0, 8).map(product => { const off = product.listPrice && product.listPrice > product.price ? Math.round((1 - product.price / product.listPrice) * 100) : 0; return <Link key={product.id} href={`/products/${product.slug}`} className="mbx-product">
          <span className="mbx-product-img">{product.image ? <img src={product.image} alt="" loading="lazy"/> : <Icon name="bag" size={36}/>}{off > 0 && <em className="mbx-off">{off.toLocaleString(fa ? 'fa-IR' : 'en-US')}٪</em>}</span>
          {product.category && <small className="mbx-product-cat">{fa ? product.category.name : product.category.nameEn || product.category.name}</small>}
          <b>{fa ? product.name : product.nameEn || product.name}</b>
          <span className="mbx-product-price">{off > 0 && <s><bdi>{money(product.listPrice!, product.currency)}</bdi></s>}<bdi>{money(product.price, product.currency)}</bdi></span>
        </Link> })}</div>
      </section>
    case 'showcase': {
      const columns = SHOWCASE.filter(column => column.kind !== 'forum' && live(column.href)).map(column => ({ ...column, items: data.showcase.filter(item => item.kind === column.kind) })).filter(column => column.items.length)
      const topics = live('/forum') ? data.showcase.filter(item => item.kind === 'forum').slice(0, 6) : []
      const community = live('/feed') ? data.community : null
      if (!columns.length && !topics.length && !community) return null
      return <>
        {columns.length > 0 && <section className="mb-container mb-section mbx-rails" id={section.id}>{heading()}
          <div className="mbx-tabs">
            {columns.map((column, index) => <input key={column.kind} type="radio" name={`mbx-tab-${section.id}`} id={`mbx-${section.id}-${column.kind}`} defaultChecked={index === 0} className={`mbx-tab-input is-${column.kind}`}/>)}
            <div className="mbx-tab-labels" role="tablist">{columns.map(column => <label key={column.kind} htmlFor={`mbx-${section.id}-${column.kind}`} className={`is-${column.kind}`}><Icon name={column.icon} size={16}/>{fa ? column.fa : column.en}</label>)}</div>
            {columns.map(column => <div key={column.kind} className={`mbx-tab-panel is-${column.kind}`}>
              <div className={`mbx-posters${column.kind === 'music' || column.kind === 'software' ? ' is-square' : ''}`}>{column.items.map(item => <Link key={item.href} href={item.href} className="mbx-poster">
                <span className="mbx-poster-art">{item.cover ? <img src={item.cover} alt="" loading="lazy"/> : <Icon name={column.icon} size={28}/>}{item.vip && <em className="mbx-vip">VIP</em>}{item.score != null && <span className="mbx-score is-small">{item.score.toLocaleString(fa ? 'fa-IR' : 'en-US')}</span>}</span>
                <b>{item.title}</b>{item.meta && <small>{item.meta}</small>}
              </Link>)}</div>
              <Link href={column.href} className="mb-link mbx-more">{L(`همهٔ ${column.fa}`, `All ${column.en}`)}<Icon name="arrow" size={14}/></Link>
            </div>)}
          </div>
        </section>}
        {(community || topics.length > 0) && <section className="mb-container mb-section mbx-community">
          <header className="mb-heading"><div><span className="mb-eyebrow">{L('جامعهٔ موبوکام', 'Community')}</span><h2>{L('آدم‌ها، گفت‌وگوها، سلیقه‌ها', 'People, talks and tastes')}</h2><p>{L('ببینید دیگران چه می‌بازند، چه می‌بینند و دربارهٔ چه حرف می‌زنند.', 'See what others play, watch and talk about.')}</p></div>{community && <Link className="mb-link" href="/feed">{L('ورود به تازه‌ها', 'Open the feed')}<Icon name="arrow" size={16}/></Link>}</header>
          <div className="mbx-community-grid">
            {community && community.posts.length > 0 && <div className="mbx-feed">{community.posts.slice(0, 4).map(post => <Link key={post.id} href={`/feed/p/${post.id}`} className="mbx-post">
              <span className="mbx-post-head">{post.author.avatar ? <img src={post.author.avatar} alt="" className="mbx-ava"/> : <span className="mbx-ava" style={{ background: post.author.avatarColor }}>{post.author.name.slice(0, 1)}</span>}<span><b>{post.author.name}{post.author.verified && <span className="mbx-check" aria-label={L('تأییدشده', 'Verified')}>✔</span>}</b><small dir="ltr">@{post.author.username}</small></span></span>
              <p dir="auto">{post.text}</p>
              {post.image && <img src={post.image} alt="" className="mbx-post-img" loading="lazy"/>}
              <span className="mbx-post-meta"><span><Icon name="heart" size={14}/>{post.likes.toLocaleString(fa ? 'fa-IR' : 'en-US')}</span><span><Icon name="comment" size={14}/>{post.comments.toLocaleString(fa ? 'fa-IR' : 'en-US')}</span></span>
            </Link>)}<Link href="/feed" className="mbx-post is-invite"><span className="mbx-invite-icon"><Icon name="sparkles" size={22}/></span><span><b>{L('شما هم بنویسید', 'Share yours')}</b><small>{L('از بازی، فیلم یا آهنگی که این روزها دوستش دارید بگویید و دوستان تازه پیدا کنید.', 'Tell people what you play, watch or listen to — and find new friends.')}</small></span><span className="mb-btn mb-btn-primary">{L('نوشتن پست', 'Write a post')}</span></Link></div>}
            <aside className="mbx-side">
              {topics.length > 0 && <div className="mbx-topics"><header><Icon name="flame" size={18}/><b>{L('داغ در تالار گفتمان', 'Hot on the forum')}</b></header><ol>{topics.map((topic, index) => <li key={topic.href}><Link href={topic.href}><span className="mbx-rank">{(index + 1).toLocaleString(fa ? 'fa-IR' : 'en-US')}</span><span><b>{topic.title}</b>{topic.meta && <small>{topic.meta}</small>}</span></Link></li>)}</ol></div>}
              {community && community.members.length > 0 && <div className="mbx-members"><header><Icon name="users" size={18}/><b>{L('اعضای فعال', 'Active members')}</b><small>{community.total.toLocaleString(fa ? 'fa-IR' : 'en-US')} {L('عضو', 'members')}</small></header><div className="mbx-faces">{community.members.map(member => <Link key={member.username} href={`/u/${member.username}`} title={member.name}>{member.avatar ? <img src={member.avatar} alt={member.name}/> : <span style={{ background: member.avatarColor }}>{member.name.slice(0, 1)}</span>}</Link>)}</div><Link href="/people" className="mb-btn mb-btn-ghost mbx-join">{L('پیدا کردن دوستان', 'Find people')}</Link></div>}
            </aside>
          </div>
        </section>}
      </>
    }
    case 'features':
      return <section className="mb-container mb-section mb-about" id={section.id}>
        <div className="mb-about-copy">{heading()}</div>
        <div className="mb-features">{section.items.map((item, index) => <article key={index} className="mb-card"><span className="mb-icon"><Icon name={item.icon} size={22}/></span><h3>{T(item.title)}</h3><p>{T(item.text)}</p></article>)}</div>
      </section>
    case 'posts':
      if (!data.posts.length || !live('/blog')) return null
      return <section className="mb-container mb-section" id={section.id}>{heading({ href: '/blog', label: L('همهٔ مطالب مجله', 'All articles') })}
        <div className="mbx-mag">{data.posts.map((post, index) => <Link key={post.id} href={`/blog/${post.slug}`} className={`mbx-article${index === 0 ? ' is-lead' : ''}`}>
          <span className="mbx-article-img">{post.cover ? <img src={post.cover} alt="" loading="lazy"/> : <Icon name="news" size={34}/>}</span>
          <span className="mbx-article-body">{post.category && <small className="mb-eyebrow">{fa ? post.category.name : post.category.nameEn || post.category.name}</small>}<b>{fa ? post.title : post.titleEn || post.title}</b>{index === 0 && <small className="mbx-excerpt">{fa ? post.excerpt : post.excerptEn || post.excerpt}</small>}<time dateTime={new Date(post.publishedAt).toISOString()}>{new Date(post.publishedAt).toLocaleDateString(fa ? 'fa-IR' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</time></span>
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
        <div className="mbx-cta">
          <span className="mbx-cta-orb" aria-hidden="true"/>
          <span className="mbx-cta-crown" aria-hidden="true"><Icon name="crown" size={40}/></span>
          <div className="mbx-cta-copy">{T(section.eyebrow) && <span className="mbx-cta-eyebrow">{T(section.eyebrow)}</span>}<h2>{T(section.title)}</h2><p>{T(section.description)}</p></div>
          {live(section.action.href) && <Link className="mb-btn mb-btn-gold" href={section.action.href}>{T(section.action.label)}<Icon name="arrow" size={18}/></Link>}
        </div>
      </section>
    default:
      return null
  }
}

const Home: NonNullable<ThemeServerModule['Home']> = (props) => <div data-code-theme="mobocom"><MobocomHome {...props}/></div>
export const theme: ThemeServerModule = { Home }
