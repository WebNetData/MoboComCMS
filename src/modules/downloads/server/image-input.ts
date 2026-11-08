import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { FileError } from './files'

export async function importDataImage(dataUrl: string, creator?: number) {
  const match = /^data:image\/[a-z0-9.+-]+;base64,([A-Za-z0-9+/=\s]+)$/i.exec(dataUrl)
  if (!match) throw new FileError('تصویر درون‌خطی معتبر نیست')
  const buffer = Buffer.from(match[1], 'base64')
  if (buffer.length > 15 * 1024 * 1024) throw new FileError('تصویر بیش از حد بزرگ است', 413)
  const sharp = (await import('sharp')).default
  const out = await sharp(buffer, { animated: true, limitInputPixels: 60_000_000 }).rotate().resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer()
  const file = `${randomUUID()}.webp`
  const dir = path.join(process.cwd(), 'storage', 'covers')
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, file), out, { flag: 'wx' })
  const url = `/api/media/covers/${file}`
  if (creator) await (await import('@/modules/media/server/library')).registerLocalAsset(url, creator)
  return url
}
