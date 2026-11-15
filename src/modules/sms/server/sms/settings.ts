import { createHash } from 'node:crypto'
import { db } from '@/platform/database/prisma'
import { decryptPanelCredential, encryptPanelCredential } from '@/modules/providers/server/panel-credentials'
import { DEFAULT_SMS, normalizeSmsConfig, smsEvent, type SmsConfig } from '@/modules/sms/domain/sms'
import { auditAdminStrict, type AdminAuditInput } from '@/platform/audit/server'
import { serializable } from './transaction'
import { SmsError } from './error'
const KEY = 'sms.config.v1'

export async function getSmsConfig(): Promise<SmsConfig> {
  const row = await db.setting.findUnique({ where: { key: KEY } }).catch(() => {
    throw new SmsError('دریافت تنظیمات پیامک ممکن نشد؛ تنظیمات قبلی حفظ شده است', 503)
  })
  if (!row) return structuredClone(DEFAULT_SMS)
  try {
    const stored = JSON.parse(row.value)
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) throw new Error('invalid SMS settings')
    // The encrypted envelope is longer than the form's plaintext limit. Never trim or sanitize persisted ciphertext.
    const apiKey = typeof stored.apiKey === 'string' ? stored.apiKey : ''
    return normalizeSmsConfig({ ...stored, apiKey: '' }, { ...DEFAULT_SMS, apiKey })
  } catch {
    throw new SmsError('خواندن تنظیمات پیامک ممکن نشد؛ تنظیمات قبلی حفظ شده است', 503)
  }
}

const revisionOf = (config: SmsConfig) => createHash('sha256').update(JSON.stringify(config)).digest('hex')

function parseConfig(value: string | undefined): SmsConfig {
  if (value === undefined) return structuredClone(DEFAULT_SMS)
  try {
    const stored = JSON.parse(value)
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) throw new Error()
    const apiKey = typeof stored.apiKey === 'string' ? stored.apiKey : ''
    return normalizeSmsConfig({ ...stored, apiKey: '' }, { ...DEFAULT_SMS, apiKey })
  } catch { throw new SmsError('خواندن تنظیمات پیامک ممکن نشد', 503) }
}

export async function saveSmsConfig(input: Record<string, unknown>, context?: Pick<AdminAuditInput, 'req' | 'actor'>): Promise<SmsConfig> {
  return serializable(async tx => {
    const row = await tx.setting.findUnique({ where: { key: KEY } }).catch(() => { throw new SmsError('دریافت تنظیمات پیامک ممکن نشد؛ تنظیمات قبلی حفظ شده است', 503) })
    const previous = parseConfig(row?.value)
    if (input.revision !== undefined && input.revision !== revisionOf(previous)) throw new SmsError('تنظیمات تغییر کرده است؛ صفحه را تازه کنید', 409)
    const next = normalizeSmsConfig(input, previous)
    if (String(input.fromNumber ?? '').trim() && !next.fromNumber) throw new SmsError('شمارهٔ خط ارسال معتبر نیست')
    if (next.enabled && !next.fromNumber) throw new SmsError('شمارهٔ خط ارسال را وارد کنید')
    if (next.enabled && !next.apiKey) throw new SmsError('کلید API را وارد کنید')
    for (const [id, event] of Object.entries(next.events)) {
      if (event.text === previous.events[id]?.text) continue
      const allowed = new Set([...(smsEvent(id)?.vars || []), 'brand'])
      for (const match of event.text.matchAll(/\{(\w+)\}/g)) if (!allowed.has(match[1])) throw new SmsError(`متغیر نامعتبر در الگوی ${id}: ${match[1]}`)
    }
    if (next.otpText !== previous.otpText) for (const match of next.otpText.matchAll(/\{(\w+)\}/g)) if (!['code', 'brand'].includes(match[1])) throw new SmsError(`متغیر نامعتبر در الگوی کد: ${match[1]}`)
    const stored = { ...next, apiKey: next.apiKey === previous.apiKey ? next.apiKey : encryptPanelCredential(next.apiKey) }
    const value = JSON.stringify(stored)
    if (row) {
      const changed = await tx.setting.updateMany({ where: { key: KEY, value: row.value }, data: { value } })
      if (changed.count !== 1) throw new SmsError('تنظیمات تغییر کرده است؛ صفحه را تازه کنید', 409)
    } else await tx.setting.create({ data: { key: KEY, value } })
    if (context) await auditAdminStrict({ ...context, action: 'sms.config.update', targetType: 'setting', targetId: KEY, metadata: { enabled: stored.enabled, fromNumber: stored.fromNumber } }, tx)
    return stored
  }).catch(error => {
    if ((error as { code?: string }).code === 'P2002') throw new SmsError('تنظیمات تغییر کرده است؛ صفحه را تازه کنید', 409)
    throw error
  })
}

export function apiKeyOf(config: SmsConfig) {
  try { return decryptPanelCredential(config.apiKey) } catch { return '' }
}

export function publicSmsConfig(config: SmsConfig) {
  const key = apiKeyOf(config)
  const problems = [!config.enabled && 'پیامک فعال نیست', !key && 'کلید API قابل استفاده نیست', !config.fromNumber && 'شماره خط ارسال وارد نشده است'].filter((value): value is string => !!value)
  return { ...config, apiKey: key ? `••••${key.slice(-4)}` : '', hasKey: !!key, ready: isReady(config), otpReady: isReady(config) && config.otpLogin, revision: revisionOf(config), problems }
}

export const isReady = (config: SmsConfig) => config.enabled && !!apiKeyOf(config) && !!config.fromNumber

/** Codes are offered only when the configured provider can accept them. */
export async function smsAvailable() {
  return isReady(await getSmsConfig())
}

/** Phone login keeps its own switch and the shared configured-provider requirement. */
export async function otpLoginAvailable() {
  const config = await getSmsConfig()
  return config.otpLogin && isReady(config)
}
