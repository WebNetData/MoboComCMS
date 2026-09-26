import type { ThemeHomeProps } from '@/themes/types'
import Flag from './flag'

export default function OrbitalGlobe({ locations, locale, brand, image, networkHref = '#network' }: { locations: ThemeHomeProps['data']['locations']; locale: string; brand: string; image?: string; networkHref?: string }) {
  const preferred = ['United Kingdom', 'United States', 'Turkey', 'Singapore']
  const nodes = preferred.map(country => locations.find(item => item.country === country)).filter((item): item is typeof locations[number] => Boolean(item))
  const cards = nodes.length ? nodes : locations.slice(0, 4)
  return <div className="hp-globe" aria-label={locale === 'fa' ? `شبکه جهانی ${brand}` : `${brand} global network`}>
    <img className="hp-globe-image" src={image || '/images/network-earth.webp'} width="1254" height="1254" alt="" fetchPriority="high" decoding="async"/>
    <div className="hp-globe-orbit" aria-hidden="true"/>
    {cards.map((location, index) => <a href={networkHref} key={location.id} className={`hp-globe-node hp-node-${index}`}><span className="hp-node-flag"><Flag value={location.flag}/></span><span><strong><bdi>{location.city || location.country}</bdi></strong><small>{locale === 'fa' ? location.countryFa || location.country : location.country}</small></span><span className="hp-node-point" aria-hidden="true"/></a>)}
    <div className="hp-globe-caption"><span/>{locale === 'fa' ? 'از اینجا، به همه‌جا' : 'CONNECTED ACROSS BORDERS'}<span/></div>
  </div>
}
