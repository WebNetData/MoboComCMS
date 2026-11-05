import sharp from 'sharp'
import { publicImageBytes } from '@/modules/media/server/library'
import { type PdfContent,type PdfSettings,PdfError } from '@/modules/content/domain/pdf'
import { type PdfBlock } from '@/modules/content/domain/pdf-document'

export type PdfPicture={bytes:Buffer;width:number;height:number}
export type PdfAssets={pictures:Map<string,PdfPicture>;watermark:PdfPicture|null}
async function picture(src:string,base:string):Promise<PdfPicture|null>{
  try{const input=await publicImageBytes(src,base,{maxBytes:8*1024**2,timeoutMs:2500}),{data,info}=await sharp(input,{limitInputPixels:24_000_000}).rotate().resize({width:1500,height:1500,fit:'inside',withoutEnlargement:true}).png().toBuffer({resolveWithObject:true});return {bytes:data,width:info.width,height:info.height}}catch{return null}
}
export async function pdfAssets(content:PdfContent,blocks:PdfBlock[],settings:PdfSettings,base:string):Promise<PdfAssets>{
  const pictures=new Map<string,PdfPicture>()
  const sources=settings.includeImages?[...new Set([content.image,...blocks.filter((b):b is Extract<PdfBlock,{kind:'image'}>=>b.kind==='image').map(b=>b.src)].filter(Boolean))]:[]
  if(sources.length>16)throw new PdfError('این مطلب بیش از ۱۶ تصویر دارد؛ تصاویر PDF را از تنظیمات غیرفعال کنید یا نسخهٔ کوتاه‌تری دریافت کنید',413)
  // Bounded fanout and pixel/byte limits; all URLs came from authorized content, never the request query.
  for(let i=0;i<sources.length;i+=3)await Promise.all(sources.slice(i,i+3).map(async src=>{const image=await picture(src,base);if(image)pictures.set(src,image)}))
  const watermark=settings.watermarkEnabled&&settings.watermarkKind==='image'&&settings.watermarkImage?await picture(settings.watermarkImage,base):null
  if(settings.watermarkEnabled&&settings.watermarkKind==='image'&&!watermark)throw new PdfError('تصویر واترمارک معتبر در مدیریت انتخاب نشده یا در دسترس نیست',503)
  return {pictures,watermark}
}
