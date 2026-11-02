import Link from '@/platform/routing/Link'
import { ThemeLiveSearch } from '@/themes/sdk/client'
import Icon from '../icons'
import { UniverseFeature, UniverseHighlights } from './universe-cards'
import { homeLive, homeText, type HomeProps } from './discovery'

/** MoboCom Universe: content-led bento, retaining the current Admin/public owners. */
export default function HomeHero({ section, site, locale, data }: HomeProps) {
  const fa = locale === 'fa'
  const T = (value: Parameters<typeof homeText>[0]) => homeText(value, locale)
  const L = (text: string, key: string) => site.copy?.[key]?.[locale] || (fa ? text : key)
  const live = (href: string) => homeLive(href, data.disabledPaths)
  const populated = data.showcase.some(item => live(item.href) && (item.image || item.cover))
  const directory = site.sections.find(item => item.enabled && item.kind === 'services')
  return <section className="muv-hero mb-container" id={section.id} aria-labelledby={`${section.id}-title`}>
    <div className={`muv-lead-grid${populated ? '' : ' is-text-only'}`}>
      <div className="muv-intro">
        {T(section.eyebrow) && <span className="muv-eyebrow">{T(section.eyebrow)}</span>}
        <h1 id={`${section.id}-title`}>{T(section.title).split('\n').map((line, index) => <span key={index}>{line}</span>)}</h1>
        {T(section.description) && <p className="muv-description">{T(section.description)}</p>}
        {live('/search') && <form className="mbx-search" action="/search" role="search" aria-label={L('جست‌وجو در موبوکام', 'Search MoboCom')}><Icon name="search" size={20}/><ThemeLiveSearch action="/search" types={[]} placeholder={L('امروز دنبال چی می‌گردی؟', 'What are you looking for today?')}/><button type="submit">{L('جست‌وجو', 'Search')}<Icon name="arrow" size={16}/></button></form>}
        <div className="muv-actions">
          {live(section.action.href) && <Link className="mb-btn mb-btn-primary" href={section.action.href}>{T(section.action.label)}<Icon name="arrow" size={18}/></Link>}
          {directory && <Link className="muv-explore" href={`/#${directory.id}`}>{L('کشف همهٔ سرویس‌ها', 'Explore all services')}<Icon name="chevron" size={16}/></Link>}
        </div>
      </div>
      <UniverseFeature data={data} locale={locale}/>
    </div>
    <UniverseHighlights site={site} data={data} locale={locale}/>
    {section.items.length > 0 && <ul className="muv-values">{section.items.map((item, index) => <li key={index}><Icon name={item.icon} size={20}/><span><strong>{T(item.title)}</strong><small>{T(item.text)}</small></span></li>)}</ul>}
  </section>
}
