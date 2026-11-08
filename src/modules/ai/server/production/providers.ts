import { createHash } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { requirePerm } from '@/modules/identity/server/access'
import { decryptPanelCredential } from '@/modules/providers/server/panel-credentials'
import { DEFAULT_AI, effectiveBaseUrl, effectiveModel, providerById, type AiConfig, type AiProviderId } from '../../domain/ai'
import { ProductionError, type ProductionConfig } from '../../domain/production'
import { chatTarget, type ProductionTarget } from '../../domain/production-execution'
import { getAiConfig } from '../client'
import { credentialPoolReady } from '../credentials'
import { readCredentialPools } from '../credentials/store'
import { readAiRoutes, resolveAiRoute } from '../routing'

export const targetOf = (config: ProductionConfig, phase: 'text' | 'image') => config.generation?.[phase] || chatTarget()
const binding = (config: AiConfig, phase: string) => createHash('sha256').update([phase,config.provider,effectiveBaseUrl(config)].join('\0')).digest('hex')
export const productionModelAuthority = async (req: NextRequest) => !!await requirePerm(req,'settings.manage')
async function ready(config: AiConfig) {
  const url = new URL(effectiveBaseUrl(config))
  if (!['https:','http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) return false
  const pooled = await credentialPoolReady(config)
  if (pooled !== null) return pooled
  return config.provider === 'custom' || !!decryptPanelCredential(config.apiKey)
}
async function configurations(canManage: boolean) {
  const [base,routes,pools] = await Promise.all([getAiConfig(),readAiRoutes(),readCredentialPools()])
  const route = resolveAiRoute(routes,'production'), image = resolveAiRoute(routes,'production-image')
  const configs = new Map<AiProviderId,AiConfig>()
  const effective = route.source === 'api' && route.config ? route.config : base
  if(canManage)configs.set(base.provider,base)
  configs.set(effective.provider,effective)
  if(canManage)for (const pool of pools.pools) if (pool.enabled && pool.keys.some(k=>k.enabled) && !configs.has(pool.provider)) configs.set(pool.provider,{...DEFAULT_AI,provider:pool.provider,baseUrl:pool.baseUrl,model:providerById(pool.provider).model})
  return { configs, image: image.source === 'api' && image.config?.provider === 'custom' ? image.config : null }
}
/** Public metadata only; no provider probes or credential envelopes leave this owner. */
export async function productionProviders(canManage = false) {
  try {
    const {configs,image} = await configurations(canManage), text = [], images = [];let unreadable=false
    for (const config of configs.values()) {
      try { if (await ready(config)) text.push({provider:config.provider,label:providerById(config.provider).label,model:effectiveModel(config)}) }
      catch { unreadable=true }
    }
    try { if(image && await ready(image)) images.push({provider:image.provider,label:'API تصویر سازگار با OpenAI · base64',model:effectiveModel(image)}) } catch { unreadable=true }
    return {text,image:images,canSelectModel:canManage,...(unreadable?{message:'یکی از سرویس‌ها قابل خواندن نیست؛ مدیر تنظیمات آن را بررسی کند. سرویس‌های آماده همچنان قابل انتخاب‌اند.'}:{})}
  } catch { return {text:[],image:[],message:'تنظیمات API قابل خواندن نیست؛ مدیر تنظیمات آن را بررسی کند. دسته‌های Chat وب همچنان قابل استفاده‌اند.'} }
}
export async function productionProvider(config: ProductionConfig, phase: 'text' | 'image', requireBinding = true, canManage = false) {
  const target = targetOf(config,phase)
  if (target.source !== 'api' || !config.generation?.confirmed) throw new ProductionError('مصرف API برای این مرحله انتخاب و تأیید نشده است',409)
  const current = await configurations(canManage), stored = phase === 'image' ? current.image : current.configs.get(target.provider)
  if (!stored || stored.provider !== target.provider || !await ready(stored)) throw new ProductionError('سرویس انتخاب‌شده آماده نیست؛ تنظیم کاربرد تولید انبوه و کلیدها را بررسی کنید',409)
  if(!canManage && target.model!==effectiveModel(stored))throw new ProductionError('فقط مدیر تنظیمات می‌تواند مدل دیگری انتخاب کند؛ مدل تنظیم‌شدهٔ کاربرد را استفاده کنید',403)
  if (requireBinding && target.binding !== binding(stored,phase)) throw new ProductionError('مقصد سرویس از زمان ساخت دسته تغییر کرده؛ برای مصرف در مقصد تازه دستهٔ جدید بسازید',409)
  return {...stored,model:target.model}
}
export async function prepareProductionConfig(config: ProductionConfig, canManage = false) {
  if (!config.generation) return config
  const generation = {...config.generation}
  for (const phase of ['text','image'] as const) {
    if (phase === 'image' && !config.cover && !config.inline) continue
    const target = generation[phase]
    if (target.source === 'api') generation[phase] = {...target,binding:binding(await productionProvider(config,phase,false,canManage),phase)}
  }
  return {...config,generation}
}
export async function validateProductionProviders(config: ProductionConfig, canManage = false) {
  for (const phase of ['text','image'] as const) if ((phase === 'text' || config.cover || config.inline) && targetOf(config,phase).source === 'api') await productionProvider(config,phase,true,canManage)
}
export function requireProductionTransport(config: ProductionConfig, phase: 'text'|'image', transport: 'chat-web'|'api') {
  if (targetOf(config,phase).source !== transport) throw new ProductionError('پاسخ یا درخواست متعلق به مسیر تولید انتخاب‌شده نیست',409)
}
export type { ProductionTarget }
