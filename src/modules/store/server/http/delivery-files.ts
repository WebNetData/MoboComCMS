import type { NextRequest } from 'next/server'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { requireUser } from '@/modules/identity/server/access'
import { rateLimitStrict } from '@/platform/http/rate-limit'
import { readJsonObject, JsonBodyError } from '@/platform/http/read-json'
import { originIsThisSite } from '@/platform/http/origin-policy'
import { StoreError } from '@/modules/store/domain/store'
import { mediaSettings } from '@/modules/media/server/library'
import { discardPrivateFile, privateFilename, privateRequestSource, PrivateFileError, servePrivateFile, writePrivateFile } from '@/modules/media/server/private-files'
import { addOrderDeliveryFile, buyerDeliveryFile, orderDeliveryFiles, removeOrderDeliveryFile } from '@/modules/store/server/delivery-files'

const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' } })
const idOf = (raw: unknown) => { const id = Number(raw); if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647) throw new StoreError('شناسه معتبر نیست', 404); return id }
function failure(error: unknown) { if (error instanceof StoreError || error instanceof PrivateFileError || error instanceof JsonBodyError) return reply({ error: error.message }, error.status); throw error }
const orderWorker = (req: NextRequest) => adminGuard(req, 'store', ['orders.manage', 'store.orders.handle'])

/** GET /api/admin/store/orders/:id/files */
export async function GET_admin(req: NextRequest, rawId: string) {
  const guard = await orderWorker(req); if ('response' in guard) return guard.response
  try { return reply({ files: await orderDeliveryFiles(idOf(rawId)), maxFileMB: (await mediaSettings()).value.maxFileMB }) } catch (error) { return failure(error) }
}

/**
 * POST /api/admin/store/orders/:id/files
 *   the file itself as the body (X-File-Name, ?label=) — attaches it
 *   { action: 'remove', fileId } — removes one
 */
export async function POST_admin(req: NextRequest, rawId: string) {
  if (!req.headers.get('origin') || !originIsThisSite(req.headers.get('origin'), req.headers.get('host') || req.nextUrl.host)) return reply({ error: 'درخواست باید از همین سایت ارسال شود' }, 403)
  const guard = await orderWorker(req); if ('response' in guard) return guard.response
  const scope = { actorId: guard.admin.id, manager: guard.admin.roleId == null || !!guard.admin.permissions?.includes('orders.manage') }
  const audit = { req, actor: guard.admin }
  let allocated: string | null = null
  try {
    const id = idOf(rawId)
    if (!(await rateLimitStrict(`store:order-files:${guard.admin.id}`, 30, 60000)).ok) return reply({ error: 'تعداد درخواست‌ها زیاد است؛ کمی بعد تلاش کنید' }, 429)
    if (req.headers.get('content-type')?.includes('application/json')) {
      const input = await readJsonObject(req, 4096)
      if (input.action !== 'remove') throw new StoreError('عملیات معتبر نیست')
      const { files, storageKey } = await removeOrderDeliveryFile(audit, id, idOf(input.fileId), scope)
      await discardPrivateFile(storageKey)
      return reply({ files })
    }
    let filename: string
    try { filename = privateFilename(decodeURIComponent(req.headers.get('x-file-name') || '')) } catch { throw new StoreError('نام فایل معتبر نیست') }
    const settings = (await mediaSettings()).value
    const blob = await writePrivateFile(privateRequestSource(req.body), { maxBytes: settings.maxFileMB * 1024 ** 2, signal: AbortSignal.any([req.signal, AbortSignal.timeout(settings.timeoutSeconds * 1000)]) }); allocated = blob.storageKey
    const files = await addOrderDeliveryFile(audit, id, scope, { ...blob, filename }, req.nextUrl.searchParams.get('label')); allocated = null
    return reply({ files })
  } catch (error) { if (allocated) await discardPrivateFile(allocated); return failure(error) }
}

/** GET /api/store/orders/:id/files/:fileId — the buyer's download. */
export async function GET_buyer(req: NextRequest, rawOrderId: string, rawFileId: string) {
  try {
    const actor = await requireUser(req)
    if (!actor) return reply({ error: 'برای دریافت فایل وارد حساب شوید' }, 401)
    if (!(await rateLimitStrict(`store:order-file-download:${actor.id}`, 120, 60000)).ok) return reply({ error: 'کمی بعد دوباره تلاش کنید' }, 429)
    const file = await buyerDeliveryFile(actor.id, idOf(rawOrderId), idOf(rawFileId))
    if (!file) return reply({ error: 'فایل پیدا نشد' }, 404)
    return servePrivateFile(req, file)
  } catch (error) { return failure(error) }
}
