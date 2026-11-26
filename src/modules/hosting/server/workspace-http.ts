import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { rateLimitStrict } from '@/platform/http/rate-limit'
import { cloudWorkspaceUser,CloudWorkspaceError } from './workspace-access'
import { cloudFinancialPage,cloudWorkspaceOverview } from './workspace'

export async function GET_workspace(req:NextRequest){
  const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'cache-control':'private, no-store','x-robots-tag':'noindex, nofollow'}})
  try{
    const user=await cloudWorkspaceUser(req)
    if(!(await rateLimitStrict(`cloud:workspace:${user.id}`,60,60_000)).ok)return reply({error:'چند لحظه بعد دوباره تلاش کنید'},429)
    if([...req.nextUrl.searchParams.keys()].some(key=>!['view','cursor'].includes(key)))return reply({error:'درخواست معتبر نیست'},422)
    const view=req.nextUrl.searchParams.get('view')||'overview',raw=req.nextUrl.searchParams.get('cursor'),cursor=raw?Number(raw):undefined
    if(raw && (!/^[1-9]\d*$/.test(raw)||!Number.isSafeInteger(cursor)||Number(cursor)>2147483647))return reply({error:'ادامهٔ فهرست معتبر نیست'},422)
    if(view==='overview')return reply(await cloudWorkspaceOverview(user.id))
    if(view==='invoices'||view==='orders')return reply(await cloudFinancialPage(user.id,cursor))
    return reply({error:'نمای درخواست‌شده معتبر نیست'},422)
  }catch(error){return error instanceof CloudWorkspaceError?reply({error:error.message},error.status):reply({error:'دریافت اطلاعات ابری انجام نشد'},503)}
}
