import { decryptPanelCredential } from '@/modules/providers/server/panel-credentials'
import { egressFetch } from '@/modules/social/server/egress'
import { effectiveBaseUrl, type AiConfig } from '../domain/ai'
import { generateWithCredentialPool } from './credentials'
import { providerJson } from './provider-json'
import { AiError } from './error'

/** Explicit compatible image protocol. URLs are never followed; only bounded inline bytes. */
export async function generateImageApi(prompt: string, config: AiConfig, ratio: string, signal?: AbortSignal) {
  if (config.provider !== 'custom') throw new AiError('برای تصویر، کاربرد API تصویر را با سرویس سازگار و خروجی base64 تنظیم کنید',409)
  const request = async (key: string, pooledSignal?: AbortSignal) => {
    const gptImage=/^(gpt-image-|chatgpt-image-)/.test(config.model)
    let response: Response, data
    try {
      response = await egressFetch(effectiveBaseUrl(config)+'/images/generations',{method:'POST',headers:{'Content-Type':'application/json',...(key?{Authorization:'Bearer '+key}:{})},body:JSON.stringify({model:config.model,prompt,n:1,...(gptImage?{output_format:'webp',output_compression:85,quality:'medium'}:{response_format:'b64_json'}),size:ratio==='landscape'?'1536x1024':ratio==='portrait'?'1024x1536':'1024x1024'}),signal:AbortSignal.any([AbortSignal.timeout(120000),...(signal?[signal]:[]),...(pooledSignal?[pooledSignal]:[])]),cache:'no-store'})
      data = await providerJson(response,3*1024*1024)
    } catch { throw new AiError('پاسخ API تصویر کامل دریافت نشد؛ درخواست خودکار تکرار نشد',502,'unavailable',false) }
    if (!response.ok) {
      const status=response.status
      throw new AiError(`سرویس تصویر درخواست را نپذیرفت (HTTP ${status})؛ مدل، کلید و سهمیه را بررسی کنید`,status>=400&&status<500?status:502,status===401?'auth':status===402?'quota':status===429?'rate':'unavailable',[401,402,429].includes(status))
    }
    const encoded=data?.data?.length===1?data.data[0]?.b64_json:null
    if(typeof encoded!=='string'||encoded.length>2799900||!/^[a-z0-9+/]+={0,2}$/i.test(encoded))throw new AiError('API تصویر یک خروجی base64 معتبر و محدود برنگرداند؛ URL تصویر دریافت نمی‌شود و درخواست تکرار نشد',502,'unavailable',false)
    const bytes=Buffer.from(encoded,'base64'),mime=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'png':bytes[0]===255&&bytes[1]===216?'jpeg':bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP'?'webp':null
    if(!mime)throw new AiError('فرمت فایل تصویر پشتیبانی نمی‌شود',422,'unavailable',false)
    return `data:image/${mime};base64,${encoded}`
  }
  const pooled=await generateWithCredentialPool(config,request);if(pooled!==null)return pooled
  let key: string;try{key=decryptPanelCredential(config.apiKey)}catch{throw new AiError('کلید API تصویر قابل خواندن نیست',503)}
  return request(key)
}
