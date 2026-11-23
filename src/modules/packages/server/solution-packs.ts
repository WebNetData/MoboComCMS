import { createHash } from 'node:crypto'
import { extensionById, extensionCatalog } from '@/extensions/generated/catalog'
import { getExtensionState, planExtensionDefaults, saveExtensionState } from '@/extensions/server/state'
import { compatibilityIssue, satisfiesCompatibilityRange } from '@/platform/extensions/compatibility'
import { coreVersion } from '@/platform/extensions/version'
import { auditAdminStrict } from '@/platform/audit/server'
import { PackageError, parseManifest } from '@/modules/packages/domain/format'
import { assertPackageIdle } from '@/modules/packages/domain/apply-operation'
import type { SolutionPlan } from '@/modules/packages/domain/solution-plan'
import type { SolutionPackModule } from '@/modules/packages/domain/solution-pack'
import type { StoredPackage } from './store'
import { assertStoredPackageCompatibility } from './compatibility'
import { loadPackageFrom, mustLoad, packageTransaction, savePackage } from './store/persistence'
import { packageCommandActor, auditPackageCommand, type PackageCommandContext } from './store/authority'
import type { Prisma } from '@prisma/client'
import { invalidate } from '@/platform/cache/kv'
import { compositionAuthority, planComposition, applyComposition } from './solution-composition'

export class SolutionPlanConflict extends PackageError {}
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')

function artifactFingerprint(pkg: StoredPackage) {
  return hash({ manifest: pkg.manifest, files: Object.entries(pkg.files).sort(([a], [b]) => a.localeCompare(b)) })
}

/** Resolve only declared targets. Disabled undeclared dependencies are never silently enabled. */
async function orderedTargets(targets: SolutionPackModule[], tx: Prisma.TransactionClient) {
  const declared = new Map(targets.map(target => [target.id, target]))
  const seen = new Set<string>(), visiting = new Set<string>(), ordered: SolutionPackModule[] = []
  const visit = async (target: SolutionPackModule) => {
    if (seen.has(target.id)) return
    if (visiting.has(target.id)) throw new PackageError('وابستگی‌های بسته چرخه دارند.')
    const manifest = extensionById.get(target.id)
    if (!manifest) throw new PackageError(`ماژول «${target.id}» در این نسخه نصب نیست.`)
    const issue = compatibilityIssue(manifest, extensionCatalog, coreVersion)
    if (issue) throw new PackageError(issue)
    if (target.version && !satisfiesCompatibilityRange(target.version, manifest.version)) throw new PackageError(`نسخهٔ ماژول «${target.id}» با بسته سازگار نیست.`)
    visiting.add(target.id)
    for (const id of manifest.requires || []) {
      const dependency = declared.get(id)
      if (dependency) await visit(dependency)
      else if (!extensionById.has(id) || !(await getExtensionState(id, [], tx, true)).enabled) throw new PackageError(`وابستگی «${id}» غیرفعال است؛ آن را بررسی یا صریحاً به بسته اضافه کنید.`)
    }
    visiting.delete(target.id); seen.add(target.id); ordered.push(target)
  }
  for (const target of targets) await visit(target)
  return ordered
}

async function buildPlan(pkg: StoredPackage, tx: Prisma.TransactionClient, context: PackageCommandContext) {
  assertPackageIdle(pkg)
  const manifest = parseManifest(pkg.manifest, new Set(Object.keys(pkg.files)))
  if (!manifest.solutionPack) throw new PackageError('این بسته، Solution Pack نیست.')
  await compositionAuthority(manifest.solutionPack, context, tx)
  const fingerprint = artifactFingerprint(pkg)
  // A provisioning receipt is historical, not a demand to restore yesterday's configuration.
  if (pkg.solutionApply?.fingerprint === fingerprint) return {
    fingerprint,
    plan: { packageId: manifest.id, name: manifest.name, version: manifest.version,
      token: hash({ fingerprint, appliedAt: pkg.solutionApply.appliedAt }), applied: true,
      modules: [], recommendations: manifest.solutionPack.recommendations || [], receipt: pkg.solutionApply } satisfies SolutionPlan,
  }
  await assertStoredPackageCompatibility(pkg, tx)
  const targets = await orderedTargets(manifest.solutionPack.modules, tx)
  const modules: SolutionPlan['modules'] = []
  for (const target of targets) {
    try {
      const before = await getExtensionState(target.id, [], tx, true)
      const defaults = await planExtensionDefaults(target.id, target.defaults || {}, tx)
      modules.push({ id: target.id, name: extensionById.get(target.id)!.name, enabled: before.enabled, ...defaults })
    } catch (error) { throw new PackageError(error instanceof Error ? error.message : 'تنظیمات بسته معتبر نیست.') }
  }
  // Hash raw snapshots, never expose their values (which may contain unrelated secrets).
  const keys = ['site.config.v1', ...extensionCatalog.flatMap(item => [`extension.${item.id}.state.v1`, ...(item.stateSetting ? [item.stateSetting] : [])])]
  const snapshot = await tx.setting.findMany({ where: { key: { in: keys } }, select: { key: true, value: true }, orderBy: { key: 'asc' } })
  const { composition, revisions } = await planComposition(manifest.solutionPack, pkg.solutionApply?.composition, context, tx)
  const plan: SolutionPlan = {
    packageId: manifest.id, name: manifest.name, version: manifest.version,
    token: hash({ fingerprint, updatedAt: pkg.updatedAt, snapshot, catalog: extensionCatalog, coreVersion, revisions }),
    applied: pkg.solutionApply?.fingerprint === fingerprint,
    modules, recommendations: manifest.solutionPack.recommendations || [],
    ...(composition ? { composition } : {}),
    ...(pkg.solutionApply ? { receipt: pkg.solutionApply } : {}),
  }
  return { plan, fingerprint }
}

export async function previewSolutionPack(id: string, context: PackageCommandContext) {
  return packageTransaction(async tx => {
    await packageCommandActor(context, tx)
    const pkg = mustLoad(await loadPackageFrom(id, tx, true), id)
    return (await buildPlan(pkg, tx, context)).plan
  })
}

/** All settings, mirrors, receipt, index invalidation and Audit commit together. */
export async function applySolutionPack(id: string, token: string, context: PackageCommandContext) {
  if (!/^[0-9a-f]{64}$/.test(token)) throw new PackageError('ابتدا پیش‌نمایش معتبر بسته را دریافت کنید.')
  const result = await packageTransaction(async tx => {
    const actor = await packageCommandActor(context, tx)
    if (!actor) throw new PackageError('دسترسی مدیریت لازم است.')
    const pkg = mustLoad(await loadPackageFrom(id, tx, true), id)
    const { plan, fingerprint } = await buildPlan(pkg, tx, context)
    if (plan.applied) return { receipt: pkg.solutionApply!, alreadyApplied: true, siteChanged: false }
    if (plan.token !== token) throw new SolutionPlanConflict('بسته یا تنظیمات تغییر کرده است؛ پیش‌نمایش را دوباره بررسی کنید.')
    const defaultKeys: string[] = []
    for (const target of plan.modules) {
      const keys = Object.keys(target.defaults)
      defaultKeys.push(...keys.map(key => `${target.id}.${key}`))
      if (target.enabled && !keys.length) continue
      await saveExtensionState(target.id, { enabled: true, settings: target.defaults }, { transaction: tx, beforeCommit: async (_client, before, after) => {
        await auditAdminStrict({ req: context.req, actor, action: 'extensions.configure', targetType: 'extension', targetId: target.id, metadata: { packageId: id, beforeEnabled: before.enabled, requestedEnabled: after.enabled, settingKeys: keys } }, tx)
      } })
    }
    const { receipt: composition, siteChanged } = await applyComposition(pkg.manifest.solutionPack!, pkg.solutionApply?.composition, context, tx)
    await packageCommandActor(context, tx)
    await compositionAuthority(pkg.manifest.solutionPack!, context, tx)
    pkg.solutionApply = { fingerprint, appliedAt: new Date().toISOString(), actorId: actor.id, modules: plan.modules.map(target => target.id), defaultKeys, ...(composition ? { composition } : {}) }
    pkg.updatedAt = pkg.solutionApply.appliedAt
    await savePackage(tx, pkg)
    await auditPackageCommand(tx, context, actor, 'solution.apply', id, { fingerprint, modules: pkg.solutionApply.modules, defaultKeys, ...(composition ? { composition } : {}) })
    return { receipt: pkg.solutionApply, alreadyApplied: false, siteChanged }
  })
  if (result.siteChanged) await invalidate('settings:').catch(() => {})
  return { receipt: result.receipt, alreadyApplied: result.alreadyApplied }
}
