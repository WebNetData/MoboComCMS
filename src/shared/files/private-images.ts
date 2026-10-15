import { randomUUID } from 'node:crypto'
import { basename, join } from 'node:path'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { sniffImage } from './image-type'

export type PrivateImage = { filename: string; originalName: string; mimeType: string; size: number; bytes: Buffer }
export type PrivateImageArea = 'tickets' | 'business-proofs'
export class PrivateImageError extends Error { constructor(message: string, readonly status = 400) { super(message) } }
export const privateImageDirectory = (area: PrivateImageArea) => join(process.cwd(), 'storage', area)
export function privateImageName(filename: string) { return /^[0-9a-f-]{36}\.(png|jpg|webp)$/.test(filename) }
export async function preparePrivateImage(upload: File): Promise<PrivateImage> {
  if (!upload.size || upload.size > 5 * 1024 * 1024) throw new PrivateImageError('Each image must be at most 5 MB / هر تصویر حداکثر ۵ مگابایت است', 413)
  const bytes = Buffer.from(await upload.arrayBuffer()), type = sniffImage(bytes)
  if (!type) throw new PrivateImageError('Only PNG, JPEG and WebP images are allowed / فقط تصویر PNG، JPEG یا WebP مجاز است')
  const originalName = basename(upload.name.replace(/\\/g, '/')).replace(/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/g, '').slice(0, 120) || `image.${type.extension}`
  return { filename: `${randomUUID()}.${type.extension}`, originalName, mimeType: type.mimeType, size: bytes.length, bytes }
}
export async function savePrivateImages(area: PrivateImageArea, files: PrivateImage[]) {
  if (!files.length) return
  await mkdir(privateImageDirectory(area), { recursive: true })
  const written: PrivateImage[] = []
  try {
    for (const file of files) {
      if (!privateImageName(file.filename)) throw new PrivateImageError('نام فایل معتبر نیست')
      await writeFile(join(privateImageDirectory(area), file.filename), file.bytes, { flag: 'wx', mode: 0o600 })
      written.push(file)
    }
  } catch (error) { await removePrivateImages(area, written); throw error }
}
export async function removePrivateImages(area: PrivateImageArea, files: Pick<PrivateImage, 'filename'>[]) {
  await Promise.allSettled(files.filter(file => privateImageName(file.filename)).map(file => unlink(join(privateImageDirectory(area), file.filename))))
}
export async function readPrivateImage(area: PrivateImageArea, filename: string) {
  if (!privateImageName(filename)) throw new PrivateImageError('فایل پیدا نشد', 404)
  return readFile(join(privateImageDirectory(area), filename))
}
