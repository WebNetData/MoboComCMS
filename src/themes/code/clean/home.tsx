import Link from '@/platform/routing/Link'
import { ThemePlanCards, ThemePublicForm, themeFormatAmount, type ThemeHomeProps } from '@/themes/sdk/server'
import type { ThemeServerModule } from '@/themes/types'
import CleanIcon from './icons'

type LocalText = { fa: string; en: string; [locale: string]: string }
type Section = ThemeHomeProps['site']['sections'][number]

/**
 * Happ Clean homepage. Sections render in the order and with the copy set in
 * Site Studio, so the admin keeps full control over content; this file only
 * decides presentation. The hero device mirrors the Telegram mini app, which
 * reads the same design tokens, so both surfaces look like one product.
 */
function CleanHome(props: ThemeHomeProps) {
  return <main className="cl-home" id="main-content">
    {props.site.sections.filter(section => section.enabled).map(section => <CleanSection key={section.id} section={section} {...props}/>)}
  </main>
}

function CleanSection({ section, site, locale, data }: ThemeHomeProps & { section: Section }) {
  const fa = locale === 'fa'
  const L = (faText: string, en: string) => site.copy?.[en]?.[locale] || (fa ? faText : en)
  const T = (value: LocalText) => value[locale] || value.en || value.fa
  const count = (value: number) => value.toLocaleString(fa ? 'fa-IR' : 'en-US')
  const heading = (action?: { href: string; label: string }) => <header className="cl-heading">
    <div>{T(section.eyebrow) && <span className="cl-eyebrow">{T(section.eyebrow)}</span>}<h2>{T(section.title)}</h2>{T(section.description) && <p>{T(section.description)}</p>}</div>
    {action && <Link className="cl-link" href={action.href}>{action.label}<CleanIcon name="arrow" size={16}/></Link>}
  </header>

  switch (section.kind) {
    case 'hero': {
      const countries = new Set(data.locations.map(item => item.country)).size
      const bot = data.telegramBot
      return <section className="cl-hero" id={section.id} aria-labelledby="cl-hero-title">
        <div className="cl-container cl-hero-grid">
          <div className="cl-hero-copy">
            {T(section.eyebrow) && <span className="cl-pill"><span className="cl-dot"/>{T(section.eyebrow)}</span>}
            <h1 id="cl-hero-title">{T(section.title).split('\n').map((line, index) => <span key={index}>{line}</span>)}</h1>
            <p className="cl-lead">{T(section.description)}</p>
            <div className="cl-actions">
              <Link className="cl-btn cl-btn-primary" href={section.action.href || '/plans'}>{T(section.action.label) || L('مشاهده پلن‌ها', 'See plans')}<CleanIcon name="arrow" size={18}/></Link>
              {bot ? <a className="cl-btn cl-btn-ghost" href={`https://t.me/${bot}`} target="_blank" rel="noreferrer"><CleanIcon name="send" size={18}/>{L('باز کردن در تلگرام', 'Open in Telegram')}</a>
                : <Link className="cl-btn cl-btn-ghost" href="/trial">{L('تست رایگان', 'Free trial')}</Link>}
            </div>
            <dl className="cl-stats">
              <div><dt>{L('کشور', 'Countries')}</dt><dd>{count(countries)}</dd></div>
              <div><dt>{L('موقعیت سرور', 'Locations')}</dt><dd>{count(data.locations.length)}</dd></div>
              <div><dt>{L('پلتفرم', 'Platforms')}</dt><dd>{count(5)}</dd></div>
            </dl>
          </div>
          <MiniAppPreview site={site} locale={locale} data={data}/>
        </div>
        {section.items.length > 0 && <ul className="cl-container cl-values">{section.items.map((item, index) => <li key={index}><span className="cl-icon"><CleanIcon name={item.icon} size={20}/></span><span><strong>{T(item.title)}</strong><small>{T(item.text)}</small></span></li>)}</ul>}
      </section>
    }
    case 'features':
      return <section className="cl-container cl-section" id={section.id}>{heading()}
        <div className="cl-features">{section.items.map((item, index) => <article key={index} className="cl-card"><span className="cl-icon"><CleanIcon name={item.icon} size={22}/></span><h3>{T(item.title)}</h3><p>{T(item.text)}</p></article>)}</div>
      </section>
    case 'plans':
      return <section className="cl-container cl-section cl-plans" id={section.id}>{heading({ href: '/plans', label: L('مقایسه همه پلن‌ها', 'Compare all plans') })}
        {data.plans.length ? <ThemePlanCards plans={data.plans} tomanRate={data.tomanRate} showWallet={false}/> : <p className="cl-empty">{L('پلن‌ها به‌زودی اضافه می‌شوند.', 'Plans are coming soon.')}</p>}
      </section>
    case 'products':
      if (!data.products.length) return null
      return <section className="cl-container cl-section" id={section.id}>{heading({ href: '/products', label: L('همه محصولات', 'All products') })}
        <div className="cl-grid-3">{data.products.map(product => <Link key={product.id} href={`/products/${product.slug}`} className="cl-card cl-product">
          <div className="cl-product-art">{product.image ? <img src={product.image} alt="" loading="lazy"/> : <CleanIcon name="grid" size={34}/>}</div>
          <h3>{fa ? product.name : product.nameEn || product.name}</h3>
          <span className="cl-price"><bdi>{themeFormatAmount(product.price, product.currency, fa ? 'fa-IR' : 'en-US')}</bdi></span>
        </Link>)}</div>
      </section>
    case 'network': {
      if (!data.locations.length) return null
      const byCountry = [...new Map(data.locations.map(item => [item.country, item])).values()]
      return <section className="cl-container cl-section" id={section.id}>{heading()}
        <ul className="cl-countries">{byCountry.map(item => <li key={item.country}><span aria-hidden="true">{item.flag || '◎'}</span>{fa ? item.countryFa || item.country : item.country}<small>{count(data.locations.filter(other => other.country === item.country).length)}</small></li>)}</ul>
      </section>
    }
    case 'steps':
      return <section className="cl-container cl-section" id={section.id}>{heading()}
        <ol className="cl-steps">{section.items.map((item, index) => <li key={index} className="cl-card"><span className="cl-step">{count(index + 1)}</span><h3>{T(item.title)}</h3><p>{T(item.text)}</p>{item.href && <Link className="cl-link" href={item.href}>{L('شروع', 'Start')}<CleanIcon name="arrow" size={15}/></Link>}</li>)}</ol>
      </section>
    case 'apps': {
      const icon = (title: string) => /android/i.test(title) ? 'android' : /windows/i.test(title) ? 'windows' : /linux/i.test(title) ? 'terminal' : 'apple'
      return <section className="cl-container cl-section" id={section.id}>{heading()}
        <div className="cl-apps">{section.items.map((item, index) => <Link key={index} href={item.href || '/dashboard'} className="cl-card cl-app"><span className="cl-icon"><CleanIcon name={icon(item.title.en)} size={20}/></span><span><strong>{T(item.title)}</strong><small>{T(item.text)}</small></span><CleanIcon name="arrow" size={16}/></Link>)}</div>
      </section>
    }
    case 'posts':
      if (!data.posts.length) return null
      return <section className="cl-container cl-section" id={section.id}>{heading({ href: '/blog', label: L('همه مطالب', 'All articles') })}
        <div className="cl-grid-3">{data.posts.map(post => <Link key={post.id} href={`/blog/${post.slug}`} className="cl-card cl-post">
          <div className="cl-post-cover">{post.cover ? <img src={post.cover} alt="" loading="lazy"/> : <CleanIcon name="globe" size={30}/>}</div>
          <time dateTime={new Date(post.publishedAt).toISOString()}>{new Date(post.publishedAt).toLocaleDateString(fa ? 'fa-IR' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</time>
          <h3>{fa ? post.title : post.titleEn || post.title}</h3>
          <p>{fa ? post.excerpt : post.excerptEn || post.excerpt}</p>
        </Link>)}</div>
      </section>
    case 'faq':
      return <section className="cl-container cl-section cl-faq" id={section.id}>{heading()}
        <div className="cl-faq-list">{section.items.map((item, index) => <details key={index}><summary>{T(item.title)}<CleanIcon name="plus" size={18}/></summary><p>{T(item.text)}</p></details>)}</div>
      </section>
    case 'form': {
      const form = data.forms.find(item => item.slug === section.formSlug)
      if (!form) return null
      return <section className="cl-container cl-section" id={section.id}>{heading()}<div className="cl-card"><ThemePublicForm form={form}/></div></section>
    }
    case 'cta':
      return <section className="cl-container cl-section" id={section.id}>
        <div className="cl-cta"><div>{T(section.eyebrow) && <span className="cl-eyebrow">{T(section.eyebrow)}</span>}<h2>{T(section.title)}</h2><p>{T(section.description)}</p></div>
          <div className="cl-actions"><Link className="cl-btn cl-btn-primary" href={section.action.href || '/plans'}>{T(section.action.label)}<CleanIcon name="arrow" size={18}/></Link>{data.telegramBot && <a className="cl-btn cl-btn-ghost" href={`https://t.me/${data.telegramBot}`} target="_blank" rel="noreferrer"><CleanIcon name="send" size={18}/>{L('مینی‌اپ تلگرام', 'Telegram mini app')}</a>}</div>
        </div>
      </section>
    default:
      return null
  }
}

/** A static rendering of the mini app home, drawn with the same tokens as /miniapp. */
function MiniAppPreview({ site, locale, data }: ThemeHomeProps) {
  const fa = locale === 'fa'
  const L = (faText: string, en: string) => site.copy?.[en]?.[locale] || (fa ? faText : en)
  const plan = data.plans.find(item => item.featured) || data.plans[0]
  const tabs: [string, string][] = [['grid', L('خانه', 'Home')], ['globe', L('پلن‌ها', 'Plans')], ['wallet', L('کیف پول', 'Wallet')], ['chat', L('پشتیبانی', 'Support')]]
  return <div className="cl-device" aria-hidden="true">
    <div className="cl-phone">
      <div className="cl-phone-bar"><span className="cl-phone-brand"><span className="cl-mark">{site.brand.slice(0, 1)}</span><bdi>{site.brand}</bdi></span><CleanIcon name="bell" size={16}/></div>
      <div className="cl-phone-hero"><span className="cl-eyebrow"><CleanIcon name="shield" size={13}/>{L('فضای امن شما', 'Your secure space')}</span><strong>{L('متصل و محافظت‌شده', 'Connected & protected')}</strong><span className="cl-phone-status"><span className="cl-dot"/>{L('فعال', 'Active')}</span></div>
      <div className="cl-phone-kpis"><span><CleanIcon name="shield" size={15}/><b>1</b></span><span><CleanIcon name="bolt" size={15}/><b>12.4 GB</b></span><span><CleanIcon name="wallet" size={15}/><b>—</b></span></div>
      {plan && <div className="cl-phone-plan"><span><strong>{fa ? plan.name : plan.nameEn || plan.name}</strong><small>{plan.days} {L('روز', 'days')}</small></span><span className="cl-phone-meter"><i style={{ width: '38%' }}/></span></div>}
      <div className="cl-phone-tabs">{tabs.map(([icon, label], index) => <span key={icon} className={index === 0 ? 'on' : ''}><CleanIcon name={icon} size={17}/>{label}</span>)}</div>
    </div>
    <span className="cl-device-caption"><CleanIcon name="send" size={14}/>{L('همین تجربه، داخل تلگرام', 'The same experience, inside Telegram')}</span>
  </div>
}

const Home: NonNullable<ThemeServerModule['Home']> = (props) => <div data-code-theme="clean"><CleanHome {...props}/></div>
export const theme: ThemeServerModule = { Home }
