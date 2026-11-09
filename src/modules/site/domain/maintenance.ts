/**
 * Maintenance mode, one section at a time. While a section is in maintenance its public pages show
 * a notice instead (with the owner's own words), to everybody except the people who run it: staff
 * with full access, and staff who hold every permission of that section. They see the section as
 * it is, so it can be filled and checked before it is opened.
 */
import { SITE_SECTIONS, sectionsOf } from '@/modules/identity/domain/sections'
import { isSiteGroupKey } from '@/modules/account/domain/site-groups'

/** The sections that have public pages of their own, and the plugin that owns those pages. */
export const MAINTENANCE_SECTIONS = [
  { id: 'vpn', plugin: 'vpn', label: 'VPN', extra: ['/dashboard/subscriptions', '/miniapp/subscriptions', '/miniapp/plans', '/miniapp/trial'] },
  { id: 'hosting', plugin: 'hosting', label: 'موبوکام کلاد', extra: ['/dashboard/services', '/dashboard/domains', '/dashboard/cloud'] },
  { id: 'prompts', plugin: 'prompt-master', label: 'پرامپت مستر', extra: [] },
  { id: 'businesses', plugin: 'businesses', label: 'تجربهٔ خرید', extra: [] },
  { id: 'store', plugin: 'store', label: 'فروشگاه', extra: [] },
  { id: 'magazine', plugin: 'journal', label: 'مجله', extra: [] },
  { id: 'games', plugin: 'games', label: 'بازی', extra: [] },
  { id: 'cinema', plugin: 'cinema', label: 'فیلم و سریال', extra: ['/watch'] },
  { id: 'music', plugin: 'music', label: 'موزیک', extra: [] },
  { id: 'software', plugin: 'software', label: 'نرم‌افزار', extra: [] },
  { id: 'forum', plugin: 'forum', label: 'تالار گفتمان', extra: [] },
  // No plugin of its own: it shows the work of cinema and music, and either section's managers run it.
  { id: 'celebrities', plugin: 'celebrities', label: 'هنرمندان', extra: ['/celebrities'] },
] as const
export type MaintenanceSectionId = (typeof MAINTENANCE_SECTIONS)[number]['id']

export interface SectionMaintenance { enabled: boolean; title: string; message: string; mode: string }
export type MaintenanceState = Record<MaintenanceSectionId, SectionMaintenance> & { site: SiteMaintenance }

/**
 * The whole site closed, beside the sections. Only full-access staff and the people and groups named here stay in; a
 * group here is any of the site's groups. The look is the owner's choice among closed lists, the words are plain text.
 */
export interface SiteMaintenance { enabled: boolean; mode: string; title: string; message: string; design: string; effect: string; icon: string; reopensAt: string; users: number[]; groups: string[] }

export const SITE_DESIGNS = [
  { id: 'aurora', label: 'شفق' }, { id: 'orbit', label: 'مدار' }, { id: 'blueprint', label: 'نقشه' },
  { id: 'terminal', label: 'ترمینال' }, { id: 'paper', label: 'کاغذ' }, { id: 'brand', label: 'رنگ سایت' },
] as const
export const SITE_EFFECTS = [{ id: 'rise', label: 'ورود نرم' }, { id: 'float', label: 'شناور' }, { id: 'pulse', label: 'تپش' }, { id: 'shimmer', label: 'درخشش' }, { id: 'still', label: 'بدون حرکت' }] as const
export const SITE_ICONS = [{ id: 'gear', label: 'چرخ‌دنده' }, { id: 'wrench', label: 'آچار' }, { id: 'hammer', label: 'چکش' }, { id: 'rocket', label: 'موشک' }, { id: 'sparkle', label: 'درخشش' }, { id: 'clock', label: 'ساعت' }, { id: 'shield', label: 'سپر' }] as const
export const SITE_LIMITS = { title: 120, message: 1200, users: 200, groups: 40 } as const
const oneOf = (list: readonly { id: string }[], value: unknown) => (list.some((item) => item.id === value) ? String(value) : list[0].id)

export function normalizeSite(input: unknown): SiteMaintenance {
  const raw = (input && typeof input === 'object' && !Array.isArray(input) ? input : {}) as Record<string, unknown>
  const when = typeof raw.reopensAt === 'string' && raw.reopensAt && !Number.isNaN(new Date(raw.reopensAt).getTime()) ? new Date(raw.reopensAt).toISOString() : ''
  return {
    enabled: raw.enabled === true, mode: MAINTENANCE_MODES.some((item) => item.id === raw.mode) ? String(raw.mode) : 'develop', title: clean(raw.title, SITE_LIMITS.title), message: clean(raw.message, SITE_LIMITS.message),
    design: oneOf(SITE_DESIGNS, raw.design), effect: oneOf(SITE_EFFECTS, raw.effect), icon: oneOf(SITE_ICONS, raw.icon), reopensAt: when,
    users: [...new Set((Array.isArray(raw.users) ? raw.users : []).map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))].slice(0, SITE_LIMITS.users),
    groups: [...new Set((Array.isArray(raw.groups) ? raw.groups : []).filter(isSiteGroupKey))].slice(0, SITE_LIMITS.groups),
  }
}

// What keeps working while the site is closed: signing in, so the owner can get back; a bank returning a payer and what it
// tells us; the services already paid for and the machines that run the site. Assets are files, so the notice itself can load.
const OPEN_PAGES = /^\/(login|forgot-password|reset-password|maintenance|install|payment|s)(\/|$)/
const OPEN_APIS = /^\/api\/(auth|login|password|sms|human-check|payment|telegram|internal|health|metrics|install|sub|happ)(\/|$)/
export const openDuringSiteMaintenance = (path: string) => OPEN_PAGES.test(path) || OPEN_APIS.test(path) || (/\.[a-z0-9]{2,12}$/i.test(path) && !/^\/(dl|files|api|admin)(\/|$)/.test(path))

export const DEFAULT_TITLE = 'این بخش در حال به‌روزرسانی است'
export const DEFAULT_MESSAGE = 'داریم این بخش را کامل‌تر و بهتر می‌کنیم. به‌زودی دوباره در دسترس خواهد بود؛ از شکیبایی شما سپاسگزاریم.'
export const MAINTENANCE_LIMITS = { title: 120, message: 1200 } as const

/** Why it is closed: what the owner picks, and the words shown when they write none. */
export const MAINTENANCE_MODES = [
  { id: 'update', label: 'به‌روزرسانی', title: DEFAULT_TITLE, message: DEFAULT_MESSAGE, siteTitle: 'سایت در حال به‌روزرسانی است', siteMessage: 'داریم سایت را کامل‌تر و بهتر می‌کنیم. به‌زودی دوباره در دسترس خواهد بود؛ از شکیبایی شما سپاسگزاریم.' },
  { id: 'repair', label: 'تعمیر', title: 'این بخش در حال تعمیر است', message: 'مشکلی را برطرف می‌کنیم و این بخش به‌زودی دوباره در دسترس خواهد بود. از شکیبایی شما سپاسگزاریم.', siteTitle: 'سایت در حال تعمیر است', siteMessage: 'مشکلی را برطرف می‌کنیم و سایت به‌زودی دوباره در دسترس خواهد بود. از شکیبایی شما سپاسگزاریم.' },
  { id: 'develop', label: 'توسعه', title: 'این بخش در دست توسعه است', message: 'امکانات تازه‌ای می‌سازیم و این بخش به‌زودی با نسخه‌ای بهتر باز می‌شود.', siteTitle: 'سایت در دست توسعه است', siteMessage: 'داریم سایت را بهتر می‌کنیم و به‌زودی با نسخه‌ای تازه برمی‌گردیم. از صبوری شما سپاسگزاریم.' },
] as const
const modeOf = (id: unknown) => MAINTENANCE_MODES.find((mode) => mode.id === id) ?? MAINTENANCE_MODES[0]

export const isMaintenanceSection = (value: unknown): value is MaintenanceSectionId => MAINTENANCE_SECTIONS.some((section) => section.id === value)

// Plain text only: what the owner writes is shown as text, never as markup.
const clean = (value: unknown, max: number) => (typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/\r\n?/g, '\n').trim().slice(0, max) : '')

/** The stored state, whatever was stored: every section present, off unless it clearly says on. */
export function normalizeMaintenance(input: unknown): MaintenanceState {
  const raw = (input && typeof input === 'object' && !Array.isArray(input) ? input : {}) as Record<string, unknown>
  const out = {} as MaintenanceState
  for (const section of MAINTENANCE_SECTIONS) {
    const item = (raw[section.id] && typeof raw[section.id] === 'object' ? raw[section.id] : {}) as Record<string, unknown>
    out[section.id] = { enabled: item.enabled === true, title: clean(item.title, MAINTENANCE_LIMITS.title), message: clean(item.message, MAINTENANCE_LIMITS.message), mode: modeOf(item.mode).id }
  }
  out.site = normalizeSite(raw.site)
  return out
}

/** What a visitor is shown: the owner's words, or the default ones where the owner wrote nothing. */
export const noticeOf = (state: Pick<SectionMaintenance, 'title' | 'message'> & { mode?: string }) => ({ title: state.title || modeOf(state.mode).title, message: state.message || modeOf(state.mode).message })
export const siteNoticeOf = (state: Pick<SiteMaintenance, 'title' | 'message' | 'mode'>) => ({ title: state.title || modeOf(state.mode).siteTitle, message: state.message || modeOf(state.mode).siteMessage })

/** The section a public path belongs to, given each section's base paths; null for a path of no section. */
export function sectionOfPath(path: string, bases: Record<string, readonly string[]>): MaintenanceSectionId | null {
  for (const section of MAINTENANCE_SECTIONS) for (const base of bases[section.id] || []) if (path === base || path.startsWith(`${base}/`)) return section.id
  return null
}

/**
 * The plugins whose public pages are closed now. What lists a section's items for everybody (search, the sitemap,
 * the feeds) leaves these out, so a visitor is not led to a notice. The section's own pages and its admin are
 * not decided here.
 */
export function closedPlugins(state: MaintenanceState): string[] {
  return MAINTENANCE_SECTIONS.filter((section) => state[section.id]?.enabled).map((section) => section.plugin)
}

/** Whether a public path belongs to a section that is closed now. */
export function pathClosed(path: string, state: MaintenanceState, bases: Record<string, readonly string[]>): boolean {
  const section = sectionOfPath(path, bases)
  return !!section && state[section].enabled
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
  if (section === 'celebrities') return permissions.includes('cinema.manage') || permissions.includes('music.manage')
  return SITE_SECTIONS.some((item) => item.id === section) && sectionsOf(permissions).includes(section)
}

/** What the middleware does with a page request: show it, or show the notice of a section. */
export function maintenanceDecision(input: { path: string; state: MaintenanceState; bases: Record<string, readonly string[]>; viewer: MaintenanceViewer | null }): { action: 'pass'; preview?: MaintenanceSectionId } | { action: 'notice'; section: MaintenanceSectionId } {
  const section = sectionOfPath(input.path, input.bases)
  if (!section || !input.state[section]?.enabled) return { action: 'pass' }
  return runsSection(input.viewer, section) ? { action: 'pass', preview: section } : { action: 'notice', section }
}
