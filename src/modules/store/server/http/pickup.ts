import type { NextRequest } from 'next/server'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { requirePerm } from '@/modules/identity/server/access'
import { auditAdminStrict } from '@/platform/audit/server'
import { rateLimitStrict } from '@/platform/http/rate-limit'
import { pickupQueue,movePickup } from '@/modules/store/server/pickup'
import { StoreError } from '@/modules/store/domain/store'
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}})
export async function GET(req:NextRequest){
 const g=await adminGuard(req,'store',['orders.manage','store.orders.handle']);if('response'in g)return g.response
 const manager=g.admin.roleId==null||!!g.admin.permissions?.includes('orders.manage')
 return reply({orders:await pickupQueue({actorId:g.admin.id,manager}),manager})
}
export async function POST(req:NextRequest){
 const g=await adminGuard(req,'store',['orders.manage','store.orders.handle']);if('response'in g)return g.response
 const body=await req.json().catch(()=>null),id=Number(body?.orderId)
 if(!Number.isSafeInteger(id)||id<=0||id>2_147_483_647||!['ready','collect','reissue'].includes(body?.action))return reply({error:'درخواست تحویل معتبر نیست'},400)
 if(!(await rateLimitStrict(`pickup:${g.admin.id}:${id}`,12,5*60_000)).ok)return reply({error:'تلاش‌های تحویل زیاد است؛ چند دقیقه صبر کنید'},429)
 const scope={actorId:g.admin.id,manager:g.admin.roleId==null||!!g.admin.permissions?.includes('orders.manage')}
 try{return reply(await movePickup({orderId:id,actorId:g.admin.id,scope,action:body.action,code:String(body.code||'').slice(0,12),audit:async tx=>{
  if(!await requirePerm(req,scope.manager?'orders.manage':'store.orders.handle',tx))throw new StoreError('دسترسی تغییر کرده است',403)
  await auditAdminStrict({req,actor:g.admin,action:`store.pickup.${body.action}`,targetType:'order',targetId:id},tx)
 }}))}catch(error){if(error instanceof StoreError)return reply({error:error.message},error.status);throw error}
}
