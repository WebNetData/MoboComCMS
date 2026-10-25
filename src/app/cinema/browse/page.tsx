import type { Metadata } from 'next'
import Link from '@/components/AppLink'
import Icon from '@/components/site/Icon'
import { listingMeta } from '@/modules/seo/domain/seo'
import { toPublicPath } from '@/platform/routing/aliases'
import { requireModule } from '@/extensions/server/modules'
import { browseCinema } from '@/modules/media/server/queries'
import { cinemaBrowseHref,cinemaPersonId,type CinemaSearch } from '@/modules/cinema/domain/discovery'
import { publicPersonChoice } from '@/modules/cinema/server/people'
import { activeFormats } from '@/modules/cinema/server/formats'
import { getServerLocale } from '@/i18n/server'
import MediaShell from '@/components/media/MediaShell'
import { cinemaNav } from '@/components/media/nav'
import BrowseResults from '@/components/media/cinema/BrowseResults'
import BrowseFilters,{ActiveFilters} from '@/components/media/cinema/BrowseFilters'
import styles from '@/components/media/cinema/discovery.module.css'

export const dynamic='force-dynamic'
export async function generateMetadata({searchParams}:{searchParams:Promise<CinemaSearch>}):Promise<Metadata>{
  const [p,locale]=await Promise.all([searchParams,getServerLocale()]),fa=locale==='fa'
  const format=p.format?(await activeFormats()).find(item=>item.slug===p.format):undefined
  const kind=format?(fa?format.plural||format.name:format.nameEn||format.name):p.kind==='SERIES'?(fa?'سریال‌ها':'Series'):p.kind==='MOVIE'?(fa?'فیلم‌ها':'Movies'):(fa?'فیلم و سریال':'Films & series')
  const seo=listingMeta('/cinema/browse',p,['format','kind','genre','page'])
  return {title:[kind,p.genre,p.year,p.dubbed==='1'?(fa?'دوبله فارسی':'Persian dub'):''].filter(Boolean).join(' · '),alternates:{canonical:toPublicPath(seo.canonical)},robots:seo.index?undefined:{index:false,follow:true}}
}
export default async function CinemaBrowsePage({searchParams}:{searchParams:Promise<CinemaSearch>}){
  await requireModule('cinema')
  const [params,locale]=await Promise.all([searchParams,getServerLocale()]),fa=locale==='fa'
  const [result,actor,director,producer,formats]=await Promise.all([
    browseCinema({...params,page:Number(params.page)}),
    params.actor?publicPersonChoice(cinemaPersonId(params.actor)||-1,'CAST'):null,
    params.director?publicPersonChoice(cinemaPersonId(params.director)||-1,'DIRECTOR'):null,
    params.producer?publicPersonChoice(cinemaPersonId(params.producer)||-1,'PRODUCER'):null,
    activeFormats().catch(()=>[]),
  ])
  const active=params.dubbed==='1'?'dubbed':params.sort==='imdb'?'imdb':params.kind==='MOVIE'?'movies':params.kind==='SERIES'?'series':undefined
  return <MediaShell section="cinema" active={active} nav={cinemaNav(fa)} search={{action:'/cinema/browse',placeholder:fa?'جست‌وجوی فیلم و سریال…':'Search films and series…',value:params.q}}>
    <div className={`container cn-discovery ${styles.page}`}>
      <header className={styles.heading}><div><h1>{fa?'فیلم و سریال، به انتخاب شما':'Find your next film or series'}</h1><p>{fa?'نام اثر، بازیگر یا کارگردان را پیدا کنید و نتیجه‌ها را به سلیقهٔ خود محدود کنید.':'Find a title, actor or director and refine the catalogue.'}</p></div><Link className={styles.directoryLink} href="/cinema/people"><Icon name="film" size={18}/>{fa?'بازیگران و کارگردانان':'Actors & directors'}</Link></header>
      <BrowseFilters params={params} fa={fa} formats={formats} actor={actor} director={director} producer={producer} genres={result.genres} years={result.years} countries={result.countries}/>
      <ActiveFilters params={params} fa={fa} formats={formats} actor={actor} director={director} producer={producer}/>
      <BrowseResults result={result} params={params} fa={fa}/>
    </div>
  </MediaShell>
}
