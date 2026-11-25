import type { NextRequest } from 'next/server'
import { err,ok } from '@/platform/http/response'
import { accountErasurePreview,AccountErasureError } from '@/modules/identity/server/account-erasure'
export async function GET(req:NextRequest,ctx:{params:Promise<{id:string}>}){
  const id=Number((await ctx.params).id)
  if(!Number.isSafeInteger(id)||id<1)return err('شناسه معتبر نیست',422)
  try{const response=ok(await accountErasurePreview(req,id));response.headers.set('cache-control','private, no-store');return response}catch(error){return error instanceof AccountErasureError?err(error.message,error.status):err('پیش‌نمایش حذف در دسترس نیست',503)}
}
