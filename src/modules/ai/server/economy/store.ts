import { createHash } from 'node:crypto'
import { db } from '@/platform/database/prisma'
import { updateJsonSetting } from '@/modules/settings/server'
import { auditAdminStrict, type AdminAuditInput } from '@/platform/audit/server'
import { createInboxEvent } from '@/modules/notifications/server/inbox'
import { DEFAULT_AI, effectiveBaseUrl, effectiveModel, type AiConfig } from '../../domain/ai'
import { economyPolicy, type EconomyPolicy, type EconomyProvider } from '../../domain/economy'
import { getAiConfig } from '../client'
import { readAiRoutes } from '../routing'
import { readCredentialPools } from '../credentials/store'
import { AiError } from '../error'

export const ECONOMY_KEY = 'ai.economy.v1'
const HEALTH_SETTING = 'ai.economy.health.v1'
export async function readEconomyPolicy(): Promise<EconomyPolicy> {
  try { const row = await db.setting.findUnique({ where: { key: ECONOMY_KEY } }); return economyPolicy(row ? JSON.parse(row.value) : {}) }
  catch { throw new AiError('سیاست کم‌هزینه قابل خواندن نیست؛ تنظیم قبلی حفظ شد',503) }
}
export async function saveEconomyPolicy(raw: unknown, audit: AdminAuditInput) {
  let policy: EconomyPolicy
  try { policy = economyPolicy(raw) } catch { throw new AiError('ترتیب سرویس‌ها، تأیید درگاه یا سقف تلاش معتبر نیست') }
  return updateJsonSetting(ECONOMY_KEY, async (value,tx) => {
    const current = economyPolicy(value)
    if (current.revision !== policy.revision) throw new AiError('سیاست هم‌زمان تغییر کرد؛ وضعیت را تازه کنید',409)
    const next = {...policy,revision:current.revision+1}
    Object.assign(value,next); await auditAdminStrict(audit,tx); return next
  })
}
/** Reference existing connections and encrypted pools; never create another key store. */
export async function economySources() {
  const [base,routes,pools] = await Promise.all([getAiConfig(),readAiRoutes(),readCredentialPools()])
  const configs = new Map<string,AiConfig>(); configs.set(base.provider,base)
  for (const route of Object.values(routes)) if(route?.source === 'api' && route.config && !configs.has(route.config.provider)) configs.set(route.config.provider,route.config)
  for (const pool of pools.pools) if(pool.enabled && pool.keys.some(k=>k.enabled) && !configs.has(pool.provider)) configs.set(pool.provider,{...DEFAULT_AI,provider:pool.provider,baseUrl:pool.baseUrl,model:''})
  return new Map([...configs].map(([id,config])=>[id,{...config,credentialVersion:pools.pools.some(p=>p.provider===config.provider&&p.enabled)?String(pools.revision):''}]))
}
export const economySourceId = (config: AiConfig & {credentialVersion?:string}) => createHash('sha256').update([config.provider,effectiveBaseUrl(config),config.provider==='openrouter'?'openrouter/free':effectiveModel(config),config.apiKey,config.credentialVersion||''].join('\0')).digest('hex')
export const economyBindingFor = (policy:EconomyPolicy,sources:Map<string,AiConfig>) => createHash('sha256').update(JSON.stringify([policy,policy.providers.map((p:EconomyProvider)=>sources.has(p)?economySourceId(sources.get(p)!):p)])).digest('hex')
export async function economyBinding() {
  const [policy,sources] = await Promise.all([readEconomyPolicy(),economySources()])
  return economyBindingFor(policy,sources)
}
type Observation = { at:number; retryAt:number; reason:string; latency:number; lastSuccess:number }
function observations(value: Record<string,unknown>): Record<string,Observation> {
  if(!Object.keys(value).length)return {}
  if(value.version!==1 || !value.entries || typeof value.entries!=='object' || Array.isArray(value.entries))throw new AiError('وضعیت سرویس کم‌هزینه قابل خواندن نیست',503)
  const rows=value.entries as Record<string,Observation>
  if(Object.keys(rows).length>64 || Object.entries(rows).some(([id,v])=>!/^[a-f0-9]{64}$/.test(id)||!v||![v.at,v.retryAt,v.latency,v.lastSuccess].every(n=>Number.isFinite(n)&&n>=0)||!['','auth','quota','rate','unavailable'].includes(v.reason)))throw new AiError('وضعیت سرویس کم‌هزینه معتبر نیست',503)
  return rows
}
export async function economyHealth() {
  const row=await db.setting.findUnique({where:{key:HEALTH_SETTING}})
  try{return observations(row?JSON.parse(row.value):{})}catch{throw new AiError('خواندن وضعیت کم‌هزینه انجام نشد',503)}
}
export async function recordEconomyResult(config:AiConfig,started:number,reason: 'auth'|'quota'|'rate'|'unavailable'|'', revision:number) {
  await updateJsonSetting(HEALTH_SETTING,async(value,tx)=>{
    const current=await tx.setting.findUnique({where:{key:ECONOMY_KEY}})
    if(economyPolicy(current?JSON.parse(current.value):{}).revision!==revision)return
    const rows=observations(value),id=economySourceId(config),old=rows[id],now=Date.now()
    if(old && old.at>started)return
    rows[id]={at:started,retryAt:reason?now+(reason==='auth'?86400000:reason==='quota'?1800000:60000):0,reason,latency:now-started,lastSuccess:reason?old?.lastSuccess||0:now}
    const keep=Object.entries(rows).sort((a,b)=>b[1].at-a[1].at).slice(0,64)
    Object.assign(value,{version:1,entries:Object.fromEntries(keep)})
    if(!reason || old?.reason===reason && old.retryAt>now)return
    const admins=await tx.user.findMany({where:{role:'ADMIN',status:'ACTIVE'},select:{id:true,roleId:true,roleRef:{select:{permissions:true}}}})
    for(const admin of admins){
      if(admin.roleId!==null&&!admin.roleRef?.permissions.split(',').includes('settings.manage'))continue
      await createInboxEvent({userId:admin.id,kind:'AI_CREDENTIAL_FAILURE',dedupeKey:`ai-economy:${id}:${reason}:${Math.floor(now/3600000)}:${admin.id}`,titleFa:'نیاز به بررسی سرویس کم‌هزینه',titleEn:'AI source needs attention',bodyFa:`${config.provider}: ${reason}. وضعیت و زمان تلاش بعدی را در تنظیمات هوش مصنوعی ببینید؛ جایگزین پولی انتخاب نمی‌شود.`,bodyEn:'Review the authorized AI source; no paid fallback was selected.',href:'/admin/ai?tab=settings',channels:[]},tx)
    }
  })
}
