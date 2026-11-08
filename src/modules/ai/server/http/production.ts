import type { NextRequest } from 'next/server'
import { requireAdmin } from '@/modules/identity/server/access'
import { moduleGuard } from '@/extensions/server/modules'
import { mutationOrigin } from '@/platform/http/origin-policy'
import { rateLimitStrict } from '@/platform/http/rate-limit'
import { readJsonObject, JsonBodyError } from '@/platform/http/read-json'
import { ok,err } from '@/platform/http/response'
import { ProductionError, type ProductionKind } from '../../domain/production'
import { productionList,productionRead,productionSettings,productionCreate,productionCommand,productionImage } from '../production'
const reply=(data:unknown)=>{const response=ok(data);response.headers.set('Cache-Control','private, no-store');return response}
const failure=(e:unknown)=>e instanceof ProductionError||e instanceof JsonBodyError?err(e.message,e.status):(e as {code?:string})?.code==='P2034'?err('دسته هم‌زمان تغییر کرد؛ وضعیت را تازه کنید؛ درخواست مدل تکرار نشد',409):err('عملیات تولید انجام نشد؛ وضعیت را تازه کنید. درخواست مدل خودکار تکرار نشد',503)
async function access(req:NextRequest,write:boolean) {
  const off=await moduleGuard('ai-assistant');if(off)return off
  const actor=await requireAdmin(req);if(!actor)return err('forbidden',403)
  if(write){const site=process.env.NEXTAUTH_URL||req.url;if(!URL.canParse(site))return err('نشانی سایت معتبر نیست',503)
    if(mutationOrigin({origin:req.headers.get('origin'),referer:req.headers.get('referer'),secFetchSite:req.headers.get('sec-fetch-site'),hasCookies:!!req.headers.get('cookie'),hosts:[req.nextUrl.host,new URL(site).host]})!=='allow')return err('درخواست باید از همین سایت باشد',403)
    if(!(await rateLimitStrict(`ai:production:${actor.id}`,200,600000)).ok)return err('درخواست زیاد است؛ کمی بعد ادامه دهید',429)
  }
  return null
}
export async function GET(req:NextRequest) {
  const denied=await access(req,false);if(denied)return denied
  try{const id=req.nextUrl.searchParams.get('id');if(id)return reply({batch:await productionRead(req,id)})
    const kind=req.nextUrl.searchParams.get('kind')||'post';if(!['post','product','page'].includes(kind))throw new ProductionError('نوع تولید معتبر نیست')
    return reply({...await productionSettings(req,kind as ProductionKind),batches:await productionList(req,kind as ProductionKind)})
  }catch(e){return failure(e)}
}
export async function POST(req:NextRequest) {
  const denied=await access(req,true);if(denied)return denied
  try{const body=await readJsonObject(req,700000);if(body.versionProtocol!==1)throw new ProductionError('نسخهٔ قرارداد معتبر نیست')
    if(body.action==='create')return reply({batch:await productionCreate(req,body.input,body.id)})
    if(body.action==='generate')return reply(await productionGenerate(req,body))
    if(!['start','claim','text','fail','pause','cancel','retry','save'].includes(String(body.action)))throw new ProductionError('عملیات معتبر نیست')
    return reply(await productionCommand(req,body))
  }catch(e){return failure(e)}
}
export async function POST_image(req:NextRequest) {
  const denied=await access(req,true);if(denied)return denied
  try{const body=await readJsonObject(req,2900000);if(body.versionProtocol!==1)throw new ProductionError('نسخهٔ قرارداد معتبر نیست');return reply(await productionImage(req,body))}catch(e){return failure(e)}
}
import { productionGenerate } from '../production'
