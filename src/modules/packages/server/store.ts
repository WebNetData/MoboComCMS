import { extensionCatalog } from '@/extensions/generated/catalog'
import { codeThemeCatalog } from '@/themes/generated/catalog'
import { bundledThemes } from '@/themes/registry'
import { getSiteConfig } from '@/modules/site/config/store'
import { readZip, writeZip, ZipError } from '@/modules/packages/domain/zip'
import {
  PACKAGE_LIMITS, PackageError, isEditable, isTextFile, normalizeEntries, validPackagePath,
  type PackageManifest,
} from '@/modules/packages/domain/format'

// Uploaded packages live in namespaced Setting rows, like extension state:
//   package.<id>.v1     → manifest, files, activation, settings, revisions
//   packages.index.v1   → installed ids + a revision counter that lets the
//                          public runtime cache rendered output between edits.

export interface StoredFile { text?: string; base64?: string }
export interface PackageRevision { at: string; path: string; content: string | null; actor: string; note: string }
export interface StoredPackage {
  manifest: PackageManifest
  files: Record<string, StoredFile>
  enabled: boolean
  settings: Record<string, string>
  installedAt: string
  updatedAt: string
  revisions: PackageRevision[]
  /** Code packages: 'staged' until applied to the source tree and rebuilt. */
  codeStatus?: 'staged' | 'applied'
}
export interface PackageSummary {
  id: string
  manifest: PackageManifest
  enabled: boolean
  settings: Record<string, string>
  files: { path: string; bytes: number; editable: boolean }[]
  bytes: number
  installedAt: string
  updatedAt: string
  revisions: number
  codeStatus?: StoredPackage['codeStatus']
  active?: boolean
}

export { fileText, fileBuffer } from './store/files'
import { fileBytes, fileBuffer, manifestFrom, settingDefaults, totalBytes } from './store/files'
import { loadPackageFrom, mustLoad, packageTransaction, readIndex, rowKey, savePackage, writeIndex } from './store/persistence'
import { syncSiteTheme } from './store/themes'
import { writeFile, deleteFile } from './store/editor'
import { applyEnabled, applySettings } from './store/fields'
export { patchPackage, PackageAuthorityError, type PackagePatch } from './store/patch'

export async function packageRevision() { return (await readIndex()).rev }
export async function packageIds() { return (await readIndex()).ids }
export async function loadPackage(id: string): Promise<StoredPackage | null> { return loadPackageFrom(id) }

function reservedIds() {
  // 'source' and 'editor' are admin route segments next to the package ids.
  return new Set([...extensionCatalog.map(item => item.id), ...bundledThemes.map(theme => theme.id), 'source', 'editor'])
}
/** A code package may carry the id of a built-in plugin/theme of the same kind: applying it edits that source. */
export function builtinKind(id: string): 'plugin' | 'theme' | 'module' | null {
  const extension = extensionCatalog.find(item => item.id === id)
  if (extension) return extension.kind === 'module' ? 'module' : 'plugin'
  return codeThemeCatalog.some(theme => theme.id === id) ? 'theme' : null
}

export async function activateTheme(id: string) {
  return packageTransaction(async tx => {
    const pkg = mustLoad(await loadPackageFrom(id, tx, true), id)
    if (pkg.manifest.kind !== 'theme') throw new PackageError('only theme packages can be activated as the site theme')
    await syncSiteTheme(tx, pkg.manifest, { activate: true })
    await writeIndex(tx, () => {})
  })
}

// ---- install / update ----------------------------------------------------------

export async function installPackage(upload: Buffer, actor: string): Promise<{ pkg: StoredPackage; upgraded: boolean }> {
  if (upload.length > PACKAGE_LIMITS.uploadBytes) throw new PackageError(`the file is larger than ${PACKAGE_LIMITS.uploadBytes / 1024 / 1024} MB`)
  let entries: Map<string, Buffer>
  try { entries = normalizeEntries(readZip(upload, PACKAGE_LIMITS)) } catch (error) { throw new PackageError(error instanceof ZipError ? error.message : 'the file is not a valid zip archive') }
  return installEntries(entries, actor)
}

export async function installEntries(entries: Map<string, Buffer>, actor: string, note?: string): Promise<{ pkg: StoredPackage; upgraded: boolean }> {
  if (entries.size > PACKAGE_LIMITS.maxEntries || [...entries.values()].reduce((sum, data) => sum + data.length, 0) > PACKAGE_LIMITS.maxTotalBytes) throw new PackageError('the package is too large')
  const manifestSource = entries.get('manifest.json')
  if (!manifestSource) throw new PackageError('manifest.json was not found at the root of the zip')
  let runtimeHint: unknown
  try { runtimeHint = JSON.parse(manifestSource.toString('utf8'))?.runtime } catch { /* reported by manifestFrom */ }
  const files: Record<string, StoredFile> = {}
  for (const [path, data] of entries) {
    if (!validPackagePath(path, runtimeHint === 'code' ? 'code' : 'declarative')) throw new PackageError(`"${path}" is not an allowed file (name or type)`)
    if (isTextFile(path)) {
      const text = data.toString('utf8')
      if (text.length > PACKAGE_LIMITS.maxTextFileChars) throw new PackageError(`"${path}" is too long`)
      files[path] = { text }
    } else files[path] = { base64: data.toString('base64') }
  }
  const manifest = manifestFrom(files)
  const builtin = builtinKind(manifest.id)
  const overridesBuiltin = manifest.runtime === 'code' && builtin === manifest.kind
  if (reservedIds().has(manifest.id) && !overridesBuiltin) throw new PackageError(`"${manifest.id}" is the id of a built-in extension or theme; choose another id`)
  return packageTransaction(async tx => {
    const previous = await loadPackageFrom(manifest.id, tx, true)
    if (previous && previous.manifest.kind !== manifest.kind) throw new PackageError(`"${manifest.id}" is already installed as a ${previous.manifest.kind}`)
    const now = new Date().toISOString()
    const revisions: PackageRevision[] = previous
      ? [{ at: now, path: '*', content: null, actor, note: note || `upgrade ${previous.manifest.version} → ${manifest.version}` }, ...previous.revisions].slice(0, PACKAGE_LIMITS.maxRevisions)
      : [{ at: now, path: '*', content: null, actor, note: note || `install ${manifest.version}` }]
    const pkg: StoredPackage = {
      manifest, files,
      enabled: manifest.runtime === 'code' ? false : previous?.enabled ?? false,
      settings: settingDefaults(manifest, previous?.settings),
      installedAt: previous?.installedAt || now, updatedAt: now, revisions,
      ...(manifest.runtime === 'code' ? { codeStatus: 'staged' as const } : {}),
    }
    if (manifest.kind === 'theme' && manifest.runtime === 'declarative') await syncSiteTheme(tx, manifest)
    await savePackage(tx, pkg)
    return { pkg, upgraded: !!previous }
  })
}

export async function listPackages(): Promise<PackageSummary[]> {
  const [ids, site] = await Promise.all([packageIds(), getSiteConfig()])
  const result: PackageSummary[] = []
  for (const id of ids) {
    const pkg = await loadPackage(id)
    if (pkg) result.push(summarize(pkg, site.themeId))
  }
  return result.sort((a, b) => a.manifest.name.localeCompare(b.manifest.name))
}
export function summarize(pkg: StoredPackage, activeThemeId?: string): PackageSummary {
  return {
    id: pkg.manifest.id, manifest: pkg.manifest, enabled: pkg.enabled, settings: pkg.settings,
    files: Object.entries(pkg.files).map(([path, file]) => ({ path, bytes: fileBytes(file), editable: isEditable(path) })).sort((a, b) => a.path.localeCompare(b.path)),
    bytes: totalBytes(pkg.files), installedAt: pkg.installedAt, updatedAt: pkg.updatedAt, revisions: pkg.revisions.length,
    ...(pkg.codeStatus ? { codeStatus: pkg.codeStatus } : {}),
    ...(pkg.manifest.kind === 'theme' ? { active: activeThemeId === pkg.manifest.id } : {}),
  }
}

export async function setPackageEnabled(id: string, enabled: boolean) {
  return packageTransaction(async tx => {
    const pkg = mustLoad(await loadPackageFrom(id, tx, true), id)
    applyEnabled(pkg, enabled)
    pkg.updatedAt = new Date().toISOString()
    await savePackage(tx, pkg)
    return pkg
  })
}

export async function savePackageSettings(id: string, input: Record<string, unknown>) {
  return packageTransaction(async tx => {
    const pkg = mustLoad(await loadPackageFrom(id, tx, true), id)
    applySettings(pkg, input)
    pkg.updatedAt = new Date().toISOString()
    await savePackage(tx, pkg)
    return pkg
  })
}

export async function deletePackage(id: string) {
  return packageTransaction(async tx => {
    const pkg = mustLoad(await loadPackageFrom(id, tx, true), id)
    // Code packages never entered Site Studio; applied source stays in the repository.
    if (pkg.manifest.kind === 'theme' && pkg.manifest.runtime === 'declarative') await syncSiteTheme(tx, null, { removeId: id })
    await tx.setting.deleteMany({ where: { key: rowKey(id) } })
    await writeIndex(tx, ids => ids.delete(id))
  })
}

export async function exportPackage(id: string) {
  const pkg = mustLoad(await loadPackage(id), id)
  const files = new Map(Object.keys(pkg.files).sort().map(path => [path, fileBuffer(pkg, path)!]))
  return { filename: `${pkg.manifest.id}-${pkg.manifest.version}.zip`, data: writeZip(files) }
}

// ---- editor ------------------------------------------------------------------

/** Edit only the selected field of the current aggregate, retaining concurrent edits. */
export async function writePackageFile(id: string, path: string, content: string, actor: string) {
  return packageTransaction(async tx => writeFile(tx, mustLoad(await loadPackageFrom(id, tx, true), id), path, content, actor))
}

export async function deletePackageFile(id: string, path: string, actor: string) {
  return packageTransaction(async tx => deleteFile(tx, mustLoad(await loadPackageFrom(id, tx, true), id), path, actor))
}

/** Keep the originally selected revision; a concurrent prepend must not change the selection. */
export async function restoreRevision(id: string, index: number, actor: string) {
  if (!Number.isInteger(index) || index < 0) throw new PackageError('this revision cannot be restored')
  let selected: string | undefined
  return packageTransaction(async tx => {
    const pkg = mustLoad(await loadPackageFrom(id, tx, true), id), revision = pkg.revisions[index]
    if (!revision || revision.path === '*') throw new PackageError('this revision cannot be restored')
    const fingerprint = JSON.stringify(revision)
    if (selected !== undefined && selected !== fingerprint) throw new PackageError('revision history changed; reload it before restoring')
    selected = fingerprint
    return revision.content === null ? deleteFile(tx, pkg, revision.path, actor) : writeFile(tx, pkg, revision.path, revision.content, actor)
  })
}

export async function markCodeApplied(id: string, actor: string, note: string, applied?: StoredPackage) {
  return packageTransaction(async tx => {
    const pkg = mustLoad(await loadPackageFrom(id, tx, true), id)
    if (pkg.manifest.runtime !== 'code') throw new PackageError('only code packages can be marked applied')
    if (applied && JSON.stringify(pkg.files) !== JSON.stringify(applied.files)) throw new PackageError('package files changed during apply; the current package remains staged')
    pkg.codeStatus = 'applied'
    pkg.updatedAt = new Date().toISOString()
    pkg.revisions = [{ at: pkg.updatedAt, path: '*', content: null, actor, note }, ...pkg.revisions]
    await savePackage(tx, pkg)
    return pkg
  })
}
