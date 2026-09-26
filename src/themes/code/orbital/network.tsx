'use client'

import dynamic from 'next/dynamic'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { ThemeHomeProps } from '@/themes/types'
import Glyph from './glyph'
import Flag from './flag'

const LazyWorldMap = dynamic(() => import('@/themes/sdk/map'), {
  ssr: false,
  loading: () => <div className="orbital-network-map-placeholder" aria-busy="true"><Glyph name="globe" size={54} /></div>,
})

type Location = ThemeHomeProps['data']['locations'][number]
type Region = 'all' | 'europe' | 'americas' | 'asia' | 'middle-east' | 'africa' | 'oceania'

const REGIONS: { id: Region; en: string; fa: string }[] = [
  { id: 'all', en: 'All locations', fa: 'همه موقعیت‌ها' },
  { id: 'europe', en: 'Europe', fa: 'اروپا' },
  { id: 'americas', en: 'Americas', fa: 'آمریکا' },
  { id: 'asia', en: 'Asia', fa: 'آسیا' },
  { id: 'middle-east', en: 'Middle East', fa: 'خاورمیانه' },
  { id: 'africa', en: 'Africa', fa: 'آفریقا' },
  { id: 'oceania', en: 'Oceania', fa: 'اقیانوسیه' },
]

// Location records do not currently include a region field. Keep this lookup
// independent of country display language; unrecognized countries remain in All.
const REGION_COUNTRIES: Record<Exclude<Region, 'all'>, string> = {
  europe: 'Albania|Andorra|Austria|Belarus|Belgium|Bosnia and Herzegovina|Bulgaria|Croatia|Cyprus|Czechia|Czech Republic|Denmark|Estonia|Faroe Islands|Finland|France|Germany|Gibraltar|Greece|Hungary|Iceland|Ireland|Italy|Kosovo|Latvia|Liechtenstein|Lithuania|Luxembourg|Malta|Moldova|Monaco|Montenegro|Netherlands|North Macedonia|Norway|Poland|Portugal|Romania|Russia|Russian Federation|San Marino|Serbia|Slovakia|Slovenia|Spain|Sweden|Switzerland|Ukraine|United Kingdom|UK|Vatican City',
  americas: 'Antigua and Barbuda|Argentina|Aruba|Bahamas|Barbados|Belize|Bermuda|Bolivia|Brazil|Canada|Cayman Islands|Chile|Colombia|Costa Rica|Cuba|Curaçao|Dominica|Dominican Republic|Ecuador|El Salvador|French Guiana|Greenland|Grenada|Guadeloupe|Guatemala|Guyana|Haiti|Honduras|Jamaica|Martinique|Mexico|Nicaragua|Panama|Paraguay|Peru|Puerto Rico|Saint Kitts and Nevis|Saint Lucia|Saint Vincent and the Grenadines|Suriname|Trinidad and Tobago|United States|United States of America|USA|US|Uruguay|Venezuela',
  asia: 'Afghanistan|Armenia|Azerbaijan|Bangladesh|Bhutan|Brunei|Cambodia|China|Georgia|Hong Kong|India|Indonesia|Japan|Kazakhstan|Kyrgyzstan|Laos|Macau|Malaysia|Maldives|Mongolia|Myanmar|Nepal|North Korea|Pakistan|Philippines|Singapore|South Korea|Republic of Korea|Sri Lanka|Taiwan|Tajikistan|Thailand|Timor-Leste|Turkmenistan|Uzbekistan|Vietnam',
  'middle-east': 'Bahrain|Iran|Iraq|Israel|Jordan|Kuwait|Lebanon|Oman|Palestine|Qatar|Saudi Arabia|Syria|Turkey|Türkiye|United Arab Emirates|UAE|Yemen',
  africa: 'Algeria|Angola|Benin|Botswana|Burkina Faso|Burundi|Cabo Verde|Cameroon|Central African Republic|Chad|Comoros|Congo|Democratic Republic of the Congo|Republic of the Congo|Djibouti|Egypt|Equatorial Guinea|Eritrea|Eswatini|Ethiopia|Gabon|Gambia|Ghana|Guinea|Guinea-Bissau|Ivory Coast|Côte d’Ivoire|Kenya|Lesotho|Liberia|Libya|Madagascar|Malawi|Mali|Mauritania|Mauritius|Morocco|Mozambique|Namibia|Niger|Nigeria|Rwanda|São Tomé and Príncipe|Senegal|Seychelles|Sierra Leone|Somalia|South Africa|South Sudan|Sudan|Tanzania|Togo|Tunisia|Uganda|Zambia|Zimbabwe',
  oceania: 'Australia|Fiji|French Polynesia|Guam|Kiribati|Marshall Islands|Micronesia|Nauru|New Caledonia|New Zealand|Palau|Papua New Guinea|Samoa|Solomon Islands|Tonga|Tuvalu|Vanuatu',
}

const CITY_FA: Record<string, string> = {
  frankfurt: 'فرانکفورت', berlin: 'برلین', amsterdam: 'آمستردام', helsinki: 'هلسینکی', london: 'لندن', paris: 'پاریس',
  istanbul: 'استانبول', dubai: 'دبی', 'new york': 'نیویورک نیو یورک', 'san francisco': 'سان فرانسیسکو', chicago: 'شیکاگو',
  toronto: 'تورنتو', tokyo: 'توکیو', singapore: 'سنگاپور', seoul: 'سئول', 'hong kong': 'هنگ‌کنگ هنگ کنگ',
  sydney: 'سیدنی', stockholm: 'استکهلم', zurich: 'زوریخ', warsaw: 'ورشو', vienna: 'وین', milan: 'میلان',
  madrid: 'مادرید', 'sao paulo': 'سائوپائولو سائو پائولو', mumbai: 'بمبئی', johannesburg: 'ژوهانسبورگ', tehran: 'تهران',
  'los angeles': 'لس آنجلس', vancouver: 'ونکوور', montreal: 'مونترال', oslo: 'اسلو', copenhagen: 'کپنهاگ', dublin: 'دوبلین',
}

function normalize(value: string) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f\u064b-\u065f]/g, '').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/[\u200c\u200d]/g, ' ').toLowerCase().trim()
}

const COUNTRY_REGIONS = new Map<string, Region>(
  Object.entries(REGION_COUNTRIES).flatMap(([region, countries]) => countries.split('|').map((country) => [normalize(country), region as Region] as const)),
)

function regionOf(location: Location) {
  return COUNTRY_REGIONS.get(normalize(location.country))
}

export default function NetworkExplorer({ locations, locale }: { locations: ThemeHomeProps['data']['locations']; locale: string }) {
  const fa = locale === 'fa'
  const L = (persian: string, english: string) => fa ? persian : english
  const [query, setQuery] = useState('')
  const [region, setRegion] = useState<Region>('all')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [mobileView, setMobileView] = useState<'list' | 'map'>('list')
  const [isDesktop, setIsDesktop] = useState(false)
  const [nearViewport, setNearViewport] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const inputId = useId()
  const detailId = useId()
  const countryName = (location: Location) => fa && location.countryFa ? location.countryFa : location.country
  const number = (value: number) => value.toLocaleString(fa ? 'fa-IR' : 'en-US')

  const filtered = useMemo(() => {
    const terms = normalize(query).split(/\s+/).filter(Boolean)
    return locations.filter((location) => {
      if (region !== 'all' && regionOf(location) !== region) return false
      const searchText = normalize(`${location.country} ${location.countryFa} ${location.city} ${CITY_FA[normalize(location.city)] || ''}`)
      return terms.every((term) => searchText.includes(term))
    })
  }, [locations, query, region])
  const selected = filtered.find((location) => location.id === selectedId)
  const countryCount = new Set(locations.map((location) => normalize(location.country))).size
  const isFiltered = Boolean(query.trim()) || region !== 'all'

  useEffect(() => {
    const media = window.matchMedia('(min-width: 761px)')
    const update = () => setIsDesktop(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (!containerRef.current) return
    if (!('IntersectionObserver' in window)) {
      setNearViewport(true)
      return
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setNearViewport(true)
        observer.disconnect()
      }
    }, { rootMargin: '240px' })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  function clearFilters() {
    setQuery('')
    setRegion('all')
    setSelectedId(null)
  }

  function selectLocation(location: Location) {
    setSelectedId(location.id)
    const list = listRef.current
    const item = list?.querySelector<HTMLLIElement>(`[data-location-id="${location.id}"]`)
    if (list && item) {
      const top = item.offsetTop - list.offsetTop
      if (top < list.scrollTop || top + item.offsetHeight > list.scrollTop + list.clientHeight) {
        list.scrollTop = Math.max(0, top - (list.clientHeight - item.offsetHeight) / 2)
      }
    }
  }

  return (
    <div className="orbital-network" ref={containerRef} dir={fa ? 'rtl' : 'ltr'} data-mobile-view={mobileView}>
      <div className="orbital-network-toolbar">
        <div className="orbital-network-regions" role="group" aria-label={L('فیلتر موقعیت‌ها بر اساس منطقه', 'Filter locations by region')}>
          {REGIONS.map((item) => (
            <button key={item.id} type="button" aria-pressed={region === item.id} className={region === item.id ? 'is-active' : ''} onClick={() => { setRegion(item.id); setSelectedId(null) }}>
              {fa ? item.fa : item.en}
            </button>
          ))}
        </div>
        <div className="orbital-network-search">
          <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></svg>
          <label className="orbital-network-sr" htmlFor={inputId}>{L('جستجوی کشور یا شهر', 'Search country or city')}</label>
          <input id={inputId} type="search" value={query} placeholder={L('جستجوی کشور یا شهر…', 'Search country or city…')} onChange={(event) => { setQuery(event.target.value); setSelectedId(null) }} autoComplete="off" spellCheck={false} />
        </div>
      </div>

      <div className="orbital-network-mobile-switch" role="group" aria-label={L('نحوه نمایش موقعیت‌ها', 'Location display')}>
        <button type="button" aria-pressed={mobileView === 'list'} onClick={() => setMobileView('list')}><Glyph name="grid" size={16} />{L('فهرست موقعیت‌ها', 'Location list')}</button>
        <button type="button" aria-pressed={mobileView === 'map'} onClick={() => setMobileView('map')}><Glyph name="globe" size={16} />{L('نمایش نقشه', 'Show map')}</button>
      </div>

      <div className="orbital-network-body">
        <div className="orbital-network-map">
          <div className="orbital-network-map-caption"><Glyph name="globe" size={16} /><span>{L('جهان، نزدیک‌تر از همیشه', 'A world of possibilities')}</span></div>
          {nearViewport && (isDesktop || mobileView === 'map') ? (
            <LazyWorldMap locations={filtered} selectedLocationId={selected?.id ?? null} onSelectLocation={selectLocation} />
          ) : <div className="orbital-network-map-placeholder"><Glyph name="globe" size={54} /><span>{L('نقشه جهانی موقعیت‌ها', 'Global coverage map')}</span></div>}
          <p className="orbital-network-map-hint">{L('برای جزئیات، یک نقطه را انتخاب کنید.', 'Select a point to explore a location.')}</p>
        </div>

        <div className="orbital-network-directory">
          <div className="orbital-network-directory-head">
            <span>{L('موقعیت‌های شبکه', 'Coverage locations')}</span>
            <span className="orbital-network-result-count" role="status" aria-live="polite">{number(filtered.length)}{L(' موقعیت', ' locations')}</span>
          </div>
          {filtered.length ? (
            <ul ref={listRef} className="orbital-network-list" aria-label={L('موقعیت‌های شبکه', 'Coverage locations')}>
              {filtered.map((location) => (
                <li key={location.id} data-location-id={location.id}>
                  <button type="button" aria-pressed={selectedId === location.id} aria-controls={detailId} onClick={() => selectLocation(location)}>
                    <span className="orbital-network-flag" aria-hidden="true"><Flag value={location.flag}/></span>
                    <span className="orbital-network-location-copy"><strong>{countryName(location)}</strong><small dir="auto">{location.city || countryName(location)}</small></span>
                    <svg className="orbital-network-pin" aria-hidden="true" width="17" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" /><circle cx="12" cy="10" r="2.3" /></svg>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="orbital-network-empty" role="status">
              <Glyph name="globe" size={32} />
              <strong>{L('موقعیتی پیدا نشد', 'No locations found')}</strong>
              <p>{isFiltered ? L('نام دیگری را جستجو کنید یا فیلترها را پاک کنید.', 'Try another country or city, or clear your filters.') : L('موقعیت‌های منتشرشده در این بخش نمایش داده می‌شوند.', 'Published network locations will appear here.')}</p>
              {isFiltered ? <button type="button" onClick={clearFilters}>{L('پاک کردن فیلترها', 'Clear filters')}</button> : null}
            </div>
          )}
        </div>
      </div>

      <div id={detailId} className="orbital-network-details" aria-live="polite" aria-atomic="true">
        {selected ? (
          <>
            <div className="orbital-network-selected"><span className="orbital-network-flag" aria-hidden="true"><Flag value={selected.flag}/></span><div><small>{L('موقعیت انتخاب‌شده', 'Selected location')}</small><strong>{countryName(selected)}{selected.city ? <><span aria-hidden="true"> · </span><bdi>{selected.city}</bdi></> : null}</strong></div></div>
            <dl><div><dt>{L('منطقه', 'Region')}</dt><dd>{REGIONS.find((item) => item.id === regionOf(selected))?.[fa ? 'fa' : 'en'] || L('جهانی', 'Global')}</dd></div><div><dt>{L('مختصات', 'Coordinates')}</dt><dd dir="ltr">{selected.lat.toFixed(2)}°, {selected.lng.toFixed(2)}°</dd></div></dl>
            <button type="button" className="orbital-network-clear-selection" onClick={() => setSelectedId(null)} aria-label={L('پاک کردن انتخاب موقعیت', 'Clear selected location')}>×</button>
          </>
        ) : (
          <><Glyph name="globe" size={20} /><p><strong>{number(countryCount)} {L('کشور', 'countries')}</strong><span aria-hidden="true"> · </span>{number(locations.length)} {L('موقعیت در شبکه', 'coverage locations')}<span className="orbital-network-detail-prompt">{L('یک موقعیت را برای مشاهده جزئیات انتخاب کنید.', 'Choose a location to view its details.')}</span></p></>
        )}
      </div>
      <p className="orbital-network-note">{L('این نقشه موقعیت‌های ارائه‌شده را نمایش می‌دهد؛ وضعیت لحظه‌ای اتصال نیست.', 'Coverage locations shown. This map does not represent live connection status.')}</p>
    </div>
  )
}
