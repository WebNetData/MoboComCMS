import { db } from '@/platform/database/prisma'
import { DownloadError } from '@/modules/server-panel/domain/downloads'
import { auditAdminStrict } from '@/platform/audit/server'
export type DownloadSettingsContext = Pick<Parameters<typeof auditAdminStrict>[0], 'req' | 'actor'>
/** Merge the current aggregate; a failed/corrupt read is never an empty writable snapshot. */
export async function changeDownloadSettings(change: (current: Record<string, any>) => Record<string, unknown>, audit?: Parameters<typeof auditAdminStrict>[0]) {
  for (let attempt = 0; ; attempt++) {
    try { return await db.$transaction(async tx => {
      const key = 'server-panel.downloads.v1', row = await tx.setting.findUnique({ where: { key } })
      let current: Record<string, any>
      try { current = row ? JSON.parse(row.value) : {}; if (!current || typeof current !== 'object' || Array.isArray(current) || (current.storages !== undefined && !Array.isArray(current.storages))) throw new Error() } catch { throw new DownloadError('تنظیمات فضاها خوانده نشد؛ ذخیره متوقف شد', 409) }
      const value = JSON.stringify(change(current))
      if (!row) await tx.setting.create({ data: { key, value } })
      else if (!(await tx.setting.updateMany({ where: { key, value: row.value }, data: { value } })).count) throw Object.assign(new Error('conflict'), { code: 'P2034' })
      if (audit) await auditAdminStrict(audit, tx)
      return value
    }, { isolationLevel: 'Serializable' }) } catch (error) { if (['P2034', 'P2002'].includes((error as { code?: string }).code || '') && attempt < 8) continue; throw error }
  }
}
