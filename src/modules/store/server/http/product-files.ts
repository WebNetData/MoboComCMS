import type { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { requireUser } from '@/modules/identity/server/access'
import { rateLimitStrict } from '@/platform/http/rate-limit'
import { readJsonObject, JsonBodyError } from '@/platform/http/read-json'
import { originIsThisSite } from '@/platform/http/origin-policy'
import { StoreError } from '@/modules/store/domain/store'
import { LibraryError } from '@/modules/media/domain/library'
import { libraryActor, currentLibraryUser, publicAssetFile, mediaSettings } from '@/modules/media/server/library'
import { discardPrivateFile, privateFilename, privateLocalSource, privateRequestSource, PrivateFileError, servePrivateFile, writePrivateFile } from '@/modules/media/server/private-files'
import { productFileAccess, productFilesSnapshot, writeProductFiles } from '@/modules/store/server/product-files'

const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' } })
const idOf = (raw: string) => { const id = Number(raw); if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647) throw new StoreError('شناسه معتبر نیست', 404); return id }
function failure(error: unknown) { if (error instanceof StoreError || error instanceof LibraryError || error instanceof PrivateFileError || error instanceof JsonBodyError) return reply({ error: error.message }, error.status); throw error }

export async function GET_files(req: NextRequest, rawId: string) {
  const guard = await adminGuard(req, null, ['cms.products']); if ('response' in guard) return guard.response
  try { return reply({ ...await productFilesSnapshot(idOf(rawId)), maxFileMB: (await mediaSettings()).value.maxFileMB }) } catch (error) { return failure(error) }
}

export async function POST_files(req: NextRequest, rawId: string) {
  if (!req.headers.get('origin') || !originIsThisSite(req.headers.get('origin'), req.headers.get('host') || req.nextUrl.host)) return reply({ error: 'درخواست باید از همین سایت ارسال شود' }, 403)
  const guard = await adminGuard(req, null, ['cms.products']); if ('response' in guard) return guard.response
  let allocated: string | null = null
  try {
    const id = idOf(rawId), settings = (await mediaSettings()).value
    if (!(await rateLimitStrict(`store:files:${guard.admin.id}`, 20, 60000)).ok) return reply({ error: 'تعداد درخواست‌ها زیاد است؛ کمی بعد تلاش کنید' }, 429)
    const json = req.headers.get('content-type')?.includes('application/json')
    const input = json ? await readJsonObject(req, 16384) : { revision: req.nextUrl.searchParams.get('revision'), label: req.nextUrl.searchParams.get('label') }
    if (json && !input.assetId) return reply(await writeProductFiles(req, id, input))
    let filename: string, source
    if (json) {
      const actor = await currentLibraryUser(await libraryActor(req)), assetId = String(input.assetId || '').slice(0, 100)
      const asset = await db.mediaAsset.findUnique({ where: { id: assetId }, select: { createdById: true } })
      if (!asset || !actor.manageLibrary && asset.createdById !== actor.id) throw new StoreError('دسترسی به فایل کتابخانه ندارید', 403)
      const assetFile = await publicAssetFile(assetId); filename = privateFilename(assetFile.name); source = await privateLocalSource(assetFile.file)
    } else {
      try { filename = privateFilename(decodeURIComponent(req.headers.get('x-file-name') || '')) } catch { throw new StoreError('نام فایل معتبر نیست') }
      source = privateRequestSource(req.body)
    }
    const blob = await writePrivateFile(source, { maxBytes: settings.maxFileMB * 1024 ** 2, signal: AbortSignal.any([req.signal, AbortSignal.timeout(settings.timeoutSeconds * 1000)]) }); allocated = blob.storageKey
    const result = await writeProductFiles(req, id, input, { ...blob, filename }); allocated = null
    return reply(result)
  } catch (error) { if (allocated) await discardPrivateFile(allocated); return failure(error) }
}

export async function GET_download(req: NextRequest, rawId: string) {
  try {
    const actor = await requireUser(req)
    if (!actor) return reply({ error: 'برای دریافت فایل وارد حساب شوید' }, 401)
    const file = await db.productFile.findFirst({ where: { id: idOf(rawId), active: true } })
    if (!file) return reply({ error: 'فایل پیدا نشد' }, 404)
    const access = await productFileAccess(file.productId, actor.id)
    if (!access) return reply({ error: 'فایل پیدا نشد' }, 404)
    if (!access.open) return reply({ error: 'خرید این محصول یا عضویت مجاز لازم است' }, 403)
    if (!(await rateLimitStrict(`store:file-download:${actor.id}`, 120, 60000)).ok) return reply({ error: 'کمی بعد دوباره تلاش کنید' }, 429)
    return servePrivateFile(req, file)
  } catch (error) { return failure(error) }
}
