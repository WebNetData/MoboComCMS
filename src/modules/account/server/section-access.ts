import { db } from '@/platform/database/prisma'
import { isSiteGroupKey } from '@/modules/account/domain/site-groups'
import { MAINTENANCE_SECTIONS, runsSection, type MaintenanceSectionId } from '@/modules/site/domain/maintenance'
import { siteGroupsOf } from '@/modules/account/server/site-groups'
import { accountOf, type ViewerAccount } from '@/modules/account/server/viewer-account'
import { createSectionSettingsHistory, type SectionSettingsContext } from '@/modules/settings/server'
import { GroupError } from '@/modules/account/domain/user-groups'

// Which groups a whole section is limited to. A section that is not listed is open to everyone. Read by the proxy on
// every request, so it is held in memory for a few seconds, like maintenance.
const KEY = 'site.section-access.v1'
const TTL = 15_000

export type SectionAccess = Partial<Record<MaintenanceSectionId, string[]>>
export type SectionLock = 'open' | 'login' | 'refused'

const g = globalThis as unknown as { __mobocomSectionAccess?: { at: number; state: SectionAccess } }

function normalize(input: unknown): SectionAccess {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new GroupError('محدودیت بخش‌ها معتبر نیست')
  const raw = (input && typeof input === 'object' && !Array.isArray(input) ? input : {}) as Record<string, unknown>
  const out: SectionAccess = {}
  for (const section of MAINTENANCE_SECTIONS) {
    const value = raw[section.id]
    if (value !== undefined && (!Array.isArray(value) || value.some(key => !isSiteGroupKey(key)))) throw new GroupError('گروه‌های بخش معتبر نیستند')
    out[section.id] = [...new Set((value || []) as string[])]
  }
  return out
}

export async function loadSectionAccess(fresh = false): Promise<SectionAccess> {
  const held = g.__mobocomSectionAccess
  if (!fresh && held && Date.now() - held.at < TTL) return held.state
  try {
    const row = await db.setting.findUnique({ where: { key: KEY } })
    const state = normalize(row ? JSON.parse(row.value) : {})
    g.__mobocomSectionAccess = { at: Date.now(), state }
    return state
  } catch (error) {
    // A failed read keeps the limits last seen: it never opens a limited section.
    if (held) return held.state
    throw error
  }
}

const history = () => createSectionSettingsHistory(KEY, 'settings-section-access', normalize, state => ({ limited: Object.entries(state).filter(([, keys]) => keys?.length).map(([section]) => section) }), { action: 'user-group.sections', targetId: KEY })
export const sectionAccessSettingsState = () => history().current()
export async function restoreSectionAccessSettings(...args: Parameters<ReturnType<typeof history>['restore']>) {
  const result = await history().restore(...args)
  delete g.__mobocomSectionAccess
  return result
}

export async function saveSectionAccess(input: unknown, context?: SectionSettingsContext) {
  normalize(input) // Validate supplied fields without expanding omissions into public access.
  const state = await history().save(input, context)
  g.__mobocomSectionAccess = { at: Date.now(), state }
}

/** What a section says to a visitor. `who` is asked only when the section is limited. */
export async function sectionLock(section: MaintenanceSectionId, who: () => Promise<(Pick<ViewerAccount, 'id' | 'role'> & { roleId?: number | null; permissions: readonly string[] | null }) | null>): Promise<SectionLock> {
  const keys = (await loadSectionAccess())[section]
  if (!keys?.length) return 'open'
  const account = await who()
  if (!account) return 'login'
  if (runsSection({ role: account.role, roleId: account.roleId ?? null, permissions: account.permissions }, section)) return 'open'
  return (await siteGroupsOf(account.id, keys)).length ? 'open' : 'refused'
}

export const userOpensSection = async (section: MaintenanceSectionId, userId: number | null | undefined) => await sectionLock(section, async () => (userId ? accountOf(userId) : null)) === 'open'
