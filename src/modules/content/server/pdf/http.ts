import type { NextRequest } from 'next/server'
import { err } from '@/platform/http/response'
import { rateLimitStrict,clientIp } from '@/platform/http/rate-limit'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { sectionSettingsRead,sectionSettingsWrite } from '@/modules/settings/server/http/section-history'
import { PDF_DESIGNS,PDF_KINDS,PdfError,type PdfDesign,type PdfKind } from '@/modules/content/domain/pdf'
import { generateContentPdf,sampleContentPdf } from './service'
import { getPdfSettings,savePdfSettings } from './settings'

const guard=(req:NextRequest)=>adminGuard(req,'content-pdf',['content-pdf.manage','settings.manage'])
const pdfResponse=(bytes:Buffer,name:string,inline=false)=>new Response(new Uint8Array(bytes),{headers:{'content-type':'application/pdf','content-length':String(bytes.length),'content-disposition':(inline?'inline':'attachment')+'; filename="mobocom.pdf"; filename*=UTF-8\'\''+encodeURIComponent(name),'cache-control':'private, no-store','x-content-type-options':'nosniff','x-robots-tag':'noindex, nofollow','referrer-policy':'no-referrer'}})
function failure(error:unknown){return error instanceof PdfError?err(error.message,error.status):err('ساخت PDF انجام نشد؛ دوباره تلاش کنید',503)}
export async function GET_pdf(req:NextRequest,{params}:{params:Promise<{key:string}>}){
  const limit=await rateLimitStrict('content-pdf:'+clientIp(req.headers),8,60_000)
  if(!limit.ok)return err('کمی بعد دوباره تلاش کنید',429)
  try{const result=await generateContentPdf((await params).key);return pdfResponse(result.bytes,result.filename,req.nextUrl.searchParams.get('inline')==='1')}catch(error){return failure(error)}
}
export async function GET_settings(req:NextRequest){
  const g=await guard(req);if('response'in g)return g.response
  const design=req.nextUrl.searchParams.get('preview'),kind=req.nextUrl.searchParams.get('kind')||'post'
  if(design){
    if(!Object.hasOwn(PDF_DESIGNS,design)||!Object.hasOwn(PDF_KINDS,kind))return err('طرح یا نوع محتوا معتبر نیست',400)
    const limit=await rateLimitStrict('content-pdf-preview:'+g.admin.id,12,60_000);if(!limit.ok)return err('کمی بعد دوباره تلاش کنید',429)
    try{return pdfResponse(await sampleContentPdf(await getPdfSettings(),kind as PdfKind,design as PdfDesign),'mobocom-preview.pdf',req.nextUrl.searchParams.get('download')!=='1')}catch(error){return failure(error)}
  }
  return sectionSettingsRead(async()=>({settings:await getPdfSettings()}))
}
export async function PATCH_settings(req:NextRequest){const g=await guard(req);if('response'in g)return g.response;return sectionSettingsWrite(req,g.admin,savePdfSettings)}
