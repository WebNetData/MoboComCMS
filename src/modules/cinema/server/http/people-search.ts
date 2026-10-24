import type { NextRequest } from 'next/server'
import { moduleGuard } from '@/extensions/server/modules'
import { clientIp,rateLimitHit } from '@/platform/http/rate-limit'
import { err,ok } from '@/platform/http/response'
import { normalizePersonName } from '@/modules/cinema/domain/people'
import { publicPeopleChoices } from '@/modules/cinema/server/people'

export async function GET(req:NextRequest) {
  const off=await moduleGuard('cinema');if(off)return off
  if(!rateLimitHit('cinema.people.search:'+clientIp(req.headers),90).ok)return err('تعداد درخواست زیاد است؛ کمی بعد تلاش کنید',429)
  const role=req.nextUrl.searchParams.get('role')||'CAST'
  if(role!=='CAST'&&role!=='DIRECTOR'&&role!=='PRODUCER')return err('نوع فعالیت معتبر نیست',422)
  const q=normalizePersonName(req.nextUrl.searchParams.get('q')||'').slice(0,60)
  if(q.length<2)return ok({options:[]})
  try{
    const result=await publicPeopleChoices({q,role})
    return ok({options:result.slice(0,12).map(({id,name,image})=>({id,name,image}))})
  }catch{return err('دریافت نام‌ها ممکن نشد؛ دوباره تلاش کنید',503)}
}
