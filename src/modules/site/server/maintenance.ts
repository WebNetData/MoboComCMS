import { db } from '@/platform/database/prisma'
import { extensionCatalog } from '@/extensions/generated/catalog'
import { MAINTENANCE_SECTIONS, isMaintenanceSection, normalizeMaintenance, type MaintenanceSectionId, type MaintenanceState, type SectionMaintenance } from '@/modules/site/domain/maintenance'

// Which sections are in maintenance, and with which words. Read by the middleware on every page
// request, so it is kept in memory for a few seconds, like the section addresses.

const KEY = 'site.maintenance.v1'
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

/** Changes one section's maintenance state; the other sections stay as they are. */
export async function saveSectionMaintenance(section: unknown, input: unknown): Promise<MaintenanceState> {
  if (!isMaintenanceSection(section)) throw new Error('unknown section')
  const current = await loadMaintenance(true)
  const next = normalizeMaintenance({ ...current, [section]: { ...current[section], ...(input && typeof input === 'object' ? (input as Partial<SectionMaintenance>) : {}) } })
  const value = JSON.stringify(next)
  await db.setting.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } })
  cache = { at: Date.now(), state: next }
  return next
}
