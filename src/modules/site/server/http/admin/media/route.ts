import { NextRequest } from 'next/server'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { requirePerm } from '@/modules/identity/server/access'
import { err, ok } from '@/platform/http/response'

export async function POST(req: NextRequest) {
  if (req.headers.get('origin') && req.headers.get('origin') !== req.nextUrl.origin) return err('forbidden', 403)
  const admin = await requirePerm(req, 'cms.pages') || await requirePerm(req, 'cms.posts') || await requirePerm(req, 'settings.manage')
  if (!admin) return err('forbidden', 403)
  return receiveImage(req)
}

/** Reads one uploaded image (multipart "file"), stores it as WebP and returns its URL. Callers check access first. */
export async function receiveImage(req: NextRequest) {
  if (Number(req.headers.get('content-length')) > 16 * 1024 * 1024) return err('حداکثر حجم تصویر ۱۵ مگابایت است', 413)
  try {
    const reader = req.body?.getReader()
    if (!reader) return err('تصویر ارسال نشده است', 400)
    const chunks: Uint8Array[] = []
    let size = 0
    while (true) {
      const part = await reader.read()
      if (part.done) break
      size += part.value.byteLength
      if (size > 16 * 1024 * 1024) { await reader.cancel(); return err('حداکثر حجم تصویر ۱۵ مگابایت است', 413) }
      chunks.push(part.value)
    }
    const form = await new Response(Buffer.concat(chunks), { headers: { 'content-type': req.headers.get('content-type') || '' } }).formData()
    const file = form.get('file')
    if (!file || typeof file === 'string' || !file.size || file.size > 15 * 1024 * 1024) return err('تصویر باید کمتر از ۱۵ مگابایت باشد', 400)
    const bytes = Buffer.from(await file.arrayBuffer())
    const extension = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'png'
      : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? 'jpg'
      : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' ? 'webp' : null
    if (!extension) return err('فقط تصاویر PNG، JPEG و WebP مجاز هستند', 400)
    // Stored as WebP (max 2400px, EXIF orientation applied) — much smaller pages; GIF animation is kept.
    let output: Buffer = bytes
    let finalExtension = extension
    try {
      const sharp = (await import('sharp')).default
      output = await sharp(bytes, { animated: true }).rotate().resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer()
      finalExtension = 'webp'
    } catch { output = bytes }
    const filename = `${randomUUID()}.${finalExtension}`
    const directory = join(process.cwd(), 'storage', 'covers')
    await mkdir(directory, { recursive: true })
    await writeFile(join(directory, filename), output, { flag: 'wx' })
    return ok({ url: `/api/media/covers/${filename}` })
  } catch {
    return err('بارگذاری تصویر انجام نشد؛ دوباره تلاش کنید', 400)
  }
}
