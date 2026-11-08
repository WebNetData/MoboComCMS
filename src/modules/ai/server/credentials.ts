import { configurableAiBase } from '../domain/ai'
import { decryptPanelCredential } from '@/modules/providers/server/panel-credentials'
import { effectiveBaseUrl, type AiConfig } from '../domain/ai'
import { CREDENTIAL_REASONS, type AiCredentialPool } from '../domain/credentials'
import { readCredentialPools } from './credentials/store'
import { readCredentialHealth, recordCredentialResult } from './credentials/health'
import { AiError } from './error'
export { saveCredentialPool } from './credentials/store'

export async function credentialPoolsView() {
  const [config, health] = await Promise.all([readCredentialPools(), readCredentialHealth()])
  return { revision: config.revision, pools: config.pools.map(p => ({ provider: p.provider, baseUrl: p.baseUrl, enabled: p.enabled, keys: p.keys.map(k => {
    const h = health[k.id]?.version === k.version ? health[k.id] : null
    return { id: k.id, label: k.label, enabled: k.enabled, hasKey: true, status: !k.enabled ? 'disabled' : !h ? 'unknown' : h.reason ? 'cooldown' : 'healthy', reason: h?.reason ? CREDENTIAL_REASONS[h.reason] : '', retryAt: h?.retryAt || 0, lastSuccess: h?.lastSuccess || 0 }
  }) })) }
}
function selectedPool(pools: AiCredentialPool[], settings: AiConfig) {
  const pool = pools.find(p => p.provider === settings.provider && p.enabled)
  if (pool && configurableAiBase(pool.provider) && pool.baseUrl !== new URL(effectiveBaseUrl(settings)).toString().replace(/\/+$/, '')) throw new AiError('مقصد کاربرد با مقصد کلیدهای چندگانه یکسان نیست؛ تنظیمات را بررسی کنید', 409)
  return pool
}
export async function credentialPoolReady(settings: AiConfig) {
  const pool = selectedPool((await readCredentialPools()).pools, settings)
  return pool ? pool.keys.some(k => k.enabled) : null
}
/** Read-only metadata requests reuse the same authorized destination and cooldowns. */
export async function credentialForMetadata(settings: AiConfig) {
  const pool=selectedPool((await readCredentialPools()).pools,settings)
  if(!pool)return decryptPanelCredential(settings.apiKey)
  const health=await readCredentialHealth(),key=pool.keys.find(k=>k.enabled&&!(health[k.id]?.version===k.version&&health[k.id].retryAt>Date.now()))
  if(!key)throw new AiError('کلید آماده‌ای برای فهرست مدل‌ها نیست',503)
  return decryptPanelCredential(key.secret)
}
/** Only explicit rejected attempts may switch keys, within one fixed provider/model/destination and deadline. */
export async function generateWithCredentialPool(settings: AiConfig, request: (secret: string, signal: AbortSignal) => Promise<string>): Promise<string | null> {
  const config = await readCredentialPools(), pool = selectedPool(config.pools, settings)
  if (!pool) return null
  const deadline = AbortSignal.timeout(120_000)
  let last: AiError | undefined
  for (const key of pool.keys) {
    if (!key.enabled) continue
    const current = await readCredentialPools()
    if (current.revision !== config.revision) throw new AiError('کلیدهای سرویس هم‌زمان تغییر کردند؛ دوباره بررسی کنید', 409)
    const health = (await readCredentialHealth())[key.id]
    if (health?.version === key.version && health.retryAt > Date.now()) continue
    if (deadline.aborted) throw new AiError('زمان مجاز درخواست هوش مصنوعی تمام شد؛ درخواست دوباره خودکار ارسال نشد', 504)
    const started = Date.now()
    try {
      let secret: string
      try { secret = decryptPanelCredential(key.secret); if (!secret) throw Error('empty') }
      catch { await recordCredentialResult(pool.provider, key, started, 'auth'); last = new AiError('کلید قابل خواندن نیست؛ کلید را دوباره ذخیره کنید', 503, 'auth'); continue }
      const text = await request(secret, deadline)
      if (!text.trim()) throw new AiError('سرویس پاسخ متنی کامل نداد؛ درخواست تکرار نشد', 502, 'unavailable', false)
      if ((await readCredentialPools()).revision !== config.revision) throw new AiError('تنظیم کلیدها هنگام پاسخ تغییر کرد؛ نتیجه استفاده نشد', 409)
      await recordCredentialResult(pool.provider, key, started)
      return text
    } catch (error) {
      if (!(error instanceof AiError) || !error.credentialReason) throw error
      last = error
      await recordCredentialResult(pool.provider, key, started, error.credentialReason)
      if (!error.retryCredential) throw error
    }
  }
  throw new AiError(last ? `کلیدهای مجاز این سرویس پاسخ ندادند؛ ${last.message}` : 'کلید آماده‌ای در این سرویس نیست؛ زمان تلاش بعدی یا تنظیمات کلیدها را بررسی کنید', last?.status || 503, last?.credentialReason || 'rate', last?.retryCredential ?? true)
}
