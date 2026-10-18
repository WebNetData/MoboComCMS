import Link from '@/components/AppLink'
import Icon from '@/components/site/Icon'
import { PosterCard } from '@/components/media/MediaCards'
import Pager from '@/components/media/Pager'
import type { browseCinema } from '@/modules/media/server/queries'
import { cinemaBrowseHref,type CinemaSearch } from '@/modules/cinema/domain/discovery'
import styles from './discovery.module.css'

type Result=Awaited<ReturnType<typeof browseCinema>>
export default function BrowseResults({result,params,fa}:{result:Result;params:CinemaSearch;fa:boolean}){
  const sorts:[string|undefined,string][]=[[undefined,fa?'تازه‌ترین':'Newest'],['imdb',fa?'امتیاز IMDb':'IMDb rating'],['year',fa?'سال ساخت':'Release year'],['popular',fa?'پربازدید':'Popular']]
  const title=params.q?(fa?`نتایج برای «${params.q}»`:`Results for “${params.q}”`):(fa?'نتیجهٔ جست‌وجو':'Search results')
  const count=result.unavailable?(fa?'دریافت نتیجه‌ها ممکن نشد':'Results are unavailable'):`${result.total.toLocaleString(fa?'fa-IR':'en-US')} ${fa?'فیلم و سریال':'films & series'}`
  return <section className={styles.results} aria-labelledby="cinema-results-title">
    <header className={styles.resultHead}><div><h2 id="cinema-results-title">{title}</h2><p role="status">{count}</p></div><nav className={styles.sort} aria-label={fa?'مرتب‌سازی نتایج':'Sort results'}>{sorts.map(([key,label])=><Link key={label} href={cinemaBrowseHref(params,{sort:key})} aria-current={(params.sort||undefined)===key?'page':undefined}>{label}</Link>)}</nav></header>
    <ResultsContent result={result} params={params} fa={fa}/>
    {!result.unavailable&&<Pager page={result.page} pages={result.pages} fa={fa} href={page=>cinemaBrowseHref(params,{page:String(page)})}/>}
  </section>
}
function ResultsContent({result,params,fa}:{result:Result;params:CinemaSearch;fa:boolean}){
  if(result.unavailable)return <Feedback failed fa={fa} href={cinemaBrowseHref(params)}/>
  if(!result.titles.length)return <Feedback failed={false} fa={fa} href="/cinema/browse"/>
  return <div className={styles.grid}>{result.titles.map(item=><PosterCard key={item.id} item={item} fa={fa}/>)}</div>
}
function Feedback({failed,fa,href}:{failed:boolean;fa:boolean;href:string}){
  const text=fa?{
    title:failed?'نتیجه‌ها در دسترس نیستند':'اثری با این مشخصات پیدا نشد',
    body:failed?'فیلترها حفظ شده‌اند؛ کمی بعد دوباره تلاش کنید.':'نام را بررسی کنید یا یکی از فیلترهای بالا را بردارید. فقط آثار منتشرشدهٔ موجود در موبوکام نمایش داده می‌شوند.',
    action:failed?'تلاش دوباره':'نمایش همهٔ فیلم‌ها و سریال‌ها',
  }:{
    title:failed?'Results are unavailable':'No matching titles',
    body:failed?'Your filters are retained. Please try again.':'Try another spelling or remove a filter. Only published titles on MoboCom are shown.',
    action:failed?'Retry':'Browse all titles',
  }
  return <div className={styles.empty} role={failed?'alert':undefined}><Icon name={failed?'refresh':'search'} size={28}/><h3>{text.title}</h3><p>{text.body}</p><Link className={styles.directoryLink} href={href}>{text.action}</Link></div>
}
