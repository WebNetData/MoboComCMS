import Link from '@/platform/routing/Link'
import Icon from '../icons'
import { discoveryLinks, homeText, type HomeProps } from './discovery'

/** All configured public services, with one consistent information hierarchy. */
export default function ServiceDirectory({ section, site, locale, data }: HomeProps) {
  const links = discoveryLinks(site, data, locale)
  if (!links.length) return null
  const fa = locale === 'fa'
  return <section className="mb-container mb-section muv-directory" id={section.id} aria-labelledby={`${section.id}-title`}>
    <header className="mb-heading"><div><span className="mb-eyebrow">{homeText(section.eyebrow, locale)}</span><h2 id={`${section.id}-title`}>{homeText(section.title, locale)}</h2><p>{homeText(section.description, locale)}</p></div><span className="muv-directory-note">{fa ? 'دنیای موبوکام را کشف کن' : 'Explore the MoboCom universe'}</span></header>
    <div className="muv-service-grid">{links.map(item => <Link key={item.href} href={item.href} className="muv-service">
      <span className="muv-service-top">{item.icon && <span className="muv-service-icon"><Icon name={item.icon} size={24}/></span>}<span className="muv-service-arrow" aria-hidden="true"><Icon name="arrow" size={18}/></span></span>
      <h3>{item.title}</h3>{item.text && <p>{item.text}</p>}
      {item.stat && <span className="muv-service-count"><b>{item.stat.value.toLocaleString(fa ? 'fa-IR' : 'en-US')}</b> {item.stat.label}</span>}
    </Link>)}</div>
  </section>
}
