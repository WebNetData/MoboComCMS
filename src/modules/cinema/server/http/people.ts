import type { NextRequest } from 'next/server'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { requireContentScope } from '@/modules/identity/server/access'
import { moduleGuard } from '@/extensions/server/modules'
import { rateLimitStrict } from '@/platform/http/rate-limit'
import { ok, err } from '@/platform/http/response'
import { originIsThisSite } from '@/platform/http/origin-policy'
import { readJsonObject } from '@/platform/http/read-json'
import { auditAdminStrict } from '@/platform/audit/server'
import { adminPeople, adminPerson, savePerson, suggestPeople } from '@/modules/cinema/server/person-admin'
import { PersonProfileError } from '@/modules/cinema/domain/person-profile'

const failure=(error:unknown)=>error instanceof PersonProfileError?err(error.message,error.status):err('انجام عملیات پروفایل ممکن نشد؛ دوباره تلاش کنید',503)
export async function GET(req:NextRequest) {
  const guard=await adminGuard(req,'cinema',['cinema.manage']);if('response'in guard)return guard.response
  try {
    const raw=req.nextUrl.searchParams.get('id')
    if(raw!==null){const id=Number(raw);if(!Number.isSafeInteger(id)||id<=0)throw new PersonProfileError('شناسه معتبر نیست');return ok({person:await adminPerson(id)})}
    return ok(await adminPeople(req.nextUrl.searchParams))
  }catch(error){return failure(error)}
}
/**
 * GET /api/admin/cinema/people/suggest?q= — whoever may edit titles picks people: a manager from everyone, a section
 * author (through the scope guard) from people of published titles and of the titles they created themselves.
 */
export async function GET_suggest(req:NextRequest) {
  const off=await moduleGuard('cinema');if(off)return off
  const scope=await requireContentScope(req,'cinema.manage','cinema.author');if(!scope)return err('forbidden',403)
  if(!(await rateLimitStrict(`cinema.people.suggest:${scope.admin.id}`,240)).ok)return err('تعداد درخواست زیاد است؛ کمی صبر کنید',429)
  try{const response=ok(await suggestPeople(req.nextUrl.searchParams,scope.authorId));response.headers.set('Cache-Control','private, no-store');return response}catch(error){return failure(error)}
}
async function write(req:NextRequest,create:boolean) {
  if(!req.headers.get('origin')||!originIsThisSite(req.headers.get('origin'),req.headers.get('host')||req.nextUrl.host))return err('forbidden',403)
  const guard=await adminGuard(req,'cinema',['cinema.manage']);if('response'in guard)return guard.response
  if(!(await rateLimitStrict(`cinema.people:${guard.admin.id}`,30)).ok)return err('تعداد درخواست زیاد است؛ کمی صبر کنید',429)
  let input:Record<string,unknown>
  try{input=await readJsonObject(req,160000)}catch{return err('محتوای درخواست معتبر نیست',422)}
  if(create?input.id!==undefined:input.id===undefined)return err('شناسه با عملیات سازگار نیست',422)
  try {
    const person=await savePerson(input,(tx,id,created)=>auditAdminStrict({req,actor:guard.admin,action:created?'cinema.person.created':'cinema.person.updated',targetType:'cinema-person',targetId:id,metadata:{imageLocked:input.imageLocked}},tx))
    return ok({person})
  }catch(error){return failure(error)}
}
export const POST=(req:NextRequest)=>write(req,true)
export const PATCH=(req:NextRequest)=>write(req,false)
