import { NextRequest } from 'next/server'
import { requirePerm } from '@/modules/identity/server/access'
import { err, ok } from '@/platform/http/response'
import { coverFormat, storeCoverImage } from '@/modules/site/server/cover-store'

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
    if (!coverFormat(bytes)) return err('فقط تصاویر PNG، JPEG و WebP مجاز هستند', 400)
    // Stored as WebP (max 2400px, EXIF orientation applied) — much smaller pages.
    return ok({ url: await storeCoverImage(bytes) })
  } catch {
    return err('بارگذاری تصویر انجام نشد؛ دوباره تلاش کنید', 400)
  }
}
