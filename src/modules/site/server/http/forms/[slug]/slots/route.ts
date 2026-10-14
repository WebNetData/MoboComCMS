import { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { clientIp, rateLimitHit } from '@/platform/http/rate-limit'
import { FormsError } from '@/modules/forms/domain/forms'
import { publicFormBySlug } from '@/modules/forms/server/service'
import { slotAvailability } from '@/modules/forms/server/advanced'

/** GET /api/forms/<slug>/slots?field=&date=YYYY-MM-DD — the open days of an appointment field and the turns of one day with the seats left. */
export async function GET(req: NextRequest, { params: paramsPromise }: { params: Promise<{ slug: string }> }) {
  const params = await paramsPromise
  if (!rateLimitHit(`form-slots:${params.slug}:${clientIp(req.headers)}`, 90, 60_000).ok) return err('کمی بعد دوباره تلاش کنید', 429)
  const found = await publicFormBySlug(params.slug)
  if (!found) return err('فرم در دسترس نیست', 404)
  const q = req.nextUrl.searchParams
  try { return ok(await slotAvailability(found.form, String(q.get('field') || ''), String(q.get('date') || ''))) } catch (error) {
    if (error instanceof FormsError) return err(error.message, error.status)
    throw error
  }
}
