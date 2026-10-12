/**
 * Maintenance mode, one section at a time. While a section is in maintenance its public pages show
 * a notice instead (with the owner's own words), to everybody except the people who run it: staff
 * with full access, and staff who hold every permission of that section. They see the section as
 * it is, so it can be filled and checked before it is opened.
 */
import { SITE_SECTIONS, sectionsOf } from '@/modules/identity/domain/sections'

/** The sections that have public pages of their own, and the plugin that owns those pages. */
export const MAINTENANCE_SECTIONS = [
  { id: 'businesses', plugin: 'businesses', label: 'تجربهٔ خرید', extra: [] },
  { id: 'store', plugin: 'store', label: 'فروشگاه', extra: [] },
  { id: 'magazine', plugin: 'journal', label: 'مجله', extra: [] },
  { id: 'games', plugin: 'games', label: 'بازی', extra: [] },
  { id: 'cinema', plugin: 'cinema', label: 'فیلم و سریال', extra: ['/watch'] },
  { id: 'music', plugin: 'music', label: 'موزیک', extra: [] },
  { id: 'software', plugin: 'software', label: 'نرم‌افزار', extra: [] },
  { id: 'forum', plugin: 'forum', label: 'تالار گفتمان', extra: [] },
] as const
export type MaintenanceSectionId = (typeof MAINTENANCE_SECTIONS)[number]['id']

export interface SectionMaintenance { enabled: boolean; title: string; message: string }
export type MaintenanceState = Record<MaintenanceSectionId, SectionMaintenance>

export const DEFAULT_TITLE = 'این بخش در حال به‌روزرسانی است'
export const DEFAULT_MESSAGE = 'داریم این بخش را کامل‌تر و بهتر می‌کنیم. به‌زودی دوباره در دسترس خواهد بود؛ از شکیبایی شما سپاسگزاریم.'
export const MAINTENANCE_LIMITS = { title: 120, message: 1200 } as const

export const isMaintenanceSection = (value: unknown): value is MaintenanceSectionId => MAINTENANCE_SECTIONS.some((section) => section.id === value)

// Plain text only: what the owner writes is shown as text, never as markup.
const clean = (value: unknown, max: number) => (typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/\r\n?/g, '\n').trim().slice(0, max) : '')

/** The stored state, whatever was stored: every section present, off unless it clearly says on. */
export function normalizeMaintenance(input: unknown): MaintenanceState {
  const raw = (input && typeof input === 'object' && !Array.isArray(input) ? input : {}) as Record<string, unknown>
  const out = {} as MaintenanceState
  for (const section of MAINTENANCE_SECTIONS) {
    const item = (raw[section.id] && typeof raw[section.id] === 'object' ? raw[section.id] : {}) as Record<string, unknown>
    out[section.id] = { enabled: item.enabled === true, title: clean(item.title, MAINTENANCE_LIMITS.title), message: clean(item.message, MAINTENANCE_LIMITS.message) }
  }
  return out
}

/** What a visitor is shown: the owner's words, or the default ones where the owner wrote nothing. */
export const noticeOf = (state: SectionMaintenance) => ({ title: state.title || DEFAULT_TITLE, message: state.message || DEFAULT_MESSAGE })

/** The section a public path belongs to, given each section's base paths; null for a path of no section. */
export function sectionOfPath(path: string, bases: Record<string, readonly string[]>): MaintenanceSectionId | null {
  for (const section of MAINTENANCE_SECTIONS) for (const base of bases[section.id] || []) if (path === base || path.startsWith(`${base}/`)) return section.id
  return null
}

/** What a session says about its holder: the role, the role id and the permissions it was signed in with. */
export type MaintenanceViewer = Record<string, unknown>

/**
 * Whether this viewer runs the section: staff with full access (no role), or staff whose role
 * holds every permission of the section. A member, or staff of another section, does not.
 */
export function runsSection(viewer: MaintenanceViewer | null | undefined, section: MaintenanceSectionId): boolean {
  if (!viewer || viewer.role !== 'ADMIN') return false
  const permissions = Array.isArray(viewer.permissions) ? viewer.permissions.filter((item): item is string => typeof item === 'string') : []
  if (!permissions.length) return viewer.roleId == null
  return SITE_SECTIONS.some((item) => item.id === section) && sectionsOf(permissions).includes(section)
}

/** What the middleware does with a page request: show it, or show the notice of a section. */
export function maintenanceDecision(input: { path: string; state: MaintenanceState; bases: Record<string, readonly string[]>; viewer: MaintenanceViewer | null }): { action: 'pass'; preview?: MaintenanceSectionId } | { action: 'notice'; section: MaintenanceSectionId } {
  const section = sectionOfPath(input.path, input.bases)
  if (!section || !input.state[section]?.enabled) return { action: 'pass' }
  return runsSection(input.viewer, section) ? { action: 'pass', preview: section } : { action: 'notice', section }
}
