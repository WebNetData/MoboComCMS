import { db } from '@/platform/database/prisma'
import { updateJsonSetting } from '@/modules/settings/server'
import { auditAdminStrict, type AdminAuditInput } from '@/platform/audit/server'
import { AI_TOOLS, AiOperationError, isObject } from '../../domain/operations'
import type { Prisma } from '@prisma/client'

export const OPERATIONS_KEY = 'ai.operations.v1'
export type OperationsPolicy = { enabled: boolean; allowed: string[]; maxProposals: number }
export function decodePolicy(raw: unknown): OperationsPolicy {
  if (!isObject(raw)) throw new AiOperationError('سیاست دستیار قابل خواندن نیست؛ تنظیمات قبلی حفظ شد', 503)
  if (!Object.keys(raw).length) return { enabled: true, allowed: AI_TOOLS.map(t => t.id), maxProposals: 3 }
  if (typeof raw.enabled !== 'boolean' || !Array.isArray(raw.allowed) || raw.allowed.some(id => !AI_TOOLS.some(t => t.id === id)) || !Number.isInteger(raw.maxProposals) || Number(raw.maxProposals) < 1 || Number(raw.maxProposals) > 3) throw new AiOperationError('سیاست دستیار معتبر نیست', 503)
  return { enabled: raw.enabled, allowed: [...new Set(raw.allowed)] as string[], maxProposals: Number(raw.maxProposals) }
}
export async function readOperationsPolicy(reader: Pick<Prisma.TransactionClient, 'setting'> = db) {
  try { const row = await reader.setting.findUnique({ where: { key: OPERATIONS_KEY } }); return decodePolicy(row ? JSON.parse(row.value) : {}) }
  catch (e) { if (e instanceof AiOperationError) throw e; throw new AiOperationError('خواندن سیاست دستیار انجام نشد', 503) }
}
export async function saveOperationsPolicy(raw: unknown, audit: AdminAuditInput) {
  if (!isObject(raw) || !['enabled', 'allowed', 'maxProposals'].every(k => Object.hasOwn(raw, k))) throw new AiOperationError('همهٔ فیلدهای سیاست را مشخص کنید')
  const policy = decodePolicy(raw)
  return updateJsonSetting(OPERATIONS_KEY, async (value, tx) => { decodePolicy(value); Object.assign(value, policy); await auditAdminStrict(audit, tx); return policy })
}
