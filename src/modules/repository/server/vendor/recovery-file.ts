import { constants } from 'node:fs'
import { lstat, open, realpath } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { PACKAGE_LIMITS, normalizeEntries, parseManifest } from '@/modules/packages/domain/format'
import { readZip } from '@/modules/packages/domain/zip'
import { checkReleaseManifest } from '@/modules/repository/domain/repository'
import { sha256 } from '../crypto'
import { releaseDirectory } from './release-commands'

type Subject = { fileId: string; size: number; sha256: string; version: string; runtime: string; requiresCore: string; product: { slug: string; kind: string } }

/** Bounded read for reviewed completion. A verified buffer is copied; the old inode never becomes READY. */
export async function inspectRecoveryFile(row: Subject): Promise<{ state: string; buffer?: Buffer }> {
  if (!/^[a-f0-9-]{36}\.zip$/.test(row.fileId)) return { state: 'unsafe' }
  const directory = resolve(releaseDirectory()), filename = join(directory, row.fileId)
  let file
  try {
    const canonical = await realpath(directory)
    if ((process.platform === 'win32' ? canonical.toLowerCase() !== directory.toLowerCase() : canonical !== directory) || (await lstat(directory)).isSymbolicLink()) return { state: 'unsafe' }
    const before = await lstat(filename)
    if (!before.isFile() || before.isSymbolicLink() || before.size < 1 || before.size > PACKAGE_LIMITS.uploadBytes) return { state: 'unsafe' }
    file = await open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW || 0))
    const start = await file.stat()
    if (!start.isFile() || start.dev !== before.dev || start.ino !== before.ino || start.size !== before.size || start.mtimeMs !== before.mtimeMs) return { state: 'changed' }
    const buffer = Buffer.alloc(start.size + 1)
    let used = 0
    while (used < buffer.length) { const read = await file.read(buffer, used, buffer.length - used, used); if (!read.bytesRead) break; used += read.bytesRead }
    const after = await file.stat(), current = await lstat(filename)
    if (used !== start.size || after.size !== start.size || after.mtimeMs !== start.mtimeMs || after.ctimeMs !== start.ctimeMs || current.dev !== after.dev || current.ino !== after.ino || current.size !== after.size || current.mtimeMs !== after.mtimeMs || current.ctimeMs !== after.ctimeMs || current.isSymbolicLink()) return { state: 'changed' }
    const bytes = buffer.subarray(0, used)
    if (used !== row.size || sha256(bytes) !== row.sha256) return { state: 'mismatch' }
    const entries = normalizeEntries(readZip(bytes, PACKAGE_LIMITS)), source = entries.get('manifest.json')
    if (!source) return { state: 'manifest-invalid' }
    const manifest = parseManifest(JSON.parse(source.toString('utf8')), new Set(entries.keys()))
    checkReleaseManifest(manifest, row.product, [])
    if (manifest.version !== row.version || manifest.runtime !== row.runtime || (manifest.requiresCore || '') !== row.requiresCore) return { state: 'manifest-invalid' }
    return { state: 'valid', buffer: bytes }
  } catch (error) { return { state: (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'missing' : 'unavailable' } }
  finally { await file?.close() }
}
