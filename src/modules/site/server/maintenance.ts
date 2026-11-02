import { db } from '@/platform/database/prisma'
import { extensionCatalog } from '@/extensions/generated/catalog'
import { createSectionSettingsHistory, type SectionSettingsContext } from '@/modules/settings/server/section-history'
import { MAINTENANCE_SECTIONS, closedPlugins, isMaintenanceSection, normalizeMaintenance, normalizeSite, type MaintenanceSectionId, type MaintenanceState, type SectionMaintenance } from '@/modules/site/domain/maintenance'
import { loadSectionAccess } from '@/modules/account/server/section-access'

// Which sections are in maintenance, and with which words. Read by the middleware on every page
// request, so it is kept in memory for a few seconds, like the section addresses.

const KEY = 'site.maintenance.v1'
const maintenanceHistory = createSectionSettingsHistory(KEY, 'settings-maintenance', normalizeMaintenance, () => ({}), { action: 'maintenance.section', targetId: KEY })
export const maintenanceSettingsState = maintenanceHistory.current
export async function restoreMaintenanceSettings(...args: Parameters<typeof maintenanceHistory.restore>) { const result = await maintenanceHistory.restore(...args); cache = null; return result }
const TTL = 5_000
let cache: { at: number; state: MaintenanceState } | null = null

/** The base paths of each section: its plugin's public paths, plus the ones named beside it. */
export function maintenanceBases(): Record<MaintenanceSectionId, string[]> {
  const out = {} as Record<MaintenanceSectionId, string[]>
  for (const section of MAINTENANCE_SECTIONS) out[section.id] = [...new Set([...(extensionCatalog.find((manifest) => manifest.id === section.plugin)?.publicPaths || []), ...section.extra])]
  return out
}

export async function loadMaintenance(fresh = false): Promise<MaintenanceState> {
  if (!fresh && cache && Date.now() - cache.at < TTL) return cache.state
  let stored: unknown = null
  try { const row = await db.setting.findUnique({ where: { key: KEY } }); stored = row ? JSON.parse(row.value) : null } catch { stored = cache?.state ?? null }
  cache = { at: Date.now(), state: normalizeMaintenance(stored) }
  return cache.state
}

/** Shared public discovery excludes maintenance and audience-limited sections. Unknown access fails closed. */
export async function closedSectionPlugins(): Promise<Set<string>> {
  const [state, limited] = await Promise.all([loadMaintenance().catch(() => normalizeMaintenance(null)), loadSectionAccess().catch(() => null)])
  return new Set([...closedPlugins(state), ...MAINTENANCE_SECTIONS.filter((section) => limited === null || limited[section.id]?.length).map((section) => section.plugin)])
}

/** Changes the whole site's maintenance; the sections stay as they are. */
export async function saveSiteMaintenance(input: Record<string, unknown>, context?: SectionSettingsContext): Promise<MaintenanceState> {
  const result = await maintenanceHistory.save((current: MaintenanceState) => ({ site: normalizeSite({ ...current.site, ...input }) }), context)
  cache = null
  return result
}

/** Changes one section's maintenance state; the other sections stay as they are. */
export async function saveSectionMaintenance(section: unknown, input: unknown, context?: SectionSettingsContext): Promise<MaintenanceState> {
  if (!isMaintenanceSection(section)) throw new Error('unknown section')
  const result = await maintenanceHistory.save((current: MaintenanceState) => ({ [section]: { ...current[section], ...(input && typeof input === 'object' ? input as Partial<SectionMaintenance> : {}) } }), context)
  cache = null
  return result
}
