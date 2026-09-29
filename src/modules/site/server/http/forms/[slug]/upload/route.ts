import { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { clientIp } from '@/platform/http/rate-limit'
import { FormsError } from '@/modules/forms/domain/forms'
import { uploadFile } from '@/modules/forms/server/service'

/** POST /api/forms/<slug>/upload — one file for a "file" field (multipart, field name "file"). */
export async function POST(req: NextRequest, { params: paramsPromise }: { params: Promise<{ slug: string }> }) {
  const params = await paramsPromise
  const origin = req.headers.get('origin')
  if (origin && origin !== req.nextUrl.origin && origin !== process.env.NEXTAUTH_URL) return err('درخواست غیرمجاز', 403)
  const declared = Number(req.headers.get('content-length') || 0)
  if (declared > 6 * 1024 * 1024) return err('حجم فایل حداکثر ۵ مگابایت است', 413)
  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) return err('فایلی ارسال نشد')
  try { return ok(await uploadFile(params.slug, file, clientIp(req.headers)), 201) } catch (error) {
    if (error instanceof FormsError) return err(error.message, error.status)
    throw error
  }
}
