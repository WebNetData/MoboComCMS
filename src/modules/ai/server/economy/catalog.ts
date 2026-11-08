import { egressFetch } from '@/modules/social/server/egress'
import { effectiveBaseUrl, type AiConfig } from '../../domain/ai'
import { localModelId } from '../../domain/economy'
import { AiError } from '../error'
import { providerJson } from '../provider-json'
import { credentialForMetadata } from '../credentials'

// Metadata only, per destination; no prompts/keys in cache. Bounded and single-flight.
const cache = new Map<string,{expires:number; models:string[]}>()
const pending = new Map<string,Promise<string[]>>()
export async function localModels(config:AiConfig,signal?:AbortSignal) {
  const base=effectiveBaseUrl(config),url=new URL(base)
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||!url.pathname.endsWith('/v1'))throw new AiError('نشانی Ollama باید به /v1 ختم شود',409)
  url.pathname=url.pathname.slice(0,-3)+'/api/tags'
  const key=url.toString(),old=cache.get(key)
  if(old&&old.expires>Date.now())return old.models
  let task=pending.get(key)
  if(!task){
    task=(async()=>{
      const secret=await credentialForMetadata(config)
      const response=await egressFetch(key,{headers:{Accept:'application/json',...(secret?{Authorization:`Bearer ${secret}`}:{})},signal:AbortSignal.any([AbortSignal.timeout(8000),...(signal?[signal]:[])]),redirect:'error',cache:'no-store'})
      if(!response.ok)throw new AiError('دریافت فهرست مدل‌های محلی انجام نشد',503)
      const body=await providerJson(response,256000)
      if(!Array.isArray(body?.models)||body.models.length>512)throw new AiError('فهرست مدل محلی معتبر نیست',502)
      const models=[...new Set<string>(body.models.filter((m:Record<string,unknown>)=>m&&localModelId(String(m.name||''))&&!m.remote_host&&!m.remote_model&&(!m.details||typeof m.details==='object')).map((m:{name:string})=>m.name))].slice(0,64)
      if(cache.size>=16)cache.delete(cache.keys().next().value!)
      cache.set(key,{models,expires:Date.now()+300000});return models
    })().finally(()=>pending.delete(key));pending.set(key,task)
  }
  return task
}
