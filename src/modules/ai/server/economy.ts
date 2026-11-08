import { effectiveModel, type AiConfig, type Prompt } from '../domain/ai'
import type { AiResult } from './client'
import { AiError } from './error'
import { credentialPoolReady } from './credentials'
import { decryptPanelCredential } from '@/modules/providers/server/panel-credentials'
import { localModels } from './economy/catalog'
import { economyBinding, economyBindingFor, economySources, economyHealth, economySourceId, readEconomyPolicy, recordEconomyResult } from './economy/store'
export { economyBinding, saveEconomyPolicy } from './economy/store'

export async function economyReady() {
  const [policy,sources]=await Promise.all([readEconomyPolicy(),economySources()])
  if(!policy.enabled)return false
  for(const provider of policy.providers){const config=sources.get(provider);if(!config)continue;try{const pooled=await credentialPoolReady(config);if(pooled===true || pooled===null&&(provider==='ollama'||!!decryptPanelCredential(config.apiKey)))return true}catch{/* another authorized source may still be configured */}}
  return false
}
export async function economyView() {
  const [policy,sources,health]=await Promise.all([readEconomyPolicy(),economySources(),economyHealth()])
  return {policy,sources:policy.providers.map(provider=>{const config=sources.get(provider);return {provider,configured:!!config,model:config?provider==='openrouter'?'openrouter/free':effectiveModel(config):'',health:config?health[economySourceId(config)]||null:null}})}
}
type Options={support?:boolean;signal?:AbortSignal}
type Transport=(prompt:Prompt,config:AiConfig,options:Options)=>Promise<AiResult>
/** A separate, explicit provider choice. Ordinary API and personal routes remain pinned. */
export async function generateEconomy(prompt:Prompt,house:AiConfig,options:Options,transport:Transport):Promise<AiResult> {
  const policy=await readEconomyPolicy()
  if(!policy.enabled)throw new AiError('سیاست کم‌هزینه فعال نیست؛ مدیر تنظیمات آن را فعال کند',409)
  const sources=await economySources(),binding=economyBindingFor(policy,sources),signal=AbortSignal.any([AbortSignal.timeout(120000),...(options.signal?[options.signal]:[])])
  let attempts=0,last:AiError|undefined
  for(const provider of policy.providers){
    if(signal.aborted)throw new AiError('مهلت درخواست تمام شد؛ تولید دوباره ارسال نشد',504)
    if(await economyBinding()!==binding)throw new AiError('سیاست یا مقصد کم‌هزینه هم‌زمان تغییر کرد؛ نتیجه استفاده نشد',409)
    const stored=sources.get(provider);if(!stored)continue
    let config={...stored,voice:house.voice,botName:house.botName}
    if(provider==='openrouter')config={...config,model:'openrouter/free'}
    if(provider==='omniroute'&&!policy.gatewayFreeOnly)continue
    if((await economyHealth())[economySourceId(config)]?.retryAt>Date.now())continue
    const pooled=await credentialPoolReady(config)
    if(pooled===false)continue
    if(pooled===null&&provider!=='ollama'&&!decryptPanelCredential(config.apiKey))continue
    if(provider==='ollama'){
      // GET metadata cannot cause duplicated generation. Remote aliases fail closed.
      try{const models=await localModels(config,signal),model=effectiveModel(config)==='auto'?models[0]:effectiveModel(config);if(!model||!models.includes(model))throw new AiError('مدل محلی نصب نشده است',409);config={...config,model}}
      catch(error){if(signal.aborted)throw error;await recordEconomyResult(stored,Date.now(),'unavailable',policy.revision);last=new AiError('مدل محلی آماده نیست؛ نصب و اتصال Ollama را بررسی کنید',503);continue}
    }
    if(attempts++>=policy.maxAttempts)break
    const started=Date.now()
    try{
      const result=await transport(prompt,config,{...options,signal})
      if(await economyBinding()!==binding)throw new AiError('سیاست یا مقصد هنگام پاسخ تغییر کرد؛ نتیجه استفاده نشد',409)
      await recordEconomyResult(stored,started,'',policy.revision)
      return result
    }catch(error){
      if(!(error instanceof AiError))throw error
      last=error
      if(error.credentialReason)await recordEconomyResult(stored,started,error.credentialReason,policy.revision)
      // Never replay ambiguous output, timeouts, 5xx, content refusals or cancelled calls.
      if(signal.aborted||!error.retryCredential||!['auth','quota','rate'].includes(error.credentialReason||'')||![401,402,429,503].includes(error.status))throw error
    }
  }
  throw new AiError(last?`منابع مجاز آماده نیستند؛ ${last.message}`:'منبع کم‌هزینهٔ آماده‌ای نیست؛ سرویس‌ها، مدل محلی و زمان تلاش بعدی را بررسی کنید',503)
}
