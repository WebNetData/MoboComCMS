import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { PACKAGE_LIMITS, PackageError } from '@/modules/packages/domain/format'
import type { StoredPackage, PackageRevision } from '../store'

export type PackageReader = Pick<Prisma.TransactionClient, 'setting'>
export const rowKey = (id: string) => `package.${id}.v1`
const INDEX_KEY = 'packages.index.v1'
interface PackageIndex { ids: string[]; rev: number }

/** Retry the complete fresh read/validation/write, never a stale package snapshot. */
export async function packageTransaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await db.$transaction(work, { isolationLevel: 'Serializable', maxWait: 10000, timeout: 15000 }) }
    catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? error.code : null
      if (attempt >= 4 || (code !== 'P2034' && code !== 'P2002')) throw error
    }
  }
}

export async function readIndex(reader: PackageReader = db, strict = false): Promise<PackageIndex> {
  const row = await reader.setting.findUnique({ where: { key: INDEX_KEY } })
  try {
    const value = row ? JSON.parse(row.value) : null
    if (value && Array.isArray(value.ids) && Number.isInteger(value.rev)
      && (!strict || (value.rev >= 0 && value.ids.every((id: unknown) => typeof id === 'string' && /^[a-z][a-z0-9-]{1,49}$/.test(id))))) {
      return { ids: value.ids.filter((id: unknown) => typeof id === 'string'), rev: value.rev }
    }
  } catch { /* Reconstruct only the index; package bytes remain untouched. */ }
  if (row && strict) throw new PackageError('package index has invalid stored data; repair it before changing it')
  const rows = await reader.setting.findMany({ where: { key: { startsWith: 'package.' } }, select: { key: true } })
  return { ids: rows.map(item => /^package\.([a-z0-9-]+)\.v1$/.exec(item.key)?.[1]).filter((id): id is string => !!id), rev: 0 }
}

export async function writeIndex(reader: PackageReader, mutate: (ids: Set<string>) => void) {
  const index = await readIndex(reader, true), ids = new Set(index.ids)
  mutate(ids)
  const value = JSON.stringify({ ids: [...ids].sort(), rev: index.rev + 1 })
  await reader.setting.upsert({ where: { key: INDEX_KEY }, create: { key: INDEX_KEY, value }, update: { value } })
}

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
export async function loadPackageFrom(id: string, reader: PackageReader = db, strict = false): Promise<StoredPackage | null> {
  if (!/^[a-z][a-z0-9-]{1,49}$/.test(id)) return null
  const row = await reader.setting.findUnique({ where: { key: rowKey(id) } })
  if (!row) return null
  try {
    const pkg: unknown = JSON.parse(row.value)
    if (!record(pkg) || !record(pkg.manifest) || pkg.manifest.id !== id
      || !['plugin', 'theme'].includes(String(pkg.manifest.kind)) || !['code', 'declarative'].includes(String(pkg.manifest.runtime))
      || !record(pkg.files) || !record(pkg.settings)
      || typeof pkg.enabled !== 'boolean' || typeof pkg.installedAt !== 'string' || typeof pkg.updatedAt !== 'string'
      || !Array.isArray(pkg.revisions) || !Object.values(pkg.settings).every(value => typeof value === 'string')
      || !Object.values(pkg.files).every(file => record(file) && (typeof file.text === 'string' || typeof file.base64 === 'string'))
      || !pkg.revisions.every(revision => record(revision) && typeof revision.at === 'string' && typeof revision.path === 'string'
        && (revision.content === null || typeof revision.content === 'string') && typeof revision.actor === 'string' && typeof revision.note === 'string')) throw new Error('invalid stored package')
    return pkg as unknown as StoredPackage
  } catch {
    if (strict) throw new PackageError(`package "${id}" has invalid stored data; repair it before changing it`)
    return null
  }
}

function trimRevisions(revisions: PackageRevision[]) {
  let budget = 2 * 1024 * 1024
  return revisions.slice(0, PACKAGE_LIMITS.maxRevisions).map(revision => {
    if (revision.content === null) return revision
    budget -= revision.content.length
    return budget >= 0 ? revision : { ...revision, content: null, path: '*', note: `${revision.note} (${revision.path}, history trimmed)` }
  })
}

export async function savePackage(reader: PackageReader, pkg: StoredPackage) {
  pkg.revisions = trimRevisions(pkg.revisions)
  const key = rowKey(pkg.manifest.id), value = JSON.stringify(pkg)
  await reader.setting.upsert({ where: { key }, create: { key, value }, update: { value } })
  await writeIndex(reader, ids => ids.add(pkg.manifest.id))
}

export function mustLoad(pkg: StoredPackage | null, id: string): StoredPackage {
  if (!pkg) throw new PackageError(`package "${id}" is not installed`)
  return pkg
}
