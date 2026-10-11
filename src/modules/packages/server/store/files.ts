import { PackageError, parseManifest, type PackageManifest } from '@/modules/packages/domain/format'
import type { StoredFile, StoredPackage } from '../store'

export const fileBytes = (file: StoredFile) => file.text !== undefined ? Buffer.byteLength(file.text) : Math.floor((file.base64?.length || 0) * 3 / 4)
export const totalBytes = (files: Record<string, StoredFile>) => Object.values(files).reduce((sum, file) => sum + fileBytes(file), 0)
export function fileText(pkg: StoredPackage, path: string) { return pkg.files[path]?.text ?? null }
export function fileBuffer(pkg: StoredPackage, path: string) {
  const file = pkg.files[path]
  if (!file) return null
  return file.text !== undefined ? Buffer.from(file.text, 'utf8') : Buffer.from(file.base64 || '', 'base64')
}

export function manifestFrom(files: Record<string, StoredFile>): PackageManifest {
  const source = files['manifest.json']?.text
  if (source === undefined) throw new PackageError('manifest.json is missing')
  let raw: unknown
  try { raw = JSON.parse(source) } catch (error) { throw new PackageError(`manifest.json is not valid JSON: ${error instanceof Error ? error.message : ''}`) }
  return parseManifest(raw, new Set(Object.keys(files)))
}

export function settingDefaults(manifest: PackageManifest, current: Record<string, string> = {}) {
  return Object.fromEntries((manifest.settings || []).map(setting => [setting.key, current[setting.key] ?? setting.default ?? '']))
}
