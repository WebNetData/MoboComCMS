import { imdbIdentifier, type CinemaMetadataResult } from '@/modules/cinema/domain/metadata'
import { metadataCredentials } from './config'
import { lookupImdbPage } from './imdb'
import type { LibraryActor } from '@/modules/media/server/library'

type Data = Record<string, any>
const text = (v: unknown, max=400) => String(v ?? '').replace(/[<>\u0000-\u001f]/g,' ').trim().slice(0,max)
const image = (p: unknown, size='w500') => typeof p === 'string' && /^\/[A-Za-z0-9._-]+$/.test(p) ? `https://image.tmdb.org/t/p/${size}${p}` : ''
const names = (rows: unknown, key='name') => (Array.isArray(rows) ? rows.slice(0,10).map(row => text(row?.[key],80)).filter(Boolean) : []).join(', ')
async function json(url: URL, headers: HeadersInit = {}): Promise<Data> {
  if (url.protocol !== 'https:' || !['api.themoviedb.org','www.omdbapi.com'].includes(url.hostname)) throw new Error('سرویس مجاز نیست')
  const response=await fetch(url,{headers,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(12000)})
  if (!response.ok) { await response.body?.cancel(); throw new Error('سرویس پاسخ معتبر نداد؛ کلید و دسترسی سرور را بررسی کنید') }
  if (!response.body) throw new Error('پاسخ سرویس خالی است')
  const reader=response.body.getReader();let size=0;const chunks:Uint8Array[]=[]
  try { for (;;) { const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>2*1024*1024)throw new Error('پاسخ سرویس بیش از حد بزرگ است');chunks.push(value) } }
  finally { await reader.cancel().catch(()=>{}) }
  const data=JSON.parse(Buffer.concat(chunks).toString('utf8'))
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('پاسخ سرویس معتبر نیست')
  return data
}
/** Fixed public IMDb pages or the existing optional APIs; never publishes a title. */
export async function lookupCinemaMetadata(raw: unknown, preferredKind?: unknown, actor?: LibraryActor): Promise<CinemaMetadataResult> {
  const id=imdbIdentifier(raw)
  if (!id) throw new Error('شناسه یا لینک عنوان IMDb معتبر نیست')
  const credentials=await metadataCredentials()
  if (!credentials.enabled) throw new Error('دریافت اطلاعات در تنظیمات فیلم و سریال غیرفعال است')
  const provider=credentials.provider || (credentials.tmdbToken ? 'tmdb' : 'imdb')
  const result=provider==='imdb' ? await lookupImdbPage(id,credentials.cinemetaFallback !== false,preferredKind) : await lookupTmdbMetadata(id,preferredKind,credentials)
  return actor && credentials.copyImages !== false ? (await import('./images')).localizeMetadataImages(result,actor) : result
}
async function lookupTmdbMetadata(id: string, preferredKind: unknown, credentials: Awaited<ReturnType<typeof metadataCredentials>>): Promise<CinemaMetadataResult> {
  if(!credentials.tmdbToken)throw new Error('کلید TMDb تنظیم نشده است؛ دریافت مستقیم IMDb هم در تنظیمات قابل انتخاب است')
  const headers={Authorization:`Bearer ${credentials.tmdbToken}`,Accept:'application/json'}
  const found=await json(new URL(`https://api.themoviedb.org/3/find/${id}?external_source=imdb_id&language=fa-IR`),headers)
  const movie=found.movie_results?.[0], series=found.tv_results?.[0]
  const kind=preferredKind==='SERIES' && series ? 'tv' : movie ? 'movie' : series ? 'tv' : ''
  const match=kind==='movie'?movie:series
  if (!kind || !Number.isSafeInteger(match?.id) || match.id<=0) throw new Error('عنوانی برای این IMDb پیدا نشد')
  const detail=await json(new URL(`https://api.themoviedb.org/3/${kind}/${match.id}?language=fa-IR&append_to_response=credits,external_ids,videos`),headers)
  let english:Data={}
  if (!detail.overview || !detail.title && !detail.name) english=await json(new URL(`https://api.themoviedb.org/3/${kind}/${match.id}?language=en-US`),headers)
  const date=detail.release_date || detail.first_air_date || '',year=Number(String(date).slice(0,4))
  const crew=Array.isArray(detail.credits?.crew)?detail.credits.crew:[]
  const directors=crew.filter((p:Data)=>p.job==='Director').slice(0,8)
  const creators=kind==='tv' && !directors.length ? (detail.created_by || []).slice(0,8) : directors
  const fields:Data={imdbId:id,kind:kind==='tv'?'SERIES':'MOVIE',title:text(detail.title||detail.name||english.title||english.name,200),titleEn:text(detail.original_title||detail.original_name,200),originalTitle:text(detail.original_title||detail.original_name,200),genres:names(detail.genres),countries:names(detail.production_countries),languages:names(detail.spoken_languages,'english_name'),director:names(creators),directorImages:creators.map((p:Data)=>({name:text(p.name,120),image:image(p.profile_path,'w185')})),cast:(detail.credits?.cast||[]).slice(0,40).map((p:Data)=>({name:text(p.name,120),role:text(p.character,120),image:image(p.profile_path,'w185')})),summary:text(detail.overview||english.overview,6000),poster:image(detail.poster_path),backdrop:image(detail.backdrop_path,'w1280')}
  if (year>=1880 && year<=2100) fields.year=year
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) fields.releaseDate=date
  const runtime=kind==='movie'?Number(detail.runtime):Number(detail.episode_run_time?.[0])
  if (runtime>0 && runtime<=1000) fields.runtime=runtime
  if (kind==='tv') { fields.seriesStatus=['Ended','Canceled'].includes(detail.status)?'ENDED':'ONGOING';const end=Number(String(detail.last_air_date||'').slice(0,4));if(fields.seriesStatus==='ENDED' && end>=1880)fields.endYear=end }
  const video=detail.videos?.results?.find((v:Data)=>v.site==='YouTube' && v.type==='Trailer' && /^[A-Za-z0-9_-]+$/.test(v.key))
  if(video)fields.trailerUrl=`https://www.youtube.com/watch?v=${video.key}`
  const warnings:string[]=[]
  if(credentials.omdbKey) { try { const url=new URL('https://www.omdbapi.com/');url.search=new URLSearchParams({apikey:credentials.omdbKey,i:id,plot:'full'}).toString();const omdb=await json(url);if(omdb.Response==='False')throw new Error();const rating=Number(omdb.imdbRating);if(rating>0 && rating<=10)fields.imdbRating=rating;if(omdb.Rated && omdb.Rated!=='N/A')fields.ageRating=text(omdb.Rated,20) }catch{warnings.push('امتیاز و ردهٔ سنی IMDb از OMDb دریافت نشد؛ سایر اطلاعات آماده است')} }
  else warnings.push('برای امتیاز واقعی IMDb، کلید OMDb را در تنظیمات وارد کنید')
  return {fields,source:'TMDb'+(fields.imdbRating?' · IMDb via OMDb':''),warnings}
}
