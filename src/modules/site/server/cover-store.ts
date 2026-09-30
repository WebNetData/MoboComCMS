import { mkdir, writeFile } from 'node:fs/promises'
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

/**
 * Stores image bytes and returns their site address. `strict` (untrusted
 * remote files) refuses anything sharp cannot decode; otherwise an upload
 * sharp cannot convert is kept as it came (the admin upload's behaviour).
 */
export async function storeCoverImage(bytes: Buffer, options: { strict?: boolean } = {}): Promise<string> {
  if (!bytes.length || bytes.length > COVER_MAX_BYTES) throw new CoverImageError('حداکثر حجم تصویر ۱۵ مگابایت است')
  const extension = coverFormat(bytes)
  if (!extension) throw new CoverImageError('فقط تصاویر PNG، JPEG و WebP مجاز هستند')
  let output: Buffer = bytes
  let finalExtension: string = extension
  try {
    const sharp = (await import('sharp')).default
    output = await sharp(bytes, options.strict ? { animated: true, limitInputPixels: MAX_PIXELS, failOn: 'error' } : { animated: true })
      .rotate().resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer()
    finalExtension = 'webp'
  } catch {
    if (options.strict) throw new CoverImageError('محتوای فایل تصویر معتبر نیست')
    output = bytes
  }
  const filename = `${randomUUID()}.${finalExtension}`
  const directory = join(process.cwd(), 'storage', 'covers')
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, filename), output, { flag: 'wx' })
  return `/api/media/covers/${filename}`
}
