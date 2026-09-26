import { randomUUID } from 'node:crypto'
import { clientIp } from '@/platform/http/rate-limit'

interface TurnstileResponse {
  success?: boolean
  hostname?: string
  action?: string
  'error-codes'?: string[]
}

export function turnstileConfigured() {
  return Boolean(process.env.TURNSTILE_SECRET_KEY)
}

/** Validate a single-use Cloudflare Turnstile token at the origin. */
export async function verifyTurnstile(token: unknown, headers: Headers, expectedAction: 'login' | 'register') {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim()
  if (!secret) return true
  const response = String(token || '').trim()
  if (!response || response.length > 2048) return false

  try {
    const result = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret,
        response,
        remoteip: clientIp(headers),
        idempotency_key: randomUUID(),
      }),
      signal: AbortSignal.timeout(8_000),
      cache: 'no-store',
    })
    if (!result.ok) return false
    const data = await result.json() as TurnstileResponse
    if (!data.success || data.action !== expectedAction) return false
    const expectedHostname = process.env.TURNSTILE_EXPECTED_HOSTNAME?.trim().toLowerCase()
    if (expectedHostname && data.hostname?.toLowerCase() !== expectedHostname) return false
    return true
  } catch {
    // Authentication must fail closed when Turnstile is configured.
    return false
  }
}
