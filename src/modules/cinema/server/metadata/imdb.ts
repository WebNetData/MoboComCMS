import { parseImdbTitle, parseImdbPerson, type ImdbPerson } from '@/modules/cinema/domain/imdb-page'
import { parseImdbSearch, parseImdbPersonSearch } from '@/modules/cinema/domain/imdb-search'
import type { CinemaMetadataResult } from '@/modules/cinema/domain/metadata'
import { lookupCinemeta } from './cinemeta'

export class ImdbRateLimit extends Error {}
/** Fixed public pages/search only: no cookies, proxy, challenge solving or internal API. */
async function page(kind: 'title'|'name'|'search'|'person-search', id: string, signal?: AbortSignal) {
  if(!(kind==='name'||kind==='person-search'?/^nm\d{7,12}$/:/^tt\d{7,12}$/).test(id))throw new Error('شناسهٔ IMDb معتبر نیست')
  const search=kind==='search'||kind==='person-search',accept=search?'application/json':'text/html'
  const url=search?`https://v3.sg.media-imdb.com/suggestion/${kind==='person-search'?'n':'t'}/${id}.json`:`https://www.imdb.com/${kind}/${id}/`
  let response: Response
  try { response=await fetch(url,{headers:{Accept:accept,'Accept-Language':'en-US,en;q=0.8','User-Agent':'MoboComMetadata/1.0'},redirect:'error',cache:'no-store',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(6000)]):AbortSignal.timeout(search?6000:12000)}) }
  catch {throw new Error('اتصال سرور به IMDb انجام نشد؛ دسترسی شبکه یا محدودیت IMDb را بررسی کنید')}
  if(response.status===429){await response.body?.cancel();throw new ImdbRateLimit('IMDb تعداد درخواست‌ها را محدود کرده است؛ کمی صبر کنید')}
  if(response.status!==200 || !response.headers.get('content-type')?.includes(accept) || !response.body) {
    await response.body?.cancel()
    throw new Error('IMDb دسترسی سرور به صفحه را محدود کرده یا پاسخ قابل‌خواندن نداده است؛ اطلاعات قبلی حفظ شد')
  }
  const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0
  try { for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>(search?256*1024:6*1024*1024))throw new Error('پاسخ IMDb بیش از حد بزرگ است');chunks.push(value)} }
  finally {await reader.cancel().catch(()=>{})}
  return Buffer.concat(chunks).toString('utf8')
}
export async function lookupImdbPersonPhoto(id: string, signal?: AbortSignal) {
  return parseImdbPersonSearch(JSON.parse(await page('person-search',id,signal)),id)
}
export async function lookupImdbPage(id: string, cinemetaFallback = false, preferredKind?: unknown): Promise<CinemaMetadataResult> {
  let result: ReturnType<typeof parseImdbTitle>
  try {result=parseImdbTitle(await page('title',id),id)}
  catch(error) {
    if(error instanceof ImdbRateLimit || !/^tt\d{7,12}$/.test(id))throw error
    if(cinemetaFallback) {
      try { return await lookupCinemeta(id,preferredKind) }
      catch { /* Independent provider is unavailable; exact-ID public basics remain useful. */ }
    }
    try {
      const fields=parseImdbSearch(JSON.parse(await page('search',id)),id)
      return {fields,source:'IMDb · جستجوی عمومی (اطلاعات پایه)',warnings:['نتیجه ناقص است: صفحهٔ کامل IMDb در دسترس سرور نیست؛ فقط نام، نوع اثر، سال و پوسترِ موجود از جستجوی عمومی دریافت شد. خلاصه، امتیاز و عوامل دریافت نشده‌اند و اطلاعات قبلی این فیلدها تغییر نمی‌کند.']}
    } catch {throw error}
  }
  const warnings:string[]=[]
  const missing=[...result.cast,...result.directors].filter(p=>!p.image && p.id)
  const pending=new Map<string,ImdbPerson[]>();for(const p of missing)pending.set(p.id,[...(pending.get(p.id)||[]),p])
  const entries=[...pending],deadline=AbortSignal.timeout(18000);let cursor=0
  await Promise.all(Array.from({length:Math.min(4,entries.length)},async()=>{
    while(cursor<entries.length){const [personId,persons]=entries[cursor++];try{if(deadline.aborted)throw new Error();const image=parseImdbPerson(await page('name',personId,deadline),personId);if(image)for(const p of persons)p.image=image}catch{ /* Partial metadata is returned with the missing-photo count below. */ }}
  }))
  // The IMDb person (nm…) stays with each name: it is who they are, whatever language the name is shown in.
  result.fields.cast=result.cast.map(({id,...p})=>({...p,...(/^nmd{7,12}$/.test(id)?{imdbId:id}:{})}))
  result.fields.directorImages=result.directors.map(p=>({name:p.name,image:p.image,...(/^nmd{7,12}$/.test(p.id)?{imdbId:p.id}:{})}))
  const missingCount=[...result.cast,...result.directors].filter(p=>!p.image).length
  if(missingCount)warnings.push(`عکس ${missingCount} نفر از IMDb دریافت نشد؛ اطلاعات موجود حفظ می‌شود`)
  warnings.push('فقط اطلاعات موجود در صفحه استخراج می‌شود؛ نتیجه را قبل از انتشار بازبینی کنید')
  return {fields:result.fields,source:'IMDb · صفحهٔ عمومی',warnings}
}
