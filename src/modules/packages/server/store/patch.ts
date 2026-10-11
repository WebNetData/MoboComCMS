import { auditAdminStrict, type AdminAuditInput } from '@/platform/audit/server'
import { requirePerm } from '@/modules/identity/server/access'
import { PackageError } from '@/modules/packages/domain/format'
import { loadPackageFrom, mustLoad, packageTransaction, savePackage, writeIndex } from './persistence'
import { applyEnabled, applySettings } from './fields'
import { syncSiteTheme } from './themes'

export type PackagePatch = { enabled?: boolean; settings?: Record<string, unknown>; activate?: true }
export class PackageAuthorityError extends Error {
  constructor() { super('forbidden'); this.name = 'PackageAuthorityError' }
}

/** A combined Admin command has one commit, including all its canonical audit entries. */
export async function patchPackage(id: string, input: PackagePatch, context: Pick<AdminAuditInput, 'req' | 'actor'>) {
  return packageTransaction(async tx => {
    const actor = await requirePerm(context.req, 'settings.manage', tx)
    if (!actor || actor.id !== context.actor.id) throw new PackageAuthorityError()
    const pkg = mustLoad(await loadPackageFrom(id, tx, true), id)
    if (input.enabled !== undefined) applyEnabled(pkg, input.enabled)
    if (input.settings !== undefined) applySettings(pkg, input.settings)
    if (input.activate) {
      if (pkg.manifest.kind !== 'theme') throw new PackageError('only theme packages can be activated as the site theme')
      await syncSiteTheme(tx, pkg.manifest, { activate: true })
    }
    if (input.enabled !== undefined || input.settings !== undefined) {
      pkg.updatedAt = new Date().toISOString()
      await savePackage(tx, pkg)
    } else if (input.activate) await writeIndex(tx, () => {})

    const audit = (action: string, metadata: Record<string, unknown> = {}) => auditAdminStrict({
      req: context.req, actor, action: `package.${action}`, targetType: 'package', targetId: id, metadata,
    }, tx)
    if (input.enabled !== undefined) await audit(input.enabled ? 'enable' : 'disable')
    if (input.settings !== undefined) await audit('settings', { keys: Object.keys(input.settings) })
    if (input.activate) await audit('activate-theme')
    return pkg
  })
}
