import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { updateJsonSetting } from '@/modules/settings/server'
import { auditAdminStrict, type AdminAuditInput } from '@/platform/audit/server'
import { ENGINEERING_SETTINGS, EngineeringError, engineeringPolicy } from '../../domain/engineering'

export async function readEngineeringPolicy(reader: Pick<Prisma.TransactionClient, 'setting'> = db) {
  const row = await reader.setting.findUnique({ where: { key: ENGINEERING_SETTINGS } })
  try { return engineeringPolicy(row ? JSON.parse(row.value) : {}) } catch { throw new EngineeringError('خواندن تنظیمات مهندسی انجام نشد؛ تنظیمات قبلی حفظ شد', 503) }
}
export async function saveEngineeringPolicy(input: unknown, audit: AdminAuditInput) {
  const next = engineeringPolicy(input)
  return updateJsonSetting(ENGINEERING_SETTINGS, async (raw, tx) => {
    const old = engineeringPolicy(raw)
    if (old.revision !== next.revision) throw new EngineeringError('تنظیمات هم‌زمان تغییر کرده؛ ابتدا تازه کنید', 409)
    const saved = { ...next, revision: old.revision + 1 }
    Object.assign(raw, saved)
    await auditAdminStrict({ ...audit, metadata: { revision: saved.revision, enabled: saved.enabled, skillIds: saved.skills.map(s => s.id) } }, tx)
    return saved
  })
}
