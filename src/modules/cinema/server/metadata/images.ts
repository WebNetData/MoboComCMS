import { requestTransfer, currentLibraryUser, type LibraryActor } from '@/modules/media/server/library'
import type { CinemaMetadataResult } from '@/modules/cinema/domain/metadata'
import { imdbPhoto } from '@/modules/cinema/domain/imdb-page'
import { cinemetaImage } from '@/modules/cinema/domain/cinemeta'

type Photo = {name: string; image: string}
/** One shared transfer queue owns retries, decoding, disk paths, folders and current authority. */
export async function localizeMetadataImages(result: CinemaMetadataResult, actor: LibraryActor) {
  await currentLibraryUser(actor)
  let copied=0,failed=0
  const transfer=async(url:string,name:string,organization:Record<string,unknown>)=>{
    if(!imdbPhoto(url) && !cinemetaImage(url,String(result.fields.imdbId || '')) && !/^https:\/\/image\.tmdb\.org\/t\/p\/[A-Za-z0-9/._-]+$/.test(url))return url
    try {const row=await requestTransfer(actor,{url,kind:'image',name,section:'cinema',mode:'queued',organization});copied++;return row.url}catch{failed++;return url}
  }
  const title=String(result.fields.originalTitle || result.fields.title || ''),section=result.fields.kind==='SERIES'?'series':'film'
  for(const key of ['poster','backdrop'])if(result.fields[key])result.fields[key]=await transfer(String(result.fields[key]),title+' '+key,{section,title})
  for(const [key,role] of [['cast','actor'],['directorImages','director']] as const) {
    const rows=Array.isArray(result.fields[key])?result.fields[key] as Photo[]:[]
    for(const row of rows.slice(0,key==='cast'?40:8))if(row?.name && row.image)row.image=await transfer(row.image,row.name,{section:'cinema-person',title:row.name,personRole:role})
  }
  if(copied)result.warnings.push(`${copied} عکس در کتابخانه ثبت شد؛ انتقال در صف انجام می‌شود و پس از تکمیل از سرور سایت خوانده می‌شود`)
  if(failed)result.warnings.push(`ثبت انتقال ${failed} عکس انجام نشد؛ لینک اصلی حفظ شد؛ تنظیمات و صف کتابخانه را بررسی کنید`)
  return result
}
