import type { Prisma } from '@prisma/client'
import { extensionCatalog } from '@/extensions/generated/catalog'
import { assertUniqueExtensionIds, assertValidExtensionManifest, type ExtensionManifest } from '@/platform/extensions/contracts'
import { compatibilityIssue } from '@/platform/extensions/compatibility'
import { coreVersion } from '@/platform/extensions/version'
import { PackageError, PackageCompatibilityError, parseManifest, type PackageManifest } from '@/modules/packages/domain/format'
import type { ExtensionPublicState } from '@/platform/extensions/contracts'

export function publicPackageCompatible(pkg: { manifest: PackageManifest; files: Record<string, unknown> }, runtime: Readonly<Record<string, ExtensionPublicState>>) {
  try {
    const manifest = parseManifest(pkg.manifest, new Set(Object.keys(pkg.files)))
    return !compatibilityIssue(manifest, extensionCatalog, coreVersion) && (manifest.requires || []).every(id => runtime[id]?.enabled === true)
  } catch (error) { if (error instanceof PackageError) return false; throw error }
}

export async function assertPackageCompatibility(manifest: PackageManifest, reader?: Pick<Prisma.TransactionClient, 'setting'>, activating = false) {
  const issue = compatibilityIssue(manifest, extensionCatalog, coreVersion)
  if (issue) throw new PackageCompatibilityError(issue)
  if (manifest.runtime === 'code') {
    try { assertValidExtensionManifest(manifest as unknown as ExtensionManifest) }
    catch (error) { throw new PackageError(error instanceof Error ? error.message : 'invalid extension contract') }
  }
  if (manifest.runtime === 'code' && manifest.kind === 'plugin') {
    try { assertUniqueExtensionIds([...extensionCatalog.filter(item => item.id !== manifest.id), manifest as unknown as ExtensionManifest]) }
    catch (error) { throw new PackageError(error instanceof Error ? error.message : 'invalid extension contract') }
  }
  if (activating && manifest.requires?.length) {
    const { getExtensionState } = await import('@/extensions/server/state')
    for (const dependency of manifest.requires) {
    if (!(await getExtensionState(dependency, [], reader, true)).enabled) throw new PackageCompatibilityError(`ابتدا ماژول «${dependency}» را فعال کنید`)
    }
  }
}

/** Stored manifests from previous releases must pass the same current parser. */
export async function assertStoredPackageCompatibility(pkg: { manifest: PackageManifest; files: Record<string, unknown> }, reader?: Pick<Prisma.TransactionClient, 'setting'>, activating = false) {
  const manifest = parseManifest(pkg.manifest, new Set(Object.keys(pkg.files)))
  await assertPackageCompatibility(manifest, reader, activating)
}
