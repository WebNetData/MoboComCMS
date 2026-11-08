import { randomUUID } from 'node:crypto'
import { db } from '@/platform/database/prisma'
import { updateJsonSetting } from '@/modules/settings/server'
import { encryptPanelCredential, decryptPanelCredential } from '@/modules/providers/server/panel-credentials'
import { auditAdminStrict, type AdminAuditInput } from '@/platform/audit/server'
import { AI_PROVIDERS } from '../../domain/ai'
import { credentialBase, credentialSettings, type AiCredentialPool } from '../../domain/credentials'
import { AiError } from '../error'

export const CREDENTIALS_KEY = 'ai.credentials.v1'
export const CREDENTIAL_HEALTH_KEY = 'ai.credentials.health.v1'
export async function readCredentialPools() {
  const row = await db.setting.findUnique({ where: { key: CREDENTIALS_KEY } })
  try { return credentialSettings(row ? JSON.parse(row.value) : {}) }
  catch { throw new AiError('کلیدهای چندگانه قابل خواندن نیستند؛ تنظیم قبلی حفظ شد', 503) }
}
export async function saveCredentialPool(raw: Record<string, unknown>, audit: AdminAuditInput) {
  if (!/^[a-f\d]{64}$/i.test(process.env.PANEL_CREDENTIAL_KEY || '')) throw new AiError('کلید رمزگذاری سرور باید پیش از ذخیرهٔ کلیدهای چندگانه تنظیم شود', 503)
  if (!Number.isSafeInteger(raw.revision) || raw.provider === 'economy' || !AI_PROVIDERS.some(p => p.id === raw.provider) || typeof raw.enabled !== 'boolean' || !Array.isArray(raw.keys) || raw.keys.length > 6) throw new AiError('تنظیم کلیدهای چندگانه معتبر نیست')
  const provider = AI_PROVIDERS.find(p => p.id === raw.provider)!.id
  let baseUrl: string
  try { baseUrl = credentialBase(provider, raw.baseUrl || '') } catch { throw new AiError('نشانی مقصد کلیدها معتبر نیست') }
  return updateJsonSetting(CREDENTIALS_KEY, async (value, tx) => {
    const config = credentialSettings(value)
    if (config.revision !== raw.revision) throw new AiError('تنظیمات هم‌زمان تغییر کرده؛ فهرست را تازه کنید', 409)
    const old = config.pools.find(p => p.provider === provider), seen = new Set<string>()
    const keys = (raw.keys as Record<string, unknown>[]).map(input => {
      if (!input || typeof input !== 'object' || Object.keys(input).some(k => !['id', 'label', 'apiKey', 'enabled', 'reset'].includes(k)) || typeof input.label !== 'string' || !input.label.trim() || input.label.length > 60 || /[\u0000-\u001f<>]/.test(input.label) || typeof input.enabled !== 'boolean' || typeof input.apiKey !== 'string' || input.apiKey.length > 400 || (input.reset !== undefined && typeof input.reset !== 'boolean')) throw new AiError('نام، کلید یا وضعیت ردیف معتبر نیست')
      const prior = old?.keys.find(k => k.id === input.id)
      if (input.id && !prior) throw new AiError('کلید حذف یا تغییر کرده است؛ فهرست را تازه کنید', 409)
      const id = prior?.id || randomUUID()
      if (seen.has(id)) throw new AiError('ردیف تکراری است'); seen.add(id)
      const key = input.apiKey.trim()
      if ((!key && (!prior || old?.baseUrl !== baseUrl)) || /[\u0000-\u0020]/.test(key) || key.startsWith('••••') || key.startsWith('encv1:')) throw new AiError('برای مقصد تازه کلید معتبر وارد کنید؛ کلید قبلی به مقصد دیگری فرستاده نمی‌شود')
      return { id, label: input.label.trim(), enabled: input.enabled, secret: key ? encryptPanelCredential(key) : prior!.secret, version: prior ? prior.version + (key || input.reset || input.enabled !== prior.enabled ? 1 : 0) : 1 }
    })
    if (raw.enabled && !keys.some(k => k.enabled)) throw new AiError('برای فعال‌کردن، حداقل یک کلید روشن لازم است')
    const secrets = new Set<string>()
    for (const key of keys) { let plain: string; try { plain = decryptPanelCredential(key.secret) } catch { throw new AiError('یکی از کلیدها قابل خواندن نیست؛ آن را دوباره وارد یا حذف کنید') } if (secrets.has(plain)) throw new AiError('دو ردیف نباید کلید API یکسان داشته باشند'); secrets.add(plain) }
    const pool: AiCredentialPool = { provider, baseUrl, enabled: raw.enabled as boolean, keys }
    Object.assign(value, { version: 1, revision: config.revision + 1, pools: [...config.pools.filter(p => p.provider !== provider), pool] })
    await auditAdminStrict({ ...audit, metadata: { provider, enabled: pool.enabled, keyCount: keys.length } }, tx)
  })
}
