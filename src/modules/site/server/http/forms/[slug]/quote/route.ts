import { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { clientIp, rateLimitHit } from '@/platform/http/rate-limit'
import { FormsError } from '@/modules/forms/domain/forms'
import { quoteForm } from '@/modules/forms/server/service'

/** POST /api/forms/<slug>/quote — { values } → the bill of what was typed so far (the server prices it again on submit and at checkout). */
export async function POST(req: NextRequest, { params: paramsPromise }: { params: Promise<{ slug: string }> }) {
  const params = await paramsPromise
  if (!rateLimitHit(`form-quote:${params.slug}:${clientIp(req.headers)}`, 60, 60_000).ok) return err('کمی بعد دوباره تلاش کنید', 429)
  const raw = await req.text()
  if (raw.length > 64_000) return err('اطلاعات بیش از حد بزرگ است', 413)
  let body: { values?: unknown }
  try { body = JSON.parse(raw) } catch { return err('داده نامعتبر') }
  try { return ok(await quoteForm(params.slug, body?.values ?? {})) } catch (error) {
    if (error instanceof FormsError) return err(error.message, error.status)
    throw error
  }
}
