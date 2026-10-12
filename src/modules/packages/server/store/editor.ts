import { PACKAGE_LIMITS, PackageError, isEditable, validPackagePath } from '@/modules/packages/domain/format'
import type { StoredPackage } from '../store'
import { savePackage, type PackageReader } from './persistence'
import { manifestFrom, settingDefaults, totalBytes } from './files'
import { syncSiteTheme } from './themes'

/** Create or change one text file; manifest edits are validated before they are saved. */
export async function writeFile(reader: PackageReader, pkg: StoredPackage, path: string, content: string, actor: string) {
  if (!validPackagePath(path, pkg.manifest.runtime) || !isEditable(path)) throw new PackageError(`"${path}" cannot be edited here`)
  if (content.length > PACKAGE_LIMITS.maxTextFileChars) throw new PackageError('the file is too long')
  const previous = pkg.files[path]?.text ?? null
  if (previous === content) return pkg
  const files = { ...pkg.files, [path]: { text: content } }
  if (Object.keys(files).length > PACKAGE_LIMITS.maxEntries || totalBytes(files) > PACKAGE_LIMITS.maxTotalBytes) throw new PackageError('the package would exceed its size limit')
  const manifest = manifestFrom(files)
  if (manifest.id !== pkg.manifest.id) throw new PackageError('the package id cannot be changed in the editor; export and upload a copy instead')
  if (manifest.kind !== pkg.manifest.kind || manifest.runtime !== pkg.manifest.runtime) throw new PackageError('"kind" and "runtime" cannot be changed in the editor')
  pkg.files = files
  pkg.manifest = manifest
  pkg.settings = settingDefaults(manifest, pkg.settings)
  pkg.updatedAt = new Date().toISOString()
  pkg.revisions = [{ at: pkg.updatedAt, path, content: previous, actor, note: previous === null ? 'created' : 'edited' }, ...pkg.revisions].slice(0, PACKAGE_LIMITS.maxRevisions)
  if (pkg.manifest.runtime === 'code') pkg.codeStatus = 'staged'
  if (manifest.kind === 'theme' && manifest.runtime === 'declarative') await syncSiteTheme(reader, manifest)
  await savePackage(reader, pkg)
  return pkg
}

export async function deleteFile(reader: PackageReader, pkg: StoredPackage, path: string, actor: string) {
  if (path === 'manifest.json') throw new PackageError('manifest.json cannot be deleted')
  const file = pkg.files[path]
  if (!file) throw new PackageError(`"${path}" does not exist`)
  const files = { ...pkg.files }
  delete files[path]
  manifestFrom(files) // refuses to drop a file the manifest still references
  pkg.files = files
  pkg.updatedAt = new Date().toISOString()
  pkg.revisions = [{ at: pkg.updatedAt, path, content: file.text ?? null, actor, note: 'deleted' }, ...pkg.revisions].slice(0, PACKAGE_LIMITS.maxRevisions)
  if (pkg.manifest.runtime === 'code') pkg.codeStatus = 'staged'
  await savePackage(reader, pkg)
  return pkg
}
