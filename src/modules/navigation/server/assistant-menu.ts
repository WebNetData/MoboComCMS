import { randomUUID } from 'node:crypto'
import { ICON_NAMES } from '@/shared/icons'
import { validateMenu, safeHref } from '@/modules/site/config/validation'
import type { SiteLink } from '@/modules/site/config/types'
import type { SiteConfig } from '@/modules/site/config/types'
import type { Prisma } from '@prisma/client'
import type { NextRequest } from 'next/server'
import { createHash } from 'node:crypto'
import { updateJsonSetting, JsonSettingMutationError } from '@/modules/settings/server'
import { getSiteConfigFrom, SITE_KEY } from '@/modules/site/config/store'
import { validateSite } from '@/modules/site/config/validation'
import { requirePerm } from '@/modules/identity/server/access'
import { recordRevision } from '@/modules/content/server/revisions'
import { siteSettingsSnapshot } from '@/modules/site/config/history'
import { auditAdminStrict } from '@/platform/audit/server'

export const siteMenuRevision = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')

/** Shared site configuration writer: the exact stored aggregate is claimed by Settings. */
export async function updateSiteConfiguration(req: NextRequest, expected: string | undefined, change: (current: SiteConfig) => SiteConfig, beforeCommit?: (tx: Prisma.TransactionClient, next: SiteConfig, current: SiteConfig) => Promise<void>) {
  return updateJsonSetting(SITE_KEY, async (stored, tx) => {
    const actor = await requirePerm(req, 'settings.manage', tx)
    if (!actor) throw new JsonSettingMutationError('forbidden')
    const current = await getSiteConfigFrom(tx, true)
    if (expected !== undefined && expected !== siteMenuRevision(current)) throw new JsonSettingMutationError('stale')
    const next = change(current)
    if (!validateSite(next)) throw new JsonSettingMutationError('invalid site')
    Object.keys(stored).forEach(key => delete stored[key])
    Object.assign(stored, next)
    await recordRevision({ entityType: 'settings-site', entityId: 1, before: siteSettingsSnapshot(current), after: siteSettingsSnapshot(next), actor, client: tx, strict: true })
    await auditAdminStrict({ req, actor, action: 'site.update', targetType: 'setting', targetId: SITE_KEY }, tx)
    await beforeCommit?.(tx, next, current)
    return next
  })
}

export type MenuChange = { id?: string; label: string; href: string; icon: string; enabled?: boolean; children?: MenuChange[] }

/** Only public internal paths and ordinary HTTPS links can be introduced by the assistant. */
export function assistantMenuHref(href: string): boolean {
  if (!safeHref(href) || !/^(?:\/(?!\/)|https:\/\/)/.test(href)) return false
  try {
    const url = new URL(href, 'https://menu.invalid')
    if (url.username || url.password || url.protocol !== 'https:') return false
    let path = url.pathname
    for (let i = 0; i < 3; i++) { const decoded = decodeURIComponent(path); if (decoded === path) break; path = decoded }
    if (/[\\\u0000-\u001f]/.test(path) || /^\/\//.test(path)) return false
    return !/^\/(?:admin|api)(?:\/|$)/i.test(path)
  } catch { return false }
}

/** Patch only existing siblings by stable id; omitted branches and metadata stay untouched. */
export function patchAssistantMenu(existing: SiteLink[], changes: MenuChange[]): SiteLink[] {
  let count = 0
  const seen = new Set<string>()
  const apply = (siblings: SiteLink[], patches: MenuChange[], depth: number): SiteLink[] => {
    if (!Array.isArray(patches) || depth > 4) throw new Error('invalid menu patch depth')
    const result = [...siblings]
    for (const patch of patches) {
      if (++count > 20 || !patch || typeof patch !== 'object' || typeof patch.label !== 'string' || !patch.label.trim() || patch.label.length > 160 || typeof patch.href !== 'string' || !assistantMenuHref(patch.href) || typeof patch.icon !== 'string' || (patch.icon !== '' && !ICON_NAMES.includes(patch.icon)) || (patch.enabled !== undefined && typeof patch.enabled !== 'boolean')) throw new Error('invalid menu patch')
      if (patch.id !== undefined && (typeof patch.id !== 'string' || seen.has(patch.id))) throw new Error('duplicate or invalid menu id')
      if (patch.id) seen.add(patch.id)
      const index = patch.id === undefined ? -1 : result.findIndex(item => item.id === patch.id)
      if (patch.id !== undefined && index < 0) throw new Error('unknown menu id')
      const old = index < 0 ? undefined : result[index]
      const next: SiteLink = { ...old, id: old?.id ?? randomUUID(), label: { ...(old?.label ?? { en: '' }), fa: patch.label }, href: patch.href, icon: patch.icon, ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}), ...(patch.children !== undefined ? { children: apply(old?.children ?? [], patch.children, depth + 1) } : {}) }
      if (index < 0) result.push(next); else result[index] = next
    }
    return result
  }
  const next = apply(existing, changes, 1)
  if (!validateMenu(next)) throw new Error('invalid resulting menu')
  return next
}
