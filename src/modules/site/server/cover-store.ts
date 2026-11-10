import { mkdir, readdir, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

/**
 * The content-image store (storage/covers, served at /api/media/covers/…):
 * type checked by its first bytes, EXIF orientation applied, resized to at
 * most 2400px and saved as WebP. Used by the admin image upload and by the
 * bulk importer, so every image in the library goes through the same steps
 * (watermarking and resized variants are applied when served).
 */

export class CoverImageError extends Error {}

export type LibraryImage = { name: string; url: string; bytes: number; addedAt: string }
const LIBRARY_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|png|jpg)$/
let library: { stamp: number; rows: LibraryImage[] } | null = null

/**
 * The pictures already on this server, newest first, a page at a time — what the editor's media library shows so
 * a picture is reused instead of uploaded again. Only files the store itself wrote are listed (its own naming),
 * never the resized cache. The folder's own change time says whether the remembered list is still true.
 */
export async function listCoverImages(page = 1, size = 40): Promise<{ items: LibraryImage[]; total: number; page: number; pages: number }> {
  const directory = join(process.cwd(), 'storage', 'covers')
  const stamp = await stat(directory).then((info) => info.mtimeMs).catch(() => 0)
  if (!stamp) return { items: [], total: 0, page: 1, pages: 1 }
  if (!library || library.stamp !== stamp) {
    const names = (await readdir(directory)).filter((name) => LIBRARY_NAME.test(name))
    const rows: LibraryImage[] = []
    for (let i = 0; i < names.length; i += 200) {
      const batch = await Promise.all(names.slice(i, i + 200).map(async (name) => { const info = await stat(join(directory, name)).catch(() => null); return info?.isFile() ? { name, url: `/api/media/covers/${name}`, bytes: info.size, addedAt: info.mtime.toISOString() } : null }))
      for (const row of batch) if (row) rows.push(row)
    }
    rows.sort((a, b) => (a.addedAt < b.addedAt ? 1 : a.addedAt > b.addedAt ? -1 : a.name.localeCompare(b.name)))
    library = { stamp, rows }
  }
  const take = Math.max(1, Math.min(100, Math.trunc(size) || 40)), pages = Math.max(1, Math.ceil(library.rows.length / take))
  const at = Math.max(1, Math.min(pages, Math.trunc(page) || 1))
  return { items: library.rows.slice((at - 1) * take, at * take), total: library.rows.length, page: at, pages }
}

export const COVER_MAX_BYTES = 15 * 1024 * 1024
const MAX_PIXELS = 60_000_000

/** png | jpg | webp from the file's signature, or null. */
export function coverFormat(bytes: Uint8Array): 'png' | 'jpg' | 'webp' | null {
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'png'
  if (b.length >= 3 && b[0] === 255 && b[1] === 216 && b[2] === 255) return 'jpg'
  if (b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'webp'
  return null
}

/** Checked, oriented and resized WebP bytes (or, outside `strict`, the original when sharp cannot convert them). */
export async function encodeCoverImage(bytes: Buffer, options: { strict?: boolean } = {}): Promise<{ output: Buffer; extension: string }> {
  if (!bytes.length || bytes.length > COVER_MAX_BYTES) throw new CoverImageError('حداکثر حجم تصویر ۱۵ مگابایت است')
  const extension = coverFormat(bytes)
  if (!extension) throw new CoverImageError('فقط تصاویر PNG، JPEG و WebP مجاز هستند')
  try {
    const sharp = (await import('sharp')).default
    const output = await sharp(bytes, options.strict ? { animated: true, limitInputPixels: MAX_PIXELS, failOn: 'error' } : { animated: true })
      .rotate().resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer()
    return { output, extension: 'webp' }
  } catch {
    if (options.strict) throw new CoverImageError('محتوای فایل تصویر معتبر نیست')
    return { output: bytes, extension }
  }
}

/**
 * Stores image bytes and returns their site address. `strict` (untrusted
 * remote files) refuses anything sharp cannot decode; otherwise an upload
 * sharp cannot convert is kept as it came (the admin upload's behaviour).
 */
export async function storeCoverImage(bytes: Buffer, options: { strict?: boolean } = {}): Promise<string> {
  const { output, extension } = await encodeCoverImage(bytes, options)
  const filename = `${randomUUID()}.${extension}`
  const directory = join(process.cwd(), 'storage', 'covers')
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, filename), output, { flag: 'wx' })
  return `/api/media/covers/${filename}`
}
