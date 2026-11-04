import { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { clientIp, rateLimitHit } from '@/platform/http/rate-limit'
import { requireUser } from '@/modules/identity/server/access'
import { FormsError } from '@/modules/forms/domain/forms'
import { publicFormBySlug, submitForm } from '@/modules/forms/server/service'
import { publicForm } from '@/modules/forms/domain/forms'
import { FORM_SLUG } from '@/modules/forms/domain/embed'
import { humanCheckRefusal } from '@/modules/identity/server/human-check'

/** GET /api/forms/<slug> — a published form and whether it is open, for a form placed in written content. */
export async function GET(_req: NextRequest, { params: paramsPromise }: { params: Promise<{ slug: string }> }) {
  const { slug } = await paramsPromise
  if (!FORM_SLUG.test(slug)) return err('فرم پیدا نشد', 404)
  const found = await publicFormBySlug(slug)
  if (!found) return err('فرم پیدا نشد', 404)
  return ok({ form: publicForm(found.form), state: found.state })
}

/** POST /api/forms/<slug> — { values, website } → the success message (and where to send the visitor). */
export async function POST(req: NextRequest, { params: paramsPromise }: { params: Promise<{ slug: string }> }) {
  const params = await paramsPromise
  const origin = req.headers.get('origin')
  if (origin && origin !== req.nextUrl.origin && origin !== process.env.NEXTAUTH_URL) return err('درخواست غیرمجاز', 403)
  const ip = clientIp(req.headers)
  if (!rateLimitHit(`form:${params.slug}:${ip}`, 5, 60_000).ok) return err('کمی بعد دوباره تلاش کنید', 429)
  const raw = await req.text()
  if (raw.length > 64_000) return err('اطلاعات بیش از حد بزرگ است', 413)
  let body: { values?: unknown; website?: unknown; humanCheck?: unknown }
  try { body = JSON.parse(raw) } catch { return err('داده نامعتبر') }
  const refused = await humanCheckRefusal(body?.humanCheck, req.headers, 'form')
  if (refused) return refused
  const user = await requireUser(req)
  try {
    const result = await submitForm(params.slug, { values: body?.values, website: body?.website }, { userId: user?.id ?? null, ip })
    return ok(result, 201)
  } catch (error) {
    if (error instanceof FormsError) return err(error.message, error.status)
    throw error
  }
}
