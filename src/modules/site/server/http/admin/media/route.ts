import { NextRequest } from 'next/server'
import { requirePerm } from '@/modules/identity/server/access'
import { CONTENT_EDIT_PERMISSIONS } from '@/modules/identity/rbac'
import { AUTHOR_PERMISSIONS } from '@/modules/identity/domain/sections'
import { err, ok } from '@/platform/http/response'
import { originIsThisSite } from '@/platform/http/origin-policy'
import { coverFormat, listCoverImages, storeCoverImage } from '@/modules/site/server/cover-store'

/** Whoever may put a picture into content may also pick one that is already here: any content section's manager or author, or settings. */
async function mayUsePictures(req: NextRequest) {
  for (const permission of [...CONTENT_EDIT_PERMISSIONS, ...AUTHOR_PERMISSIONS, 'settings.manage']) if (await requirePerm(req, permission)) return true
  return false
}

/** GET /api/admin/media?page=1 — the media library: pictures already on this server, newest first. */
export async function GET(req: NextRequest) {
  if (!await mayUsePictures(req)) return err('forbidden', 403)
  return ok(await listCoverImages(Number(req.nextUrl.searchParams.get('page')), Number(req.nextUrl.searchParams.get('size')) || 40))
}

export async function POST(req: NextRequest) {
  if (!originIsThisSite(req.headers.get('origin'), req.headers.get('host') || req.nextUrl.host)) return err('forbidden', 403)
  if (!await mayUsePictures(req)) return err('forbidden', 403)
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
