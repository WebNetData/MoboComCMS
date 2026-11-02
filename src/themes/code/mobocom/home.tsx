import Link from '@/platform/routing/Link'
import { ThemePlanCards, ThemePublicForm, themeFormatAmount, themeImage, themeImageSet, type ThemeHomeProps } from '@/themes/sdk/server'
import type { ThemeServerModule } from '@/themes/types'
import HomeHero from './home/hero'
import ServiceDirectory from './home/service-directory'
import Icon from './icons'

type LocalText = { fa: string; en: string; [locale: string]: string }
type Section = ThemeHomeProps['site']['sections'][number]
type Showcase = ThemeHomeProps['data']['showcase'][number]

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
  return <main className="mb-home" data-presentation="universe" id="main-content">{props.site.sections.filter(section => section.enabled).map(section => <MobocomSection key={section.id} section={section} {...props}/>)}</main>
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
    case 'hero':
      return <HomeHero section={section} site={site} locale={locale} data={data}/>
    case 'services':
      return <ServiceDirectory section={section} site={site} locale={locale} data={data}/>
    case 'products':
      if (!data.products.length || !live('/products')) return null
      return <section className="mb-container mb-section mvl-section mvl-store" id={section.id}>{heading({ href: '/products', label: L('ورود به فروشگاه', 'Visit the shop') })}
        <div className="mbx-products">{data.products.slice(0, 8).map(product => { const off = product.listPrice && product.listPrice > product.price ? Math.round((1 - product.price / product.listPrice) * 100) : 0; return <Link key={product.id} href={`/products/${product.slug}`} className="mbx-product">
          <span className="mbx-product-img">{product.image ? <img src={themeImage(product.image, 400)} srcSet={themeImageSet(product.image, 400)} alt="" loading="lazy"/> : <span className="mbx-product-ph"><Icon name="bag" size={30}/></span>}{off > 0 && <em className="mbx-off">{off.toLocaleString(fa ? 'fa-IR' : 'en-US')}٪</em>}</span>
          <span className="mvl-product-info">{product.category && <small className="mbx-product-cat">{fa ? product.category.name : product.category.nameEn || product.category.name}</small>}<h3 dir="auto">{fa ? product.name : product.nameEn || product.name}</h3></span>
          <span className="mbx-product-foot"><span className="mbx-product-price">{off > 0 && <s><bdi>{money(product.listPrice!, product.currency)}</bdi></s>}<bdi>{money(product.price, product.currency)}</bdi></span><span className="mvl-product-action" aria-hidden="true"><span>{L('مشاهده', 'View')}</span><span className="mbx-product-go"><Icon name="arrow" size={16}/></span></span></span>
        </Link> })}</div>
      </section>
    case 'showcase': {
      const columns = SHOWCASE.filter(column => column.kind !== 'forum' && live(column.href)).map(column => ({ ...column, items: data.showcase.filter(item => item.kind === column.kind) })).filter(column => column.items.length)
      const topics = live('/forum') ? data.showcase.filter(item => item.kind === 'forum').slice(0, 6) : []
      const community = live('/feed') ? data.community : null
      // Post rows share the column height; an invite on its own row stays compact.
      const feedRows = (posts: number) => ({ gridTemplateRows: posts % 2 ? `repeat(${Math.ceil(posts / 2)}, minmax(min-content, 1fr))` : `${posts ? `repeat(${posts / 2}, minmax(min-content, 1fr)) ` : ''}auto` })
      if (!columns.length && !topics.length && !community) return null
      return <>
        {columns.length > 0 && <section className="mb-container mb-section mbx-rails mvl-section mvl-media" id={section.id}>{heading()}
          <div className="mbx-tabs">
            {columns.map((column, index) => <input key={column.kind} type="radio" name={`mbx-tab-${section.id}`} id={`mbx-${section.id}-${column.kind}`} defaultChecked={index === 0} className={`mbx-tab-input is-${column.kind}`}/>)}
            <div className="mbx-tab-labels" role="group" aria-label={L('بخش‌ها', 'Sections')} tabIndex={0}>{columns.map(column => <label key={column.kind} htmlFor={`mbx-${section.id}-${column.kind}`} className={`is-${column.kind}`}><Icon name={column.icon} size={16}/>{fa ? column.fa : column.en}<span className="mvl-tab-count">{column.items.length.toLocaleString(fa ? 'fa-IR' : 'en-US')}</span></label>)}</div>
            {columns.map(column => <div key={column.kind} className={`mbx-tab-panel is-${column.kind}`}>
              <div className={`mbx-posters${column.kind === 'music' || column.kind === 'software' ? ' is-square' : ''}`}>{column.items.map(item => <Link key={item.href} href={item.href} className="mbx-poster">
                <span className="mbx-poster-art">{item.cover ? <img src={item.cover} alt="" loading="lazy"/> : <Icon name={column.icon} size={28}/>}{item.vip && <em className="mbx-vip">VIP</em>}{item.score != null && <span className="mbx-score is-small">{item.score.toLocaleString(fa ? 'fa-IR' : 'en-US')}</span>}</span>
                <b>{item.title}</b>{item.meta && <small>{item.meta}</small>}
              </Link>)}</div>
              <Link href={column.href} className="mb-link mbx-more">{L(`همهٔ ${column.fa}`, `All ${column.en}`)}<Icon name="arrow" size={14}/></Link>
            </div>)}
          </div>
        </section>}
        {(community || topics.length > 0) && <section className="mb-container mb-section mbx-community mvl-section mvl-community">
          <header className="mb-heading"><div><span className="mb-eyebrow">{L('جامعهٔ موبوکام', 'Community')}</span><h2>{L('آدم‌ها، گفت‌وگوها، سلیقه‌ها', 'People, talks and tastes')}</h2><p>{L('ببینید دیگران چه بازی می‌کنند، چه می‌بینند و دربارهٔ چه حرف می‌زنند.', 'See what others play, watch and talk about.')}</p></div>{community && <Link className="mb-link" href="/feed">{L('ورود به تازه‌ها', 'Open the feed')}<Icon name="arrow" size={16}/></Link>}</header>
          {community && <Link href="/feed" className="mbx-composer">
            <span className="mbx-composer-icon" aria-hidden="true"><Icon name="pen" size={18}/></span>
            <span className="mbx-composer-field"><b>{L('شما هم بنویسید…', 'Share yours…')}</b><small>{L('از بازی، فیلم یا آهنگی که این روزها دوستش دارید بگویید', 'What are you playing, watching or listening to?')}</small></span>
            <span className="mbx-composer-tags" aria-hidden="true"><span><Icon name="game" size={15}/></span><span><Icon name="film" size={15}/></span><span><Icon name="music" size={15}/></span></span>
            <span className="mbx-composer-btn">{L('نوشتن پست', 'Write a post')}</span>
          </Link>}
          <div className={`mbx-community-grid${community ? '' : ' is-solo'}${community && !community.posts.length ? ' is-empty' : ''}`}>
            {community && community.posts.length > 0 && <div className="mbx-feed" style={feedRows(community.posts.slice(0, 4).length)}>{community.posts.slice(0, 4).map(post => <Link key={post.id} href={`/feed/p/${post.id}`} className="mbx-post">
              <span className="mbx-post-head">{post.author.avatar ? <img src={themeImage(post.author.avatar, 80)} alt="" className="mbx-ava" loading="lazy"/> : <span className="mbx-ava" style={{ background: post.author.avatarColor }}>{post.author.name.slice(0, 1)}</span>}<span><b>{post.author.name}{post.author.verified && <span className="mbx-check" aria-label={L('تأییدشده', 'Verified')}>✔</span>}</b><small dir="ltr">@{post.author.username}</small></span></span>
              <p dir="auto">{post.text}</p>
              {post.image && <img src={themeImage(post.image, 640)} srcSet={themeImageSet(post.image, 640)} alt="" className="mbx-post-img" loading="lazy"/>}
              <span className="mbx-post-meta"><span><Icon name="heart" size={14}/>{post.likes.toLocaleString(fa ? 'fa-IR' : 'en-US')}</span><span><Icon name="comment" size={14}/>{post.comments.toLocaleString(fa ? 'fa-IR' : 'en-US')}</span></span>
            </Link>)}</div>}
            <aside className="mbx-side">
              {topics.length > 0 && <div className="mbx-topics"><header><Icon name="flame" size={18}/><b>{L('داغ در تالار گفتمان', 'Hot on the forum')}</b></header><ol>{topics.map((topic, index) => <li key={topic.href}><Link href={topic.href}><span className="mbx-rank">{(index + 1).toLocaleString(fa ? 'fa-IR' : 'en-US')}</span><span><b>{topic.title}</b>{topic.meta && <small>{topic.meta}</small>}</span></Link></li>)}</ol></div>}
              {community && community.members.length > 0 && <div className="mbx-members"><header><Icon name="users" size={18}/><b>{L('اعضای فعال', 'Active members')}</b><small>{community.total.toLocaleString(fa ? 'fa-IR' : 'en-US')} {L('عضو', 'members')}</small></header><div className="mbx-faces">{community.members.map(member => <Link key={member.username} href={`/u/${member.username}`} title={member.name}>{member.avatar ? <img src={themeImage(member.avatar, 80)} alt={member.name} loading="lazy"/> : <span style={{ background: member.avatarColor }}>{member.name.slice(0, 1)}</span>}</Link>)}</div><Link href="/people" className="mb-btn mb-btn-ghost mbx-join">{L('پیدا کردن دوستان', 'Find people')}</Link></div>}
            </aside>
          </div>
        </section>}
      </>
    }
    case 'features':
      return <section className="mb-container mb-section mb-about mvl-section mvl-about" id={section.id}>
        <div className="mb-about-panel">
          <span className="mb-about-grid" aria-hidden="true"/>
          <div className="mb-about-copy">{heading()}</div>
          <div className="mb-features">{section.items.map((item, index) => <article key={index} className={`mb-feature tone-${index % 4}`}><span className="mb-feature-icon"><Icon name={item.icon} size={24}/></span><span className="mb-feature-num" aria-hidden="true">{(index + 1).toLocaleString(fa ? 'fa-IR' : 'en-US', { minimumIntegerDigits: 2 })}</span><h3>{T(item.title)}</h3><p>{T(item.text)}</p></article>)}</div>
        </div>
      </section>
    case 'posts':
      if (!data.posts.length || !live('/blog')) return null
      return <section className="mb-container mb-section mvl-section mvl-journal" id={section.id}>{heading({ href: '/blog', label: L('همهٔ مطالب مجله', 'All articles') })}
        <div className="mbx-mag">{data.posts.map((post, index) => <Link key={post.id} href={`/blog/${post.slug}`} className={`mbx-article${index === 0 ? ' is-lead' : ''}${post.cover ? ' has-cover' : ' has-no-cover'}`}>
          <span className="mbx-article-img">{post.cover ? <img src={post.cover} alt="" loading="lazy"/> : <Icon name="news" size={index === 0 ? 48 : 26}/>}</span>
          <span className="mbx-article-body">{post.category && <small className="mb-eyebrow">{fa ? post.category.name : post.category.nameEn || post.category.name}</small>}<b>{fa ? post.title : post.titleEn || post.title}</b>{index === 0 && <small className="mbx-excerpt">{fa ? post.excerpt : post.excerptEn || post.excerpt}</small>}<time dateTime={new Date(post.publishedAt).toISOString()}>{index === 0 && <span className="mbx-read">{L('ادامهٔ مطلب', 'Read more')}<Icon name="arrow" size={14}/></span>}{new Date(post.publishedAt).toLocaleDateString(fa ? 'fa-IR' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</time></span>
        </Link>)}</div>
      </section>
    case 'plans':
      if (!data.plans.length || !live('/plans')) return null
      return <section className="mb-container mb-section" id={section.id}>{heading({ href: '/plans', label: L('همهٔ پلن‌ها', 'All plans') })}<ThemePlanCards plans={data.plans} tomanRate={data.tomanRate} showWallet={false}/></section>
    case 'steps':
      return <section className="mb-container mb-section" id={section.id}>{heading()}<ol className="mb-steps">{section.items.map((item, index) => <li key={index} className="mb-card"><span className="mb-step">{(index + 1).toLocaleString(fa ? 'fa-IR' : 'en-US')}</span><h3>{T(item.title)}</h3><p>{T(item.text)}</p></li>)}</ol></section>
    case 'faq':
      return <section className="mb-container mb-section mb-faq mvl-section mvl-faq" id={section.id}><div className="mvl-faq-intro"><span className="mvl-faq-symbol" aria-hidden="true"><Icon name="chat" size={32}/></span>{heading()}</div>
        <div className="mb-faq-list">{section.items.map((item, index) => <details key={index}><summary><span className="mvl-faq-number" aria-hidden="true">{(index + 1).toLocaleString(fa ? 'fa-IR' : 'en-US', { minimumIntegerDigits: 2 })}</span><span className="mvl-faq-question">{T(item.title)}</span><span className="mvl-faq-toggle" aria-hidden="true"><Icon name="plus" size={18}/></span></summary><p>{T(item.text)}</p></details>)}</div>
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
