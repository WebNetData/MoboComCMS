import { db } from '@/platform/database/prisma'
import { extensionCatalog } from '@/extensions/generated/catalog'
import { codeThemeCatalog } from '@/themes/generated/catalog'
import { bundledThemes } from '@/themes/registry'
import { getSiteConfig, SITE_KEY } from '@/modules/site/config/store'
import { validateSite } from '@/modules/site/config/validation'
import type { ThemeManifest } from '@/modules/site/config/types'
import { readZip, writeZip, ZipError } from '@/modules/packages/domain/zip'
import {
  PACKAGE_LIMITS, PackageError, isEditable, isTextFile, normalizeEntries, parseManifest, validPackagePath,
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

const rowKey = (id: string) => `package.${id}.v1`
const INDEX_KEY = 'packages.index.v1'
interface PackageIndex { ids: string[]; rev: number }

async function readIndex(): Promise<PackageIndex> {
  const row = await db.setting.findUnique({ where: { key: INDEX_KEY } })
  try {
    const value = row ? JSON.parse(row.value) : null
    if (value && Array.isArray(value.ids) && Number.isInteger(value.rev)) return { ids: value.ids.filter((id: unknown) => typeof id === 'string'), rev: value.rev }
  } catch { /* A damaged index is rebuilt from the package rows. */ }
  const rows = await db.setting.findMany({ where: { key: { startsWith: 'package.' } }, select: { key: true } })
  return { ids: rows.map(item => /^package\.([a-z0-9-]+)\.v1$/.exec(item.key)?.[1]).filter((id): id is string => !!id), rev: 0 }
}
async function writeIndex(mutate: (ids: Set<string>) => void) {
  const index = await readIndex()
  const ids = new Set(index.ids)
  mutate(ids)
  const value = JSON.stringify({ ids: [...ids].sort(), rev: index.rev + 1 })
  await db.setting.upsert({ where: { key: INDEX_KEY }, create: { key: INDEX_KEY, value }, update: { value } })
}
export async function packageRevision() { return (await readIndex()).rev }
export async function packageIds() { return (await readIndex()).ids }

export async function loadPackage(id: string): Promise<StoredPackage | null> {
  if (!/^[a-z][a-z0-9-]{1,49}$/.test(id)) return null
  const row = await db.setting.findUnique({ where: { key: rowKey(id) } })
  if (!row) return null
  try { return JSON.parse(row.value) as StoredPackage } catch { return null }
}
/** History keeps at most ~2 MB of old file bodies; older entries stay listed but can no longer be restored. */
function trimRevisions(revisions: PackageRevision[]) {
  let budget = 2 * 1024 * 1024
  return revisions.slice(0, PACKAGE_LIMITS.maxRevisions).map(revision => {
    if (revision.content === null) return revision
    budget -= revision.content.length
    return budget >= 0 ? revision : { ...revision, content: null, path: '*', note: `${revision.note} (${revision.path}, history trimmed)` }
  })
}
async function savePackage(pkg: StoredPackage) {
  pkg.revisions = trimRevisions(pkg.revisions)
  const value = JSON.stringify(pkg)
  await db.setting.upsert({ where: { key: rowKey(pkg.manifest.id) }, create: { key: rowKey(pkg.manifest.id), value }, update: { value } })
  await writeIndex(ids => ids.add(pkg.manifest.id))
}
function mustLoad(pkg: StoredPackage | null, id: string): StoredPackage {
  if (!pkg) throw new PackageError(`package "${id}" is not installed`)
  return pkg
}

const fileBytes = (file: StoredFile) => file.text !== undefined ? Buffer.byteLength(file.text) : Math.floor((file.base64?.length || 0) * 3 / 4)
const totalBytes = (files: Record<string, StoredFile>) => Object.values(files).reduce((sum, file) => sum + fileBytes(file), 0)
export function fileText(pkg: StoredPackage, path: string) { return pkg.files[path]?.text ?? null }
export function fileBuffer(pkg: StoredPackage, path: string) {
  const file = pkg.files[path]
  if (!file) return null
  return file.text !== undefined ? Buffer.from(file.text, 'utf8') : Buffer.from(file.base64 || '', 'base64')
}

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

function manifestFrom(files: Record<string, StoredFile>): PackageManifest {
  const source = files['manifest.json']?.text
  if (source === undefined) throw new PackageError('manifest.json is missing')
  let raw: unknown
  try { raw = JSON.parse(source) } catch (error) { throw new PackageError(`manifest.json is not valid JSON: ${error instanceof Error ? error.message : ''}`) }
  return parseManifest(raw, new Set(Object.keys(files)))
}

function settingDefaults(manifest: PackageManifest, current: Record<string, string> = {}) {
  return Object.fromEntries((manifest.settings || []).map(setting => [setting.key, current[setting.key] ?? setting.default ?? '']))
}

// ---- theme packages appear in Site Studio as JSON themes ----------------------

function themeEntry(manifest: PackageManifest): ThemeManifest {
  const design = manifest.design!
  return {
    id: manifest.id, name: manifest.name.slice(0, 80), description: (manifest.description || '').slice(0, 300), version: manifest.version.slice(0, 30),
    extends: design.extends || 'clean', radius: design.radius, colors: design.colors, ...(design.lightColors ? { lightColors: design.lightColors } : {}),
  }
}
// getSiteConfig is request-cached, so every change to the site document happens in one read-modify-write.
async function syncSiteTheme(manifest: PackageManifest | null, options: { removeId?: string; activate?: boolean } = {}) {
  const site = structuredClone(await getSiteConfig())
  const id = manifest?.id || options.removeId!
  const others = site.themes.filter(theme => theme.id !== id)
  site.themes = manifest ? [...others, themeEntry(manifest)] : others
  if (!manifest && site.themeId === id) site.themeId = 'clean'
  if (manifest && options.activate) site.themeId = id
  if (site.themes.length > 20) throw new PackageError('Site Studio already holds 20 custom themes; remove one first')
  if (!validateSite(site)) throw new PackageError('the theme design could not be added to Site Studio')
  await db.setting.upsert({ where: { key: SITE_KEY }, create: { key: SITE_KEY, value: JSON.stringify(site) }, update: { value: JSON.stringify(site) } })
}
export async function activateTheme(id: string) {
  const pkg = mustLoad(await loadPackage(id), id)
  if (pkg.manifest.kind !== 'theme') throw new PackageError('only theme packages can be activated as the site theme')
  await syncSiteTheme(pkg.manifest, { activate: true })
  await writeIndex(() => {})
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
  const previous = await loadPackage(manifest.id)
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
  if (manifest.kind === 'theme' && manifest.runtime === 'declarative') await syncSiteTheme(manifest)
  await savePackage(pkg)
  return { pkg, upgraded: !!previous }
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
  const pkg = mustLoad(await loadPackage(id), id)
  if (pkg.manifest.runtime === 'code') throw new PackageError('code packages are switched on in the extension list once their build is deployed')
  pkg.enabled = enabled
  pkg.updatedAt = new Date().toISOString()
  await savePackage(pkg)
  return pkg
}

export async function savePackageSettings(id: string, input: Record<string, unknown>) {
  const pkg = mustLoad(await loadPackage(id), id)
  const definitions = new Map((pkg.manifest.settings || []).map(setting => [setting.key, setting]))
  for (const [key, value] of Object.entries(input)) {
    const definition = definitions.get(key)
    if (!definition) throw new PackageError(`unknown setting "${key}"`)
    if (typeof value !== 'string' || value.length > (definition.type === 'textarea' ? 8000 : 1000)) throw new PackageError(`setting "${key}" is invalid`)
    pkg.settings[key] = value
  }
  pkg.updatedAt = new Date().toISOString()
  await savePackage(pkg)
  return pkg
}

export async function deletePackage(id: string) {
  const pkg = mustLoad(await loadPackage(id), id)
  // Code packages never entered Site Studio; applied source stays in the repository.
  if (pkg.manifest.kind === 'theme' && pkg.manifest.runtime === 'declarative') await syncSiteTheme(null, { removeId: id })
  await db.setting.deleteMany({ where: { key: rowKey(id) } })
  await writeIndex(ids => ids.delete(id))
}

export async function exportPackage(id: string) {
  const pkg = mustLoad(await loadPackage(id), id)
  const files = new Map(Object.keys(pkg.files).sort().map(path => [path, fileBuffer(pkg, path)!]))
  return { filename: `${pkg.manifest.id}-${pkg.manifest.version}.zip`, data: writeZip(files) }
}

// ---- editor ------------------------------------------------------------------

/** Create or change one text file; manifest edits are validated before they are saved. */
export async function writePackageFile(id: string, path: string, content: string, actor: string) {
  const pkg = mustLoad(await loadPackage(id), id)
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
  if (manifest.kind === 'theme' && manifest.runtime === 'declarative') await syncSiteTheme(manifest)
  await savePackage(pkg)
  return pkg
}

export async function deletePackageFile(id: string, path: string, actor: string) {
  const pkg = mustLoad(await loadPackage(id), id)
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
  await savePackage(pkg)
  return pkg
}

/** Put a file back to how it was before revision `index` (0 = most recent). */
export async function restoreRevision(id: string, index: number, actor: string) {
  const pkg = mustLoad(await loadPackage(id), id)
  const revision = pkg.revisions[index]
  if (!revision || revision.path === '*') throw new PackageError('this revision cannot be restored')
  if (revision.content === null) return deletePackageFile(id, revision.path, actor)
  return writePackageFile(id, revision.path, revision.content, actor)
}

export async function markCodeApplied(id: string, actor: string, note: string) {
  const pkg = mustLoad(await loadPackage(id), id)
  pkg.codeStatus = 'applied'
  pkg.updatedAt = new Date().toISOString()
  pkg.revisions = [{ at: pkg.updatedAt, path: '*', content: null, actor, note }, ...pkg.revisions]
  await savePackage(pkg)
  return pkg
}
