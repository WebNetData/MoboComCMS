import Link from '@/components/AppLink'
import Icon from '@/components/site/Icon'
import { yr } from '@/components/media/MediaCards'
import { cinemaBrowseHref,type CinemaSearch } from '@/modules/cinema/domain/discovery'
import PersonFilter,{type PersonChoice} from './PersonFilter'
import FilterForm from './FilterForm'
import type { CinemaFormat } from '@/modules/cinema/domain/formats'
import styles from './discovery.module.css'

type Format=Pick<CinemaFormat,'slug'|'name'|'nameEn'|'plural'|'icon'>
type Props={params:CinemaSearch;fa:boolean;formats:Format[];genres:string[];years:number[];countries:string[];actor:PersonChoice|null;director:PersonChoice|null;producer:PersonChoice|null}
export default function BrowseFilters({params,fa,formats,genres,years,countries,actor,director,producer}:Props){
  return <section className={styles.panel} aria-labelledby="cinema-filter-title">
    <header className={styles.panelHead}><h2 id="cinema-filter-title"><Icon name="sliders" size={20}/>{fa?'جست‌وجوی پیشرفته':'Advanced search'}</h2><Link className={styles.reset} href="/cinema/browse">{fa?'پاک کردن همه':'Clear all'}</Link></header>
    <FilterForm key={cinemaBrowseHref(params)} fa={fa} dubbed={params.dubbed==='1'}>
      <div className={styles.fields}>
        <div className={`${styles.field} ${styles.query}`}><label htmlFor="cinema-query">{fa?'نام فیلم، سریال یا کارگردان':'Film, series or director'}</label><input id="cinema-query" type="search" name="q" dir="auto" maxLength={80} defaultValue={params.q||''} placeholder={fa?'مثلاً تلقین یا Christopher Nolan…':'For example, Inception…'}/></div>
        <PersonFilter key={'actor:'+params.actor} role="CAST" initial={actor} value={params.actor} fa={fa}/>
        <PersonFilter key={'director:'+params.director} role="DIRECTOR" initial={director} value={params.director} fa={fa}/>
        <PersonFilter key={'producer:'+params.producer} role="PRODUCER" initial={producer} value={params.producer} fa={fa}/>
        {formats.length?<Select name="format" label={fa?'نوع اثر':'Type'} value={params.format} options={[['',fa?'همهٔ انواع':'All types'],...formats.map(format=>[format.slug,`${format.icon?format.icon+' ':''}${fa?format.name:format.nameEn||format.name}`] as [string,string])]}/>
          :<Select name="kind" label={fa?'نوع اثر':'Type'} value={params.kind} options={[['',fa?'فیلم و سریال':'Films & series'],['MOVIE',fa?'فیلم':'Movies'],['SERIES',fa?'سریال':'Series']]}/>}
        {formats.length>0&&params.kind&&<input type="hidden" name="kind" value={params.kind}/>}
        <Select name="genre" label={fa?'ژانر':'Genre'} value={params.genre} options={options(genres,params.genre,fa?'همهٔ ژانرها':'All genres')}/>
        <Select name="year" label={fa?'سال ساخت':'Release year'} value={params.year} options={options(years.map(String),params.year,fa?'همهٔ سال‌ها':'All years').map(([value,label])=>[value,value?yr(Number(value),fa):label])}/>
        <Select name="country" label={fa?'کشور سازنده':'Country'} value={params.country} options={options(countries,params.country,fa?'همهٔ کشورها':'All countries')}/>
      </div>
      {params.sort&&<input type="hidden" name="sort" value={params.sort}/>}
    </FilterForm>
  </section>
}
function options(values:string[],selected:string|undefined,all:string):[string,string][] {
  return [['',all],...[...new Set([...values,...(selected?[selected]:[])])].map(value=>[value,value] as [string,string])]
}
function Select({name,label,value,options}:{name:string;label:string;value?:string;options:[string,string][]}){
  return <div className={styles.field}><label htmlFor={'cinema-'+name}>{label}</label><select id={'cinema-'+name} aria-label={label} name={name} defaultValue={value||''}>{options.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></div>
}
export function ActiveFilters({params,fa,formats,actor,director,producer}:Pick<Props,'params'|'fa'|'formats'|'actor'|'director'|'producer'>){
  const format=formats.find(item=>item.slug===params.format)
  const labels:[keyof CinemaSearch,string|undefined][]=[
    ['q',params.q],['format',params.format?(format?(fa?format.name:format.nameEn||format.name):params.format):undefined],['kind',params.kind==='MOVIE'?(fa?'فیلم':'Movies'):params.kind==='SERIES'?(fa?'سریال':'Series'):undefined],
    ['genre',params.genre],['year',params.year],['country',params.country],
    ['actor',params.actor?(fa?'بازیگر: ':'Actor: ')+(actor?.name||(fa?'ناموجود':'Unavailable')):undefined],
    ['director',params.director?(fa?'کارگردان: ':'Director: ')+(director?.name||(fa?'ناموجود':'Unavailable')):undefined],
    ['producer',params.producer?(fa?'تهیه‌کننده: ':'Producer: ')+(producer?.name||(fa?'ناموجود':'Unavailable')):undefined],
    ['dubbed',params.dubbed==='1'?(fa?'دوبلهٔ فارسی':'Persian dub'):undefined],
  ]
  const selected=labels.filter(([,value])=>value)
  if(!selected.length)return null
  return <nav className={styles.chips} aria-label={fa?'فیلترهای فعال':'Active filters'}>{selected.map(([key,label])=><Link key={key} href={cinemaBrowseHref(params,{[key]:undefined})} aria-label={fa?'حذف فیلتر '+label:'Remove filter '+label}><span dir="auto">{label}</span><span aria-hidden="true">×</span></Link>)}</nav>
}
