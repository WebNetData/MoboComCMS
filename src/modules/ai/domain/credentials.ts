import { AI_PROVIDERS, type AiProviderId } from './ai'
export type CredentialReason = 'auth' | 'quota' | 'rate' | 'unavailable'
export type AiCredential = { id: string; label: string; secret: string; enabled: boolean; version: number }
export type AiCredentialPool = { provider: AiProviderId; baseUrl: string; enabled: boolean; keys: AiCredential[] }
export type AiCredentialSettings = { version: 1; revision: number; pools: AiCredentialPool[] }
export type CredentialHealth = { version: number; at: number; retryAt: number; reason: CredentialReason | ''; failures: number; lastSuccess: number }
export const CREDENTIAL_REASONS: Record<CredentialReason, string> = { auth: 'کلید نامعتبر یا بدون مجوز', quota: 'اعتبار یا سهمیه در دسترس نیست', rate: 'محدودیت موقت درخواست', unavailable: 'سرویس موقتاً در دسترس نیست' }
export function credentialBase(provider: AiProviderId, value: unknown) {
  if (provider !== 'custom') return ''
  if (typeof value !== 'string' || value.length > 300) throw Error('invalid destination')
  const url = new URL(value)
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw Error('invalid destination')
  return url.toString().replace(/\/+$/, '')
}
export function credentialSettings(raw: Record<string, unknown>): AiCredentialSettings {
  if (!Object.keys(raw).length) return { version: 1, revision: 0, pools: [] }
  if (raw.version !== 1 || !Number.isSafeInteger(raw.revision) || Number(raw.revision) < 0 || !Array.isArray(raw.pools) || raw.pools.length > AI_PROVIDERS.length) throw Error('invalid pools')
  const providers = new Set<string>(), ids = new Set<string>()
  for (const pool of raw.pools as AiCredentialPool[]) {
    if (!pool || !AI_PROVIDERS.some(p => p.id === pool.provider) || providers.has(pool.provider) || typeof pool.enabled !== 'boolean' || credentialBase(pool.provider, pool.baseUrl) !== pool.baseUrl || !Array.isArray(pool.keys) || pool.keys.length > 6) throw Error('invalid pool')
    providers.add(pool.provider)
    for (const key of pool.keys) {
      if (!key || !/^[a-f\d-]{36}$/i.test(key.id) || ids.has(key.id) || typeof key.label !== 'string' || !key.label.trim() || key.label.length > 60 || typeof key.secret !== 'string' || !key.secret || key.secret.length > 2048 || typeof key.enabled !== 'boolean' || !Number.isSafeInteger(key.version) || key.version < 1) throw Error('invalid credential')
      ids.add(key.id)
    }
  }
  return raw as AiCredentialSettings
}
