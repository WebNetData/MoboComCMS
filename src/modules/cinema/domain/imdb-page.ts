import { plainText } from '@/shared/text/plain'
import { imdbIdentifier } from './metadata'

type Data = Record<string, any>
export type ImdbPerson = { name: string; role: string; image: string; id: string }
const clean = (v: unknown, max=200) => plainText(typeof v==='string'?v:'',max).replace(/[\u0000-\u001f]/g,' ').trim()
const list = (v: unknown): Data[] => (Array.isArray(v)?v:v&&typeof v==='object'?[v]:[]).filter(row=>row && typeof row==='object' && !Array.isArray(row)).slice(0,80)
const typeOf = (node: Data, type: string) => listType(node['@type']).includes(type)
const listType = (v: unknown) => Array.isArray(v)?v:[v]

/** Remote markup is data only. Never execute a script or trust its outgoing URLs. */
function documents(html: string) {
  const linked: Data[]=[];let next:Data={}
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    const attrs=match[1]
    if (!/\btype\s*=\s*["']application\/ld\+json["']/i.test(attrs) && !/\bid\s*=\s*["']__NEXT_DATA__["']/i.test(attrs)) continue
    try {
      const value=JSON.parse(match[2])
      if (/\bid\s*=\s*["']__NEXT_DATA__["']/i.test(attrs)) next=value?.props?.pageProps || {}
      else for(const row of list(value)) linked.push(...(Array.isArray(row['@graph'])?list(row['@graph']):[row]))
    } catch { /* Malformed optional JSON does not erase another valid document. */ }
  }
  return {linked:linked.slice(0,100),next}
}
export function imdbPhoto(raw: unknown): string {
  const value=typeof raw==='object'&&raw ? (raw as Data).url : raw
  if(typeof value!=='string' || value.length>2000)return ''
  try { const url=new URL(value);return url.protocol==='https:' && !url.username && !url.password && !url.port && ['m.media-amazon.com','ia.media-imdb.com'].includes(url.hostname) && url.pathname.startsWith('/images/') ? url.toString() : '' } catch {return ''}
}
function personId(raw: unknown) {
  if(typeof raw!=='string')return ''
  if(/^nm\d{7,12}$/.test(raw))return raw
  try { const url=new URL(raw,'https://www.imdb.com');return url.protocol==='https:' && url.hostname==='www.imdb.com' && !url.username && !url.password && !url.port ? url.pathname.match(/^\/name\/(nm\d{7,12})(?:\/|$)/)?.[1] || '' : '' } catch {return ''}
}
function person(raw: Data): ImdbPerson {
  const node=raw.name && typeof raw.name==='object'?raw.name:raw
  return {name:clean(node.nameText?.text || node.name,120),role:list(raw.characters).map(x=>clean(x.name,80)).filter(Boolean).join(', ').slice(0,120),image:imdbPhoto(node.primaryImage || node.image),id:personId(node.id || node.url || node['@id'])}
}
function people(rows: Data[]) {
  const result:ImdbPerson[]=[],seen=new Set<string>()
  for(const row of rows) {const p=person(row),key=p.id||p.name.toLowerCase();if(p.name && !seen.has(key)){seen.add(key);result.push(p)}}
  return result
}
export function parseImdbPerson(html: string, id: string): string {
  const {linked,next}=documents(html),above=next.aboveTheFoldData
  const p=linked.find(x=>typeOf(x,'Person') && personId(x.url||x['@id'])===id)
  return imdbPhoto(p?.image) || (above?.id===id ? imdbPhoto(above.primaryImage) : '')
}
export function parseImdbTitle(html: string, id: string) {
  const {linked,next}=documents(html),above=next.aboveTheFoldData || {},main=next.mainColumnData || {}
  const node=linked.find(x=>['Movie','TVSeries','TVMiniSeries'].some(t=>typeOf(x,t)) && (!x.url || imdbIdentifier(x.url)===id))
  if(!node || (above.id && above.id!==id) || !clean(node.name))throw new Error('اطلاعات قابل‌خواندن عنوان در صفحهٔ IMDb پیدا نشد؛ صفحه ممکن است تغییر کرده یا محدود شده باشد')
  const cast=people([...list(main.cast?.edges).map(x=>x.node).filter(Boolean),...list(node.actor)]).slice(0,40)
  const directors=people([...list(main.directors).flatMap(x=>list(x.credits)),...list(node.director).filter(x=>typeOf(x,'Person'))]).slice(0,8)
  const fields:Data={imdbId:id,kind:typeOf(node,'Movie')?'MOVIE':'SERIES',title:clean(node.name),originalTitle:clean(above.originalTitleText?.text || node.alternateName || node.name),summary:clean(node.description,6000),poster:imdbPhoto(node.image),cast:cast.map(({id:_,...p})=>p),director:directors.map(p=>p.name).join(', '),directorImages:directors.map(p=>({name:p.name,image:p.image}))}
  const genre=Array.isArray(node.genre)?node.genre:[node.genre]
  fields.genres=genre.map(x=>clean(x,80)).filter(Boolean).slice(0,10).join(', ')
  const date=String(node.datePublished || ''),year=Number(above.releaseYear?.year || date.slice(0,4))
  if(year>=1880 && year<=2100)fields.year=year
  if(/^\d{4}-\d{2}-\d{2}$/.test(date))fields.releaseDate=date
  const end=Number(above.releaseYear?.endYear);if(end>=1880 && end<=2100)fields.endYear=end
  const duration=String(node.duration || '').match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/),runtime=duration?Number(duration[1]||0)*60+Number(duration[2]||0):Number(above.runtime?.seconds)/60
  if(Number.isFinite(runtime) && runtime>0 && runtime<=1000)fields.runtime=Math.round(runtime)
  const rating=Number(node.aggregateRating?.ratingValue || above.ratingsSummary?.aggregateRating)
  if(rating>0 && rating<=10)fields.imdbRating=rating
  if(node.contentRating)fields.ageRating=clean(node.contentRating,20)
  const countries=list(above.countriesOfOrigin?.countries).map(x=>clean(x.text,80)).filter(Boolean),languages=list(above.spokenLanguages?.spokenLanguages).map(x=>clean(x.text,80)).filter(Boolean)
  if(countries.length)fields.countries=countries.join(', ')
  if(languages.length)fields.languages=languages.join(', ')
  if(fields.originalTitle)fields.titleEn=fields.originalTitle
  return {fields,cast,directors}
}
