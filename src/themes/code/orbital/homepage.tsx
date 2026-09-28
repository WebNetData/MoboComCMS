import Link from '@/platform/routing/Link'
import { ThemePlanCards, ThemePublicForm, themeFormatAmount, type ThemeHomeProps } from '@/themes/sdk/server'
import Glyph from './glyph'
import OrbitalGlobe from './globe'
import NetworkExplorer from './network'
import Artwork from './artwork'

type LocalText = { fa: string; en: string; [locale: string]: string }
type Section = ThemeHomeProps['site']['sections'][number]

export default function OrbitalHome(props: ThemeHomeProps) {
  const network = props.site.sections.find(section => section.enabled && section.kind === 'network')
  const apps = props.site.sections.find(section => section.enabled && section.kind === 'apps')
  return <main className="hp-home" id="main-content">{props.site.sections.filter(section => section.enabled).map(section => <OrbitalSection key={section.id} {...props} site={{ ...props.site, sections: [section] }} networkHref={network ? '#' + network.id : undefined} appsHref={apps ? '#' + apps.id : '/dashboard/tickets'} />)}</main>
}

function OrbitalSection({ site, locale, data, networkHref, appsHref }: ThemeHomeProps & { networkHref?: string; appsHref: string }) {
  const L = (fa: string, en: string) => site.copy?.[en]?.[locale] || (locale === 'fa' ? fa : en)
  const T = (value: LocalText) => value[locale] || value.en || value.fa
  const section = (kind: Section['kind']) => site.sections.find(item => item.enabled && item.kind === kind)
  const count = (value: number) => value.toLocaleString(locale === 'fa' ? 'fa-IR' : 'en-US')
  const money = (value: number, currency: string) => themeFormatAmount(value, currency, locale === 'fa' ? 'fa-IR' : 'en-US')
  const hero = section('hero'), products = section('products'), network = section('network')
  const features = section('features'), plans = section('plans'), posts = section('posts')
  const apps = section('apps'), steps = section('steps'), faq = section('faq'), cta = section('cta')
  const formSection = section('form')
  const form = formSection && data.forms.find(item => item.slug === formSection.formSlug)
  const countries = new Set(data.locations.map(item => item.country)).size
  const mainPlan = data.plans.find(plan => plan.featured) || data.plans[0]
  const services = [
    ...(mainPlan ? [{ id: `plan-${mainPlan.id}`, title: L('MoboComCMS پریمیوم', 'MoboComCMS Premium'), description: L('اتصال تو. با شرایط خودت.', 'Your connection. On your terms.'), href: `/checkout?planId=${mainPlan.id}`, price: mainPlan.price, currency: mainPlan.currency, icon: 'infinity', image: '', category: L('اشتراک VPN', 'VPN SUBSCRIPTION'), period: `${count(mainPlan.days)} ${L('روز', 'days')}` }] : []),
    ...data.products.slice(0, 3).map((product, index) => ({ id: `product-${product.id}`, title: locale === 'fa' ? product.name : product.nameEn || product.name, description: product.category ? (locale === 'fa' ? product.category.name : product.category.nameEn || product.category.name) : L('برای دنیای دیجیتال تو.', 'Made for your digital world.'), href: `/products/${product.slug}`, price: product.price, currency: product.currency, icon: ['router', 'gift', 'devices'][index], image: product.image, category: L('فروشگاه دیجیتال', 'DIGITAL STORE'), period: '' })),
  ]
  const heading = (item: Section, action?: { href: string; label: string }) => <div className="hp-section-heading"><div><span className="hp-eyebrow">{T(item.eyebrow)}</span><h2>{T(item.title)}</h2><p>{T(item.description)}</p></div>{action && <Link className="hp-text-link" href={action.href}>{action.label}<Glyph name="arrow" size={17}/></Link>}</div>
  const platforms = [['Windows', 'windows'], ['Android', 'android'], ['iOS', 'apple'], ['macOS', 'apple'], ['Linux', 'terminal']]

  return <>
    {hero && <section className="hp-hero" id={hero.id} aria-labelledby="hp-hero-title">
      <div className="hp-container hp-hero-grid">
        <div className="hp-hero-copy">
          <div className="hp-hero-pill"><span className="hp-status-dot"/>{T(hero.eyebrow)}</div>
          <h1 id="hp-hero-title">{T(hero.title).split('\n').map((line, index, lines) => <span key={index} className={index === lines.length - 1 ? 'hp-gradient-text' : ''}>{line}</span>)}</h1>
          <p>{T(hero.description)}</p>
          <div className="hp-hero-actions"><Link className="hp-button hp-button-primary" href={hero.action.href}>{T(hero.action.label)}<Glyph name="arrow" size={19}/></Link>{networkHref && <Link className="hp-button hp-button-secondary" href={networkHref || "/plans"}>{L('مشاهده سرورها', 'Explore servers')}</Link>}</div>
          <div className="hp-platforms" aria-label={L('پلتفرم‌های پشتیبانی‌شده', 'Supported platforms')}>{platforms.map(([name, icon]) => <a href={appsHref} key={name} title={name}><Glyph name={icon} size={19}/><span>{name}</span></a>)}</div>
          <div className="hp-hero-note"><Glyph name="shield" size={17}/><span>{L('یک حساب. تمام دستگاه‌های تو.', 'One account. All your devices.')}</span></div>
        </div>
        <OrbitalGlobe locations={data.locations} locale={locale} brand={site.brand} image={hero.image} networkHref={networkHref || "/plans"}/>
        <aside className="hp-network-summary" aria-label={L('پوشش شبکه', 'Network coverage')}>
          <div className="hp-summary-title"><span className="hp-status-dot"/>{L('شبکهٔ جهانی', 'GLOBAL NETWORK')}</div>
          <h2>{L('فاصله کمتر.', 'Closer together.')}<br/>{L('امکان بیشتر.', 'More possibilities.')}</h2>
          <div className="hp-summary-metric"><span className="hp-icon-box"><Glyph name="globe"/></span><div><strong>{count(data.locations.length)}</strong><span>{L('موقعیت شبکه', 'Network locations')}</span></div></div>
          <div className="hp-summary-metric"><span className="hp-icon-box hp-violet"><Glyph name="pin"/></span><div><strong>{count(countries)}</strong><span>{L('کشور', 'Countries')}</span></div></div>
          <div className="hp-summary-metric"><span className="hp-icon-box hp-mint"><Glyph name="devices"/></span><div><strong>{count(platforms.length)}</strong><span>{L('پلتفرم', 'Platforms')}</span></div></div>
          {networkHref && <Link href={networkHref || "/plans"} className="hp-text-link">{L('کشف شبکه', 'Explore the network')}<Glyph name="arrow" size={16}/></Link>}
        </aside>
      </div>
      <div className="hp-container hp-value-strip">{hero.items.map((item, index) => <div key={index}><Glyph name={item.icon} size={26}/><span><strong>{T(item.title)}</strong><small>{T(item.text)}</small></span></div>)}</div>
    </section>}

    {products && <section className="hp-container hp-section" id={products.id}>
      {heading(products, { href: '/products', label: L('همهٔ محصولات', 'Explore all products') })}
      {services.length ? <div className="hp-products">{services.map((service, index) => <Link href={service.href} className={`hp-product hp-tone-${index}`} key={service.id}>
        <div className="hp-product-top"><span>{service.category}</span><Glyph name="arrow" size={17}/></div>
        <div className="hp-product-art"><Artwork src={service.image} icon={service.icon} kind="product"/></div>
        <h3>{service.title}</h3><p>{service.description}</p>
        <div className="hp-product-bottom"><div><small>{L('از', 'From')}</small><strong><bdi>{money(service.price, service.currency)}</bdi></strong>{service.period && <span>/ {service.period}</span>}</div><span className="hp-product-action">{L('مشاهده', 'Discover')}<Glyph name="arrow" size={16}/></span></div>
      </Link>)}</div> : <div className="hp-empty"><Glyph name="grid" size={28}/><p>{L('محصولات تازه به‌زودی اینجا خواهند بود.', 'New products will be here soon.')}</p><Link href="/plans" className="hp-text-link">{L('مشاهده پلن‌ها', 'Explore plans')}</Link></div>}
    </section>}

    {network && <section className="hp-network-section" id={network.id}><div className="hp-container hp-section">
      {heading(network)}<NetworkExplorer locations={data.locations} locale={locale}/>
    </div></section>}

    {features && <section className="hp-container hp-section" id={features.id}>
      <div className="hp-feature-layout"><div className="hp-feature-intro"><span className="hp-eyebrow">{T(features.eyebrow)}</span><h2>{T(features.title)}</h2><p>{T(features.description)}</p><div className="hp-security-emblem" aria-hidden="true"><span/><span/><Glyph name="shield" size={70}/></div><Link className="hp-text-link" href="/register">{L('به دنیای MoboComCMS بیا', 'Make yourself at home')}<Glyph name="arrow" size={17}/></Link></div>
      <div className="hp-features">{features.items.map((item, index) => <article key={index}><span className={`hp-icon-box ${index === 1 ? 'hp-violet' : index === 2 ? 'hp-mint' : ''}`}><Glyph name={item.icon} size={25}/></span><h3>{T(item.title)}</h3><p>{T(item.text)}</p></article>)}</div></div>
    </section>}

    {plans && <section className="hp-container hp-section hp-pricing" id={plans.id}>
      {heading(plans, { href: '/plans', label: L('مقایسهٔ پلن‌ها', 'Compare plans') })}
      {data.plans.length ? <ThemePlanCards plans={data.plans} tomanRate={data.tomanRate} showWallet={false}/> : <div className="hp-empty"><Glyph name="shield" size={28}/><p>{L('پلن‌ها به‌زودی در دسترس خواهند بود.', 'Plans will be available soon.')}</p><Link href="/dashboard/tickets" className="hp-text-link">{L('تماس با پشتیبانی', 'Contact support')}</Link></div>}
    </section>}

    {apps && <section className="hp-container hp-section" id={apps.id}><div className="hp-apps-panel"><div className="hp-apps-copy"><span className="hp-eyebrow">{T(apps.eyebrow)}</span><h2>{T(apps.title)}</h2><p>{T(apps.description)}</p><div className="hp-app-links">{apps.items.map((item, index) => <Link href={item.href || '/dashboard/tickets'} key={index}><span className="hp-icon-box"><Glyph name={/android/i.test(item.title.en) ? 'android' : /windows/i.test(item.title.en) ? 'windows' : /linux/i.test(item.title.en) ? 'terminal' : 'apple'}/></span><span><strong>{T(item.title)}</strong><small>{T(item.text)}</small></span><Glyph name="arrow" size={17}/></Link>)}</div></div>
      <div className="hp-device-scene" aria-hidden="true"><div className="hp-device-orbit"/><div className="hp-laptop"><div className="hp-device-header"><span className="hp-mini-mark">H</span> Happ<span>VPN</span><i>•••</i></div><div className="hp-device-map"/><div className="hp-device-bottom"><Glyph name="shield" size={26}/><span>{L('دنیای تو، بدون مرز.', 'Your world. Without limits.')}</span></div></div><div className="hp-phone"><span className="hp-phone-camera"/><span className="hp-mini-mark">H</span><strong>Happ<span>VPN</span></strong><div className="hp-phone-shield"><Glyph name="shield" size={40}/></div><div className="hp-phone-line"/><div className="hp-phone-line short"/><div className="hp-phone-button"><Glyph name="bolt" size={20}/></div></div><span className="hp-device-caption">{L('از میز کارت تا آن‌سوی دنیا.', 'From your desk to anywhere.')}</span></div>
    </div></section>}

    {posts && data.posts.length > 0 && <section className="hp-container hp-section" id={posts.id}>
      {heading(posts, { href: '/blog', label: L('ورود به مجله', 'Explore the journal') })}
      <div className="hp-journal">{data.posts.map((post, index) => <Link href={`/blog/${post.slug}`} key={post.id} className={`hp-story hp-story-${index}`}><div className="hp-story-image"><Artwork src={post.cover} icon={['globe', 'shield', 'bolt'][index % 3]} kind="story"/><span className="hp-story-category">{post.category ? (locale === 'fa' ? post.category.name : post.category.nameEn || post.category.name) : L('مجله', 'Journal')}</span></div><div className="hp-story-content"><time dateTime={new Date(post.publishedAt).toISOString()}>{new Date(post.publishedAt).toLocaleDateString(locale === 'fa' ? 'fa-IR' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</time><h3>{locale === 'fa' ? post.title : post.titleEn || post.title}</h3><p>{locale === 'fa' ? post.excerpt : post.excerptEn || post.excerpt}</p><span className="hp-text-link">{L('ادامهٔ مطلب', 'Read story')}<Glyph name="arrow" size={16}/></span></div></Link>)}</div>
    </section>}

    {steps && <section className="hp-container hp-section hp-steps-section" id={steps.id}>{heading(steps)}<div className="hp-steps">{steps.items.map((item, index) => <article key={index}><span className="hp-step-number">{count(index + 1).padStart(2, locale === 'fa' ? '۰' : '0')}</span><div><h3>{T(item.title)}</h3><p>{T(item.text)}</p>{item.href && <Link href={item.href} className="hp-text-link">{L('شروع کنیم', 'Get started')}<Glyph name="arrow" size={16}/></Link>}</div></article>)}</div></section>}

    {faq && <section className="hp-container hp-section hp-faq-section" id={faq.id}><div>{heading(faq)}<Link href="/dashboard/tickets" className="hp-text-link"><Glyph name="chat" size={19}/>{L('گفت‌وگو با پشتیبانی', 'Talk to support')}</Link></div><div className="hp-faq-list">{faq.items.map((item, index) => <details key={index}><summary><strong>{T(item.title)}</strong><Glyph name="plus" size={19}/></summary><p>{T(item.text)}</p></details>)}</div></section>}

    {form && <section className="hp-container hp-section" id={formSection?.id}><div className="hp-section-heading"><div><span className="hp-eyebrow">{form.title}</span><h2>{formSection ? T(formSection.title) : form.title}</h2></div></div><ThemePublicForm form={form}/></section>}
    {cta && <section className="hp-container hp-section" id={cta.id}><div className="hp-final-cta"><div><span className="hp-eyebrow">{T(cta.eyebrow)}</span><h2>{T(cta.title)}</h2><p>{T(cta.description)}</p></div><Link className="hp-button hp-button-primary" href={cta.action.href}>{T(cta.action.label)}<Glyph name="arrow" size={20}/></Link></div></section>}
  </>
}
