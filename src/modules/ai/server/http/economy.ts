import type { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { requirePerm } from '@/modules/identity/server/access'
import { moduleGuard } from '@/extensions/server/modules'
import { rateLimitStrict } from '@/platform/http/rate-limit'
import { JsonBodyError, readJsonObject } from '@/platform/http/read-json'
import { AiError } from '../error'
import { economyView, saveEconomyPolicy } from '../economy'

const reply=(body:unknown)=>{const response=ok(body);response.headers.set('Cache-Control','private, no-store');return response}
const failure=(error:unknown)=>error instanceof AiError||error instanceof JsonBodyError?err(error.message,error.status):err('تنظیم سیاست کم‌هزینه انجام نشد؛ اطلاعات قبلی حفظ شد',503)
export async function GET(req:NextRequest){
  const off=await moduleGuard('ai-assistant');if(off)return off
  if(!await requirePerm(req,'settings.manage'))return err('forbidden',403)
  try{return reply(await economyView())}catch(error){return failure(error)}
}
export async function PUT(req:NextRequest){
  const off=await moduleGuard('ai-assistant');if(off)return off
  const actor=await requirePerm(req,'settings.manage');if(!actor)return err('forbidden',403)
  if(!(await rateLimitStrict(`ai:economy:${actor.id}`,20,60000)).ok)return err('درخواست تنظیم زیاد است؛ کمی بعد تلاش کنید',429)
  try{await saveEconomyPolicy(await readJsonObject(req,4000),{req,actor,action:'ai.economy.update',targetType:'setting',targetId:'ai.economy.v1'});return reply(await economyView())}catch(error){return failure(error)}
}
