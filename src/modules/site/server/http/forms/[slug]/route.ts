import { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { clientIp, rateLimitHit } from '@/platform/http/rate-limit'
import { requireUser } from '@/modules/identity/server/access'
import { FormsError } from '@/modules/forms/domain/forms'
import { submitForm } from '@/modules/forms/server/service'

/** POST /api/forms/<slug> — { values, website } → the success message (and where to send the visitor). */
export async function POST(req: NextRequest, { params: paramsPromise }: { params: Promise<{ slug: string }> }) {
  const params = await paramsPromise
  const origin = req.headers.get('origin')
  if (origin && origin !== req.nextUrl.origin && origin !== process.env.NEXTAUTH_URL) return err('درخواست غیرمجاز', 403)
  const ip = clientIp(req.headers)
  if (!rateLimitHit(`form:${params.slug}:${ip}`, 5, 60_000).ok) return err('کمی بعد دوباره تلاش کنید', 429)
  const raw = await req.text()
  if (raw.length > 64_000) return err('اطلاعات بیش از حد بزرگ است', 413)
  let body: { values?: unknown; website?: unknown }
  try { body = JSON.parse(raw) } catch { return err('داده نامعتبر') }
  const user = await requireUser(req)
  try {
    const result = await submitForm(params.slug, { values: body?.values, website: body?.website }, { userId: user?.id ?? null, ip })
    return ok(result, 201)
  } catch (error) {
    if (error instanceof FormsError) return err(error.message, error.status)
    throw error
  }
}
