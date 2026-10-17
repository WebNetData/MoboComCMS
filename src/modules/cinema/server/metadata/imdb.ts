import { parseImdbTitle, parseImdbPerson, type ImdbPerson } from '@/modules/cinema/domain/imdb-page'
import type { CinemaMetadataResult } from '@/modules/cinema/domain/metadata'

/** Public canonical pages only: no cookies, proxy, challenge bypass or internal GraphQL endpoint. */
async function page(kind: 'title'|'name', id: string, signal?: AbortSignal) {
  if(!(kind==='title'?/^tt\d{7,12}$/:/^nm\d{7,12}$/).test(id))throw new Error('شناسهٔ IMDb معتبر نیست')
  let response: Response
  try { response=await fetch(`https://www.imdb.com/${kind}/${id}/`,{headers:{Accept:'text/html','Accept-Language':'en-US,en;q=0.8','User-Agent':'MoboComMetadata/1.0'},redirect:'error',cache:'no-store',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(6000)]):AbortSignal.timeout(12000)}) }
  catch {throw new Error('اتصال سرور به IMDb انجام نشد؛ دسترسی شبکه یا محدودیت IMDb را بررسی کنید')}
  if(response.status!==200 || !response.headers.get('content-type')?.includes('text/html') || !response.body) {
    await response.body?.cancel()
    throw new Error('IMDb دسترسی سرور به صفحه را محدود کرده یا پاسخ قابل‌خواندن نداده است؛ اطلاعات قبلی حفظ شد')
  }
  const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0
  try { for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>6*1024*1024)throw new Error('صفحهٔ IMDb بیش از حد بزرگ است');chunks.push(value)} }
  finally {await reader.cancel().catch(()=>{})}
  return Buffer.concat(chunks).toString('utf8')
}
export async function lookupImdbPage(id: string): Promise<CinemaMetadataResult> {
  const result=parseImdbTitle(await page('title',id),id),warnings:string[]=[]
  const missing=[...result.cast,...result.directors].filter(p=>!p.image && p.id)
  const pending=new Map<string,ImdbPerson[]>();for(const p of missing)pending.set(p.id,[...(pending.get(p.id)||[]),p])
  const entries=[...pending],deadline=AbortSignal.timeout(18000);let cursor=0
  await Promise.all(Array.from({length:Math.min(4,entries.length)},async()=>{
    while(cursor<entries.length){const [personId,persons]=entries[cursor++];try{if(deadline.aborted)throw new Error();const image=parseImdbPerson(await page('name',personId,deadline),personId);if(image)for(const p of persons)p.image=image}catch{ /* Partial metadata is returned with the missing-photo count below. */ }}
  }))
  result.fields.cast=result.cast.map(({id:_,...p})=>p)
  result.fields.directorImages=result.directors.map(p=>({name:p.name,image:p.image}))
  const missingCount=[...result.cast,...result.directors].filter(p=>!p.image).length
  if(missingCount)warnings.push(`عکس ${missingCount} نفر از IMDb دریافت نشد؛ اطلاعات موجود حفظ می‌شود`)
  warnings.push('فقط اطلاعات موجود در صفحه استخراج می‌شود؛ نتیجه را قبل از انتشار بازبینی کنید')
  return {fields:result.fields,source:'IMDb · صفحهٔ عمومی',warnings}
}
