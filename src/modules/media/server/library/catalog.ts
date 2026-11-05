import fs from 'node:fs/promises'
import path from 'node:path'
import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { filesRoot } from '@/modules/downloads/server/files'
import { contentTypeFor } from '@/modules/downloads/domain/mask'
import { LibraryError, libraryKind, type LibraryAsset } from '@/modules/media/domain/library'
import type { LibraryUser } from './authority'
import { validOrganizationPath } from '@/modules/downloads/domain/organization'

const coverKey = /^[0-9a-f-]{36}\.(webp|png|jpg)$/i
export const assetUrl = (row: { storage: string; key: string }) => row.storage === 'covers' ? `/api/media/covers/${row.key}` : `/files/${row.key.split('/').map(encodeURIComponent).join('/')}`
export function localDescriptor(url: string) {
  if (url.startsWith('/api/media/covers/') && coverKey.test(url.slice(18))) return { storage: 'covers', key: url.slice(18) }
  if (url.startsWith('/files/')) {
    let key: string
    try { key = url.slice(7).split('/').map(decodeURIComponent).join('/') } catch { throw new LibraryError('آدرس فایل نامعتبر است') }
    if ((/^uploads\/(music|cinema|software|games|posts|products|general)\/[0-9]{4}-[0-9]{2}\//.test(key) || validOrganizationPath(key.split('/').slice(0,-1).join('/'))) && key.split('/').every(p => p && !p.startsWith('.') && !/[\\\u0000-\u001f]/.test(p))) return { storage: 'downloads', key }
  }
  throw new LibraryError('فقط فایل عمومیِ بارگذاری‌شده در سایت قابل ثبت است')
}
export async function registerLocalAsset(url: string, creator: number | null = null, folderId: number | null = null, displayName?: string, client: Pick<Prisma.TransactionClient, 'mediaAsset'> = db) {
  const desc = localDescriptor(url)
  const root = desc.storage === 'covers' ? path.join(process.cwd(), 'storage', 'covers') : filesRoot()
  const full = path.resolve(root, desc.key)
  const real = await fs.realpath(full).catch(() => null)
  const realRoot = await fs.realpath(root)
  if (!real || !real.startsWith(realRoot + path.sep) || (await fs.lstat(full)).isSymbolicLink()) throw new LibraryError('فایل عمومی پیدا نشد', 404)
  const stat = await fs.stat(real)
  if (!stat.isFile()) throw new LibraryError('فایل پیدا نشد', 404)
  const name = displayName?.slice(0, 120) || path.basename(desc.key).slice(0, 120)
  const mime = contentTypeFor(desc.key, null)
  let width = 0, height = 0
  if (desc.storage === 'covers' || mime === 'image/webp' && validOrganizationPath(desc.key.split('/').slice(0,-1).join('/'))) {
    const meta = await (await import('sharp')).default(real).metadata().catch(() => null)
    width = meta?.width || 0; height = meta?.height || 0
  }
  return client.mediaAsset.upsert({ where: { storage_key: desc }, create: { ...desc, name, mime, kind: libraryKind(mime, name), bytes: BigInt(stat.size), width, height, createdById: creator, folderId, createdAt: stat.birthtime }, update: {} })
}
export function assetView(row: Awaited<ReturnType<typeof registerLocalAsset>>, user: LibraryUser): LibraryAsset {
  return { id: row.id, url: assetUrl(row), name: row.name, mime: row.mime, kind: row.kind as LibraryAsset['kind'], bytes: String(row.bytes), width: row.width, height: row.height, alt: row.alt, caption: row.caption, tags: JSON.parse(row.tags), folderId: row.folderId, revision: row.revision, archivedAt: row.archivedAt?.toISOString() || null, editable: user.manageLibrary || row.createdById === user.id }
}

/** Trusted server composition only: resolves an existing public blob, never a caller-supplied path. */
export async function publicAssetFile(id: string) {
  const asset = await db.mediaAsset.findUnique({ where: { id } })
  if (!asset || asset.archivedAt) throw new LibraryError('فایل کتابخانه پیدا نشد', 404)
  const desc = localDescriptor(assetUrl(asset))
  const root = desc.storage === 'covers' ? path.join(process.cwd(), 'storage', 'covers') : filesRoot()
  const file = await fs.realpath(path.join(root, desc.key))
  if (!file.startsWith(await fs.realpath(root) + path.sep)) throw new LibraryError('فایل عمومی معتبر نیست', 403)
  const info = await fs.lstat(file)
  if (!info.isFile()) throw new LibraryError('فایل عمومی معتبر نیست', 403)
  return { file, name: asset.name, size: info.size }
}
/** A completed transfer's physical tags take precedence over older download-time cleanup. */
export async function preservesTransferredMusicTags(file: string): Promise<boolean> {
  const relative = path.relative(filesRoot(), file)
  if (!relative || path.isAbsolute(relative) || relative.startsWith('..' + path.sep)) return false
  const key = relative.split(path.sep).join('/')
  const row = await db.mediaTransfer.findFirst({ where: { status: 'READY', asset: { is: { storage: 'downloads', key } } }, select: { musicMetadata: true } })
  try { return JSON.parse(row?.musicMetadata || '{}').tagged === true } catch { return false }
}
/** Bounded, resumable discovery of existing public files. Private and generated trees are never visited. */
async function* publicFiles() {
  const covers = await fs.readdir(path.join(process.cwd(), 'storage', 'covers')).catch(() => [])
  yield* covers.filter(n => coverKey.test(n)).sort().map(n => `/api/media/covers/${n}`)
  const uploads = path.join(filesRoot(), 'uploads')
  const sections = await fs.readdir(uploads, { withFileTypes: true }).catch(() => [])
  for (const section of sections.sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    if (!section.isDirectory() || !/^(music|cinema|software|games|posts|products|general)$/.test(section.name)) continue
    const months = await fs.readdir(path.join(uploads, section.name), { withFileTypes: true })
    for (const month of months.sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
      if (!month.isDirectory() || !/^\d{4}-\d{2}$/.test(month.name)) continue
      const files = await fs.readdir(path.join(uploads, section.name, month.name), { withFileTypes: true })
      yield* files.filter(f => f.isFile() && !f.name.startsWith('.')).map(f => `/files/uploads/${section.name}/${month.name}/${encodeURIComponent(f.name)}`).sort()
    }
  }
}
export async function discoverAssets(cursor = '', limit = 100) {
  let count = 0, last = cursor
  for await (const url of publicFiles()) {
    if (url <= cursor) continue
    if (count >= limit) return { count, cursor: last }
    // A file removed concurrently is skipped; an invalid/out-of-root file is never adopted.
    try { await registerLocalAsset(url); count++ } catch (error) { if (!(error instanceof LibraryError)) throw error }
    last = url
  }
  return { count, cursor: null }
}
