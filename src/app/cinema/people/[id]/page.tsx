import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import { headers } from 'next/headers'
import ManageBar from '@/components/admin/ManageBar'
import PersonHeader from '@/components/media/cinema/PersonHeader'
import { plainText } from '@/shared/text/plain'
import Link from '@/components/AppLink'
import Icon from '@/components/site/Icon'
import { requireModule } from '@/extensions/server/modules'
import { getServerLocale } from '@/i18n/server'
import { personPage } from '@/modules/cinema/server/people'
import { browseCinema } from '@/modules/media/server/queries'
import { cinemaBrowseHref } from '@/modules/cinema/domain/discovery'
import MediaShell from '@/components/media/MediaShell'
import { cinemaNav } from '@/components/media/nav'
import { PosterCard } from '@/components/media/MediaCards'
import styles from '@/components/media/cinema/discovery.module.css'
import { ItemActionBar } from '@/components/engage/Engagement'
import { getCinemaSettings } from '@/modules/cinema/server/admin'
import { publicCelebritySlug } from '@/modules/celebrities/server/celebrities'

export const dynamic='force-dynamic'
type Props={params:Promise<{id:string}>}
export async function generateMetadata({params}:Props):Promise<Metadata>{
  const person=await personPage(Number((await params).id))
  if(!person)return {title:'پیدا نشد',robots:{index:false}}
  return {title:`${person.name} — فیلم‌ها و سریال‌ها`,description:plainText(person.bio).slice(0,160)||`فیلم‌ها و سریال‌های ${person.name}`,alternates:{canonical:`/cinema/people/${person.id}`}}
}
export default async function CinemaPersonPage({params}:Props){
  await requireModule('cinema')
  const [locale,{id},requestHeaders]=await Promise.all([getServerLocale(),params,headers()]),fa=locale==='fa'
  const person=await personPage(Number(id))
  if(!person)notFound()
  if (person.id !== Number(id)) permanentRedirect(`/cinema/people/${person.id}`)
  // One page per person: someone in «چهره‌ها» is shown there, with all their works across the sections.
  const single = await publicCelebritySlug({ cinemaPersonId: person.id })
  if (single) permanentRedirect(`/celebrities/${encodeURIComponent(single)}`)
  const presentation = await getCinemaSettings(true)
  const [acted,directed,produced]=await Promise.all([
    person.castCount?browseCinema({actor:String(person.id)}):null,
    person.directorCount?browseCinema({director:String(person.id)}):null,
    person.producerCount?browseCinema({producer:String(person.id)}):null,
  ])
  const jsonLd={'@context':'https://schema.org','@type':'Person',name:person.name,...(person.image?{image:person.image}:{})}
  return <MediaShell section="cinema" active="people" nav={cinemaNav(fa)} search={{action:'/cinema/browse',placeholder:fa?'جست‌وجوی فیلم و سریال':'Search films and series'}}>
    {/* CSP hides the nonce content attribute after parsing; its DOM property remains verified against the response policy. */}
    <script suppressHydrationWarning nonce={requestHeaders.get('x-nonce')||undefined} type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(jsonLd).replace(/</g,'\\u003c')}}/>
    <div className={`container cn-profile ${styles.page}`}>
      <nav className={styles.breadcrumb} aria-label={fa?'مسیر صفحه':'Breadcrumb'}><Link href="/cinema">{fa?'فیلم و سریال':'Cinema'}</Link><span aria-hidden="true">/</span><Link href="/cinema/people">{fa?'بازیگران و کارگردانان':'Actors & directors'}</Link><span aria-hidden="true">/</span><span aria-current="page" dir="auto">{person.name}</span></nav>
      <ManageBar title="مدیریت پروفایل" anyOf={['cinema.manage']} links={[{href:`/admin/cinema/people?edit=${person.id}`,label:'ویرایش عکس و زندگی‌نامه'}]}/>
      <PersonHeader person={{ ...person, bio: presentation.showPersonBiography ? person.bio : '' }} fa={fa}/>
      {presentation.personFollowEnabled && <ItemActionBar item={{ type: 'person', id: person.id }} title={person.name} image={person.image} followLabel={fa ? 'اعلان اثر تازه' : 'New works'} favoriteLabels={{ off: fa ? 'دنبال‌کردن' : 'Follow', on: fa ? 'دنبال می‌کنید' : 'Following' }} />}
      {acted&&<Filmography name={person.name} fa={fa} result={acted} role="CAST" href={cinemaBrowseHref({actor:String(person.id)})}/>}
      {directed&&<Filmography name={person.name} fa={fa} result={directed} role="DIRECTOR" href={cinemaBrowseHref({director:String(person.id)})}/>}
      {produced&&<Filmography name={person.name} fa={fa} result={produced} role="PRODUCER" href={cinemaBrowseHref({producer:String(person.id)})}/>}
    </div>
  </MediaShell>
}
function Filmography({name,fa,result,role,href}:{name:string;fa:boolean;result:Awaited<ReturnType<typeof browseCinema>>;role:'CAST'|'DIRECTOR'|'PRODUCER';href:string}){
  const title=role==='CAST'?(fa?'آثار با حضور '+name:'Featuring '+name):role==='PRODUCER'?(fa?'آثار به تهیه‌کنندگی '+name:'Produced by '+name):(fa?'آثار به کارگردانی '+name:'Directed by '+name)
  const num=(n:number)=>n.toLocaleString(fa?'fa-IR':'en-US')
  return <section className={styles.shelf} aria-label={title}>
    <header className={styles.shelfHead}><div><h2>{title}</h2><p>{result.unavailable?(fa?'دریافت آثار ممکن نشد':'Works could not be loaded'):(fa?`${num(result.total)} اثر ثبت‌شده در موبوکام`:`${num(result.total)} works on MoboCom`)}{result.total>result.titles.length&&(fa?`؛ نمایش ${num(result.titles.length)} اثر تازه‌تر`:`; showing the latest ${num(result.titles.length)}`)}</p></div><Link className={styles.more} href={href}>{fa?'مشاهده و جست‌وجوی همهٔ آثار':'Browse all works'}<Icon name="arrow" size={16}/></Link></header>
    <div className={styles.grid}>{result.titles.map(item=><PosterCard key={item.id} item={item} fa={fa}/>)}</div>
  </section>
}
