import { getViewer, type Viewer } from '@/modules/membership/server/membership'
import { accountOf } from '@/modules/account/server/viewer-account'
import { userOpensAudience } from '@/modules/account/server/item-audience'
import { isAudienceItem } from '@/modules/account/domain/item-audience'
import { userOpensSection } from '@/modules/account/server/section-access'
import { opensDuringMaintenance,sectionClosedFor } from '@/modules/account/server/maintenance-access'
import { loadMaintenance } from '@/modules/site/server/maintenance'
import { isMaintenanceSection } from '@/modules/site/domain/maintenance'
import { isModuleEnabled } from '@/extensions/server/modules'
import { accessFor, type Chain } from '@/modules/paywall/server/paywall'
import { ruleRefusal } from '@/modules/membership/server/rules'
import { ITEM_MODULE } from '@/modules/content/domain/items'
import { PdfError, type PdfRef, type PdfContent } from '@/modules/content/domain/pdf'
import { toPublicPath } from '@/platform/routing/aliases'

export const live=()=>({status:'PUBLISHED',publishedAt:{lte:new Date()}})
export const escapePdfHtml=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
export const pdfTextHtml=(s:string)=>'<p>'+escapePdfHtml(s).replace(/\r?\n/g,'<br>')+'</p>'
export async function pdfViewer():Promise<Viewer>{const v=await getViewer(),account=v.userId?await accountOf(v.userId):null;if(v.userId&&!account)throw new PdfError('حساب کاربری اجازهٔ دریافت این محتوا را ندارد',403);const state=await loadMaintenance(true);if(state.site.enabled&&!await opensDuringMaintenance(account,state.site))throw new PdfError('سایت در حال نگهداری است',403);return v}
export async function pdfSection(ref:PdfRef,viewer:Viewer){
  let module=ref.type==='page'?null:ref.type==='playlist'?'music':ref.type==='forum-post'?'forum':ITEM_MODULE[ref.type as keyof typeof ITEM_MODULE]
  if(ref.type==='studio')module=await isModuleEnabled('games')?'games':'software'
  if(module&&!await isModuleEnabled(module))throw new PdfError('محتوا پیدا نشد',404)
  const section=module==='journal'?'magazine':module==='prompt-master'?'prompts':module
  if(section&&isMaintenanceSection(section)&&(await sectionClosedFor(section,viewer.userId)||!await userOpensSection(section,viewer.userId)))throw new PdfError('این بخش در دسترس نیست',403)
}
export async function pdfAccess(ref:PdfRef,viewer:Viewer,row:{access?:string;audienceGroups?:string},chain:Chain=[]){
  if(isAudienceItem(ref.type)&&!await userOpensAudience(row.audienceGroups,ref.type,viewer.userId))throw new PdfError('محتوا پیدا نشد',404)
  if(chain.length){const paid=await accessFor(viewer,chain);if(paid.key){if(!paid.decision.open)throw new PdfError('برای دریافت نسخهٔ کامل، دسترسی این محتوا لازم است',403);return}}
  if(row.access==='MEMBERS'&&!viewer.opens||await ruleRefusal(viewer.userId,[{ownerType:ref.type,ownerId:ref.id}]))throw new PdfError('دسترسی کامل این محتوا برای حساب شما باز نیست',403)
}
export function pdfContent(ref:PdfRef,input:Omit<PdfContent,'ref'>):PdfContent{return {...input,ref,url:toPublicPath(input.url),facts:input.facts.filter(([,v])=>!!v)}}
export const dateFact=(d:Date|null|undefined)=>d?d.toLocaleDateString('fa-IR',{timeZone:'Asia/Tehran'}):''
export const dataFacts=(raw:string):[string,string][]=>{try{const value:unknown=JSON.parse(raw);return value&&typeof value==='object'&&!Array.isArray(value)?Object.entries(value).filter(([,v])=>typeof v==='string'||typeof v==='number').map(([k,v])=>[k,String(v)]):[]}catch{return []}}
