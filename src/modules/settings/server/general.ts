import type { Prisma } from '@prisma/client'
import { createHash } from 'node:crypto'
import { db } from '@/platform/database/prisma'
import { invalidate } from '@/platform/cache/kv'
import { auditAdminStrict, type AdminAuditInput } from '@/platform/audit/server'
import { GENERAL_SETTING_KEYS, generalSettingsPatch } from '@/modules/settings/domain/general'
import { recordRevision, RevisionError, type RestoreCommit } from '@/modules/content/server/revisions'
import type { Snapshot } from '@/modules/content/domain/revisions'

export async function generalSettingsState(tx: Prisma.TransactionClient = db): Promise<Record<string, string | null>> {
  const rows = await tx.setting.findMany({ where: { key: { in: [...GENERAL_SETTING_KEYS] } } })
  const values = new Map(rows.map(row => [row.key, row.value]))
  return Object.fromEntries(GENERAL_SETTING_KEYS.map(key => [key, values.get(key) ?? null]))
}
export const generalSettingsRevision = (values: Record<string, unknown>) => createHash('sha256').update(JSON.stringify(values)).digest('hex')

async function change(input: Record<string, unknown>, commit: RestoreCommit, options: { restore?: boolean; expected?: string | null } = {}) {
  let patch: Record<string, string | null>
  try { patch = generalSettingsPatch(input, options.restore) } catch (error) { throw new RevisionError((error as Error).message, options.restore ? 422 : 400) }
  const result = await db.$transaction(async tx => {
    const before = await generalSettingsState(tx)
    if (options.expected && options.expected !== generalSettingsRevision(before)) throw new RevisionError('تنظیمات هم‌زمان تغییر کرده است؛ صفحه را تازه کنید', 409)
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) { if (before[key] !== null) await tx.setting.deleteMany({ where: { key, value: before[key]! } }) }
      else if (before[key] === null) await tx.setting.create({ data: { key, value } })
      else if (!(await tx.setting.updateMany({ where: { key, value: before[key]! }, data: { value } })).count) throw new RevisionError('تنظیمات هم‌زمان تغییر کرده است', 409)
    }
    const after = await generalSettingsState(tx)
    await commit(tx, before, after)
    return { before, after }
  }, { isolationLevel: 'Serializable', timeout: 30_000 })
  await invalidate('settings:').catch(() => undefined)
  return result
}

export async function saveGeneralSettings(input: Record<string, unknown>, context: Pick<AdminAuditInput, 'req' | 'actor'>, expected?: string | null) {
  return change(input, async (tx, before, after) => {
    await recordRevision({ entityType: 'settings-general', entityId: 1, before, after, actor: context.actor, client: tx, strict: true })
    await auditAdminStrict({ ...context, action: 'settings.general.update', targetType: 'setting', targetId: 'general', metadata: { fields: Object.keys(generalSettingsPatch(input)) } }, tx)
  }, { expected })
}

export async function restoreGeneralSettings(id: number, snapshot: Snapshot, commit: RestoreCommit) {
  if (id !== 1) throw new RevisionError('این تنظیمات پیدا نشد', 404)
  return change(snapshot, commit, { restore: true })
}
