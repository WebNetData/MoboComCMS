import { NextRequest } from 'next/server'
import { requirePerm } from '@/modules/identity/server/access'
import { CONTENT_EDIT_PERMISSIONS } from '@/modules/identity/rbac'
import { AUTHOR_PERMISSIONS } from '@/modules/identity/domain/sections'
import { isModuleEnabled } from '@/extensions/server/modules'
import { LibraryError } from '@/modules/media/domain/library'
import { err, ok } from '@/platform/http/response'
import { originIsThisSite } from '@/platform/http/origin-policy'
import { coverFormat, listCoverImages, storeCoverImage } from '@/modules/site/server/cover-store'

/** Whoever may put a picture into content may also pick one that is already here: any content section's manager or author, or settings. */
async function mayUsePictures(req: NextRequest) {
  for (const permission of [...CONTENT_EDIT_PERMISSIONS, ...AUTHOR_PERMISSIONS, 'prompts.manage', 'settings.manage', 'media.manage']) if (await requirePerm(req, permission)) return 'general' as const
  if (await requirePerm(req, 'popups.manage') && await isModuleEnabled('popups')) return 'popup-upload' as const
  return null
}

/** GET /api/admin/media?page=1 — the media library: pictures already on this server, newest first. */
export async function GET(req: NextRequest) {
  if (!await mayUsePictures(req)) return err('forbidden', 403)
  return ok(await listCoverImages(Number(req.nextUrl.searchParams.get('page')), Number(req.nextUrl.searchParams.get('size')) || 40))
}

export async function POST(req: NextRequest) {
  if (!originIsThisSite(req.headers.get('origin'), req.headers.get('host') || req.nextUrl.host)) return err('forbidden', 403)
  const scope = await mayUsePictures(req)
  if (!scope) return err('forbidden', 403)
  const { libraryActor, currentLibraryUser } = await import('@/modules/media/server/library')
  try {
    const actor = await libraryActor(req)
    const user = await currentLibraryUser(scope === 'popup-upload' ? { ...actor, purpose: 'popup-upload' } : actor)
    return receiveImage(req, user.id, scope !== 'popup-upload')
  } catch (error) {
    if (error instanceof LibraryError) return err(error.message, error.status)
    throw error
  }
}

/** Reads one uploaded image (multipart "file"), stores it as WebP and returns its URL. Callers check access first. */
export async function receiveImage(req: NextRequest, creator?: number, allowOrganization = true) {
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
    // An item's editor sends who the picture belongs to; the folder and readable name are worked out here, never taken from the browser.
    // Only an upload that names its item loads the organizer; every other upload keeps the flat store untouched.
    const organizationField = form.get('organization')
    if (!allowOrganization && organizationField) return err('بارگذاری پاپ‌آپ در پوشهٔ بخش‌های دیگر مجاز نیست', 403)
    const organizer = creator && typeof organizationField === 'string' && organizationField ? await Promise.all([import('@/modules/downloads/domain/organization'), import('@/modules/media/server/library/organized-image')]) : null
    const [domain, organized] = organizer || [null, null]
    const destination = domain && organized ? organized.organizedImageDestination(domain.parseOrganization(organizationField)) : ''
    if (domain && organized && destination && creator) {
      const stored = await organized.storeOrganizedImage(bytes, destination, domain.imageRole(form.get('role')), creator)
      return ok({ url: stored.url, assetId: stored.asset.id, revision: stored.asset.revision, folder: destination })
    }
    // Stored as WebP (max 2400px, EXIF orientation applied) — much smaller pages.
    const url = await storeCoverImage(bytes)
    const asset = creator ? await (await import('@/modules/media/server/library')).registerLocalAsset(url, creator, null, file.name) : null
    return ok({ url, ...(asset ? { assetId: asset.id, revision: asset.revision } : {}) })
  } catch {
    return err('بارگذاری تصویر انجام نشد؛ دوباره تلاش کنید', 400)
  }
}
