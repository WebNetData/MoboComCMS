import { db } from '@/platform/database/prisma'
import { createSectionSettingsHistory } from '@/modules/settings/server'
import { normalizeHealthSettings } from '@/modules/downloads/domain/health'
export const HEALTH_KEY = 'downloads.health.v1'
const history = () => createSectionSettingsHistory(HEALTH_KEY, 'settings-download-health', normalizeHealthSettings, settings => ({ enabled: settings.enabled, hosts: settings.hosts, intervalHours: settings.intervalHours, batchSize: settings.batchSize }))
export const saveHealthSettings = (...args: Parameters<ReturnType<typeof history>['save']>) => history().save(...args)
/** Fresh settings on every outbound step; unreadable stored values fail closed. */
export async function healthSettings() {
  const row = await db.setting.findUnique({ where: { key: HEALTH_KEY } })
  if (!row) return normalizeHealthSettings({})
  const raw: unknown = JSON.parse(row.value)
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('Invalid link health configuration')
  return normalizeHealthSettings(raw)
}
