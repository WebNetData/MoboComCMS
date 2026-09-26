/**
 * Small bounded in-memory rate limiter shared by the edge-facing routes.
 *
 * Buckets live in the process: this is a guard rail, not a distributed
 * limiter. Put a shared limiter (Redis, edge WAF) in front before
 * multi-instance deployments.
 */

const buckets = new Map<string, { count: number; resetAt: number }>()
const MAX_BUCKETS = 20_000

/**
 * Best-effort client IP. Earlier x-forwarded-for entries are
 * client-controlled and trivially spoofed, so the right-most entry (appended
 * by the closest trusted proxy) is used.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')
  if (forwarded) {
    const parts = forwarded.split(',').map((part) => part.trim()).filter(Boolean)
    if (parts.length) return parts[parts.length - 1]
  }
  return headers.get('x-real-ip')?.trim() || 'local'
}

/** Consumes one hit for `key`; returns whether the request may proceed. */
export function rateLimitHit(key: string, limit: number, windowMs = 60_000): { ok: boolean; retryAfter: number } {
  const now = Date.now()
  if (buckets.size >= MAX_BUCKETS) {
    for (const [bucketKey, value] of buckets) if (value.resetAt <= now) buckets.delete(bucketKey)
    if (buckets.size >= MAX_BUCKETS && !buckets.has(key)) return { ok: false, retryAfter: 60 }
  }
  const bucket = buckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { ok: true, retryAfter: 0 }
  }
  bucket.count += 1
  if (bucket.count > limit) return { ok: false, retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) }
  return { ok: true, retryAfter: 0 }
}
