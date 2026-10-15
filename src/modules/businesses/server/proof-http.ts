import type { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { bulkSameOrigin } from '@/modules/content/server/bulk'
import { requireUser } from '@/modules/identity/server/access'
import { rateLimitStrict } from '@/platform/http/rate-limit'
import { readMultipart, MultipartError } from '@/platform/http/multipart'
import { preparePrivateImage, PrivateImageError } from '@/shared/files/private-images'
import { BusinessError } from '../domain/businesses'
import { businessId } from '../domain/profiles'
import { privatePurchaseProof, submitPurchaseProof } from './proofs'

function failure(error: unknown) {
  if (error instanceof BusinessError || error instanceof MultipartError || error instanceof PrivateImageError) return err(error.message, error.status)
  console.error('[businesses] private proof operation failed')
  return err('عملیات انجام نشد؛ دوباره تلاش کنید', 500)
}
export async function POST_proof(req: NextRequest) {
  if (!bulkSameOrigin(req)) return err('forbidden', 403)
  const user = await requireUser(req)
  if (!user) return err('برای ارسال مدرک وارد حساب شوید', 401)
  if (!(await rateLimitStrict(`business-proof-write:${user.id}`, 10, 3_600_000)).ok) return err('کمی بعد دوباره تلاش کنید', 429)
  try {
    const form = await readMultipart(req, 5 * 1024 * 1024 + 65536), uploads = form.getAll('file')
    if (uploads.length !== 1 || typeof uploads[0] === 'string') throw new BusinessError('یک تصویر مدرک را انتخاب کنید')
    const file = await preparePrivateImage(uploads[0])
    return ok(await submitPurchaseProof(req, { businessId: form.get('businessId'), reviewId: form.get('reviewId') }, file))
  } catch (error) { return failure(error) }
}
export async function GET_proof(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = businessId((await params).id), file = await privatePurchaseProof(req, id)
    const extension = file.mimeType === 'image/png' ? 'png' : file.mimeType === 'image/jpeg' ? 'jpg' : 'webp'
    return new Response(new Uint8Array(file.bytes), { headers: { 'content-type': file.mimeType, 'content-length': String(file.bytes.length), 'content-disposition': `attachment; filename="purchase-proof.${extension}"`, 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; sandbox" } })
  } catch (error) { const response = failure(error); response.headers.set('Cache-Control','private, no-store'); return response }
}
