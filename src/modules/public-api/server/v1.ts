// Helpers shared by all /api/v1 endpoints: caller auth, envelope + rate limit.
import { NextRequest, NextResponse } from 'next/server'
import { rateLimit, resolveApiCaller, type ApiCaller } from '@/modules/public-api/server/api-keys'
import { isPublicApiEnabled } from '@/modules/public-api/server/availability'

export function apiOk(data: unknown, status = 200) {
  return NextResponse.json({ ok: true, data }, { status, headers: { 'Cache-Control': 'no-store' } })
}

export function apiErr(message: string, status = 400, code?: string) {
  return NextResponse.json(
    { ok: false, error: message, ...(code ? { code } : {}) },
    { status, headers: { 'Cache-Control': 'no-store' } }
  )
}

/**
 * Resolves and rate-limits the caller. Pass the result of `authorize` straight
 * through: `const caller = await authorize(req); if (!caller.ok) return caller.response`.
 */
export async function authorize(
  req: NextRequest
): Promise<{ ok: true; caller: ApiCaller } | { ok: false; response: NextResponse }> {
  if (!await isPublicApiEnabled()) return { ok: false, response: apiErr('not found', 404, 'API_DISABLED') }
  const caller = await resolveApiCaller(req)
  if (!caller) {
    return {
      ok: false,
      response: apiErr('unauthorized — send an API key as "Authorization: Bearer <key>"', 401),
    }
  }
  if (caller.keyId) {
    const limit = rateLimit(caller.keyId)
    if (!limit.ok) {
      return { ok: false, response: apiErr(`rate limit exceeded, retry in ${limit.retryAfter}s`, 429) }
    }
  }
  return { ok: true, caller }
}
