import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { updateJsonSetting } from '@/modules/settings/server'
import { createInboxEvent } from '@/modules/notifications/server/inbox'
import { credentialSettings, CREDENTIAL_REASONS, type AiCredential, type CredentialHealth, type CredentialReason } from '../../domain/credentials'
import { CREDENTIALS_KEY, CREDENTIAL_HEALTH_KEY } from './store'
import { AiError } from '../error'

type Health = Record<string, CredentialHealth>
export function credentialHealth(value: Record<string, unknown>): Health {
  if (!Object.keys(value).length) return {}
  if (value.version !== 1 || !value.entries || typeof value.entries !== 'object' || Array.isArray(value.entries)) throw new AiError('وضعیت کلیدها قابل خواندن نیست؛ دوباره تلاش کنید', 503)
  const entries = value.entries as Health
  for (const h of Object.values(entries)) if (!h || !Number.isSafeInteger(h.version) || h.version < 1 || ![h.at, h.retryAt, h.failures, h.lastSuccess].every(n => Number.isFinite(n) && n >= 0) || (h.reason !== '' && !Object.hasOwn(CREDENTIAL_REASONS, h.reason))) throw new AiError('وضعیت کلیدها معتبر نیست', 503)
  return entries
}
export async function readCredentialHealth() {
  const row = await db.setting.findUnique({ where: { key: CREDENTIAL_HEALTH_KEY } })
  try { return credentialHealth(row ? JSON.parse(row.value) : {}) }
  catch { throw new AiError('وضعیت کلیدها قابل خواندن نیست؛ اطلاعات حفظ شد', 503) }
}
/** State and local inbox copies commit together; no external delivery is queued. */
export async function recordCredentialResult(provider: string, key: AiCredential, started: number, reason?: CredentialReason) {
  return updateJsonSetting(CREDENTIAL_HEALTH_KEY, async (value, tx: Prisma.TransactionClient) => {
    const stored = await tx.setting.findUnique({ where: { key: CREDENTIALS_KEY } }), pools = credentialSettings(stored ? JSON.parse(stored.value) : {})
    const pool = pools.pools.find(p => p.provider === provider && p.enabled), current = pool?.keys.find(k => k.id === key.id && k.enabled && k.version === key.version)
    if (!current) return
    const health = credentialHealth(value), old = health[key.id]
    if (old?.version === key.version && old.at > started) return
    const now = Date.now(), same = old?.version === key.version
    const cooldown = reason === 'auth' ? 24 * 60 * 60_000 : reason === 'quota' ? 30 * 60_000 : reason === 'rate' ? 60_000 : 30_000
    health[key.id] = { version: key.version, at: started, reason: reason || '', retryAt: reason ? now + cooldown : 0, failures: reason ? (same ? old.failures : 0) + 1 : 0, lastSuccess: reason ? same ? old.lastSuccess : 0 : now }
    const active = new Set(pools.pools.flatMap(p => p.keys.map(k => k.id)))
    for (const id of Object.keys(health)) if (!active.has(id)) delete health[id]
    Object.assign(value, { version: 1, entries: health })
    if (!reason || (same && old.reason === reason && old.retryAt > now)) return
    const admins = await tx.user.findMany({ where: { role: 'ADMIN', status: 'ACTIVE' }, select: { id: true, roleId: true, roleRef: { select: { permissions: true } } } })
    for (const admin of admins) {
      if (admin.roleId != null && !admin.roleRef?.permissions.split(',').includes('settings.manage')) continue
      await createInboxEvent({ userId: admin.id, kind: 'AI_CREDENTIAL_FAILURE', dedupeKey: `ai-key:${key.id}:${key.version}:${reason}:${Math.floor(now / 3600000)}:${admin.id}`, titleFa: 'نیاز به بررسی کلید هوش مصنوعی', titleEn: 'AI credential needs attention', bodyFa: `${provider} · ${key.label}: ${CREDENTIAL_REASONS[reason]}. در صورت وجود کلید مجاز دیگر، همان سرویس استفاده می‌شود. وضعیت و زمان تلاش بعدی را در تنظیمات ببینید.`, bodyEn: `${provider}: a configured credential was rejected. Review AI settings.`, href: '/admin/ai?tab=settings', channels: [] }, tx)
    }
  })
}
