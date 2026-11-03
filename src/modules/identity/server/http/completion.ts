import type { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { clientIp, rateLimitHit, rateLimitStrict } from '@/platform/http/rate-limit'
import { requirePerm, requireUser } from '@/modules/identity/server/access'
import { CompletionError, completionStatus, getFieldsConfig, saveFieldsConfig, submitCompletion } from '@/modules/identity/server/profile-fields'
import { FIELD_TYPES } from '@/modules/identity/domain/profile-fields'
import { sectionSettingsSaveWith } from '@/modules/settings/server/http/section-history'
import { sectionSettingsRevision } from '@/modules/settings/server/section-history'
import { IRAN_CENTER, PROVINCE_CENTERS } from '@/modules/shipping/domain/shipping'

/** GET /api/profile/completion — fields, current values and whether the member must finish first. */
export async function GET_completion(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return err('unauthorized', 401)
  return ok(await completionStatus(user.id))
}

/** POST /api/profile/completion — saves the form; 422 with per-field errors. */
export async function POST_completion(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return err('unauthorized', 401)
  if (!(await rateLimitStrict(`completion:${user.id}`, 30, 10 * 60_000)).ok) return err('درخواست زیاد بود؛ کمی بعد دوباره تلاش کنید', 429)
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return err('اطلاعات ارسال نشد')
  try {
    return ok(await submitCompletion(user.id, body as Record<string, unknown>))
  } catch (error) {
    if (error instanceof CompletionError) return err(error.message, error.status, { errors: error.errors })
    throw error
  }
}

async function adminAllowed(req: NextRequest) {
  return (await requirePerm(req, 'users.manage')) || (await requirePerm(req, 'settings.manage'))
}

/** GET/PUT /api/admin/profile-fields — the registration field builder. */
export async function GET_fields(req: NextRequest) {
  if (!await adminAllowed(req)) return err('forbidden', 403)
  const config = await getFieldsConfig()
  return ok({ config, types: FIELD_TYPES, settingsRevision: sectionSettingsRevision(config) })
}

export async function PUT_fields(req: NextRequest) {
  const admin = await adminAllowed(req)
  if (!admin) return err('forbidden', 403)
  const body = await req.json().catch(() => null)
  return sectionSettingsSaveWith(req, admin, (context) => saveFieldsConfig(body?.config ?? {}, context), (config) => ({ config }))
}

// ------------------------------------------------------------------ geocoding

// OpenStreetMap Nominatim, proxied: one identifying User-Agent, cached, and
// throttled well below its 1 request/second policy.
const cache = new Map<string, { at: number; value: { lat: number; lng: number } | null }>()
let lastCall = 0

/** GET /api/geo/search?province=&city=&q= → {center, zoom} (falls back to the province capital). */
export async function GET_geocode(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return err('unauthorized', 401)
  const params = req.nextUrl.searchParams
  const province = String(params.get('province') || '').slice(0, 40)
  const city = String(params.get('city') || '').replace(/[<>]/g, '').trim().slice(0, 60)
  const street = String(params.get('q') || '').replace(/[<>]/g, '').trim().slice(0, 120)
  const fallback = PROVINCE_CENTERS[province] || IRAN_CENTER
  const fallbackZoom = PROVINCE_CENTERS[province] ? 11 : 5
  if (!city && !street) return ok({ center: fallback, zoom: fallbackZoom, source: 'province' })
  const key = `${province}|${city}|${street}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < 7 * 86_400_000) return ok(hit.value ? { center: [hit.value.lat, hit.value.lng], zoom: street ? 16 : 13, source: 'search' } : { center: fallback, zoom: fallbackZoom, source: 'province' })
  if (!rateLimitHit(`geo:${user.id}:${clientIp(req.headers)}`, 20, 60_000).ok || Date.now() - lastCall < 1100) return ok({ center: fallback, zoom: fallbackZoom, source: 'province' })
  lastCall = Date.now()
  let value: { lat: number; lng: number } | null = null
  try {
    const url = new URL('https://nominatim.openstreetmap.org/search')
    url.searchParams.set('format', 'json'); url.searchParams.set('limit', '1'); url.searchParams.set('countrycodes', 'ir'); url.searchParams.set('accept-language', 'fa')
    url.searchParams.set('q', [street, city, province, 'ایران'].filter(Boolean).join('، '))
    const response = await fetch(url, { headers: { 'User-Agent': `MoboComCMS/1.0 (${process.env.NEXTAUTH_URL || 'self-hosted'})` }, signal: AbortSignal.timeout(6000) })
    const rows = response.ok ? await response.json() as { lat: string; lon: string }[] : []
    if (rows[0]) value = { lat: Number(rows[0].lat), lng: Number(rows[0].lon) }
  } catch { value = null }
  if (cache.size > 2000) cache.clear()
  cache.set(key, { at: Date.now(), value })
  return ok(value ? { center: [value.lat, value.lng], zoom: street ? 16 : 13, source: 'search' } : { center: fallback, zoom: fallbackZoom, source: 'province' })
}
