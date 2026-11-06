import type { NextRequest } from 'next/server'
import { requirePerm } from '@/modules/identity/server/access'
import { updateJsonSetting, JsonSettingMutationError } from '@/modules/settings/server'
import { auditAdminStrict } from '@/platform/audit/server'
import { recordRevision } from '@/modules/content/server/revisions'
import { getSiteConfigFrom, SITE_KEY } from '../config/store'
import { siteSettingsSnapshot } from '../config/history'
import { validateSite } from '../config/validation'
import { createHash } from 'node:crypto'

export const siteRevision = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const fields = ['brand', 'tagline', 'copyright', 'logo', 'wordmark', 'wordmarkDark', 'wordmarkHeight', 'identity']
/** Identity is a sparse part of the same canonical SiteConfig, never a replacement settings document. */
export async function patchSiteIdentity(req: NextRequest, changes: unknown) {
  if (!changes || typeof changes !== 'object' || Array.isArray(changes) || Object.keys(changes).some(k => !fields.includes(k))) throw new JsonSettingMutationError('invalid identity fields')
  const expected = req.headers.get('if-match')
  if (!expected) throw new JsonSettingMutationError('identity revision is required')
  return updateJsonSetting(SITE_KEY, async (stored, tx) => {
    const actor = await requirePerm(req, 'settings.manage', tx)
    if (!actor) throw new JsonSettingMutationError('forbidden')
    const current = await getSiteConfigFrom(tx, true)
    if (siteRevision(current) !== expected) throw new JsonSettingMutationError('stale')
    const next = { ...current, ...changes }
    if (!validateSite(next)) throw new JsonSettingMutationError('invalid identity')
    Object.assign(stored, next)
    await recordRevision({ entityType: 'settings-site', entityId: 1, before: siteSettingsSnapshot(current), after: siteSettingsSnapshot(next), actor, client: tx, strict: true })
    await auditAdminStrict({ req, actor, action: 'site.identity.update', targetType: 'setting', targetId: SITE_KEY }, tx)
    return { config: next, revision: siteRevision(next) }
  })
}
