import { kv, type Kv } from '@/platform/cache/kv'

/**
 * Small bounded rate limiter shared by the edge-facing routes.
 *
 * Decisions are synchronous and local; with Redis (REDIS_URL) every hit is
 * also counted in Redis and the highest count seen across instances wins,
 * so several app instances share one limit (eventually consistent within a
 * request or two).
 */

const buckets = new Map<string, { count: number; resetAt: number }>()
const shared = new Map<string, number>()
const MAX_BUCKETS = 20_000
let redis: Kv | null = null
if (process.env.REDIS_URL && typeof window === 'undefined') void kv().then((store) => { if (store.kind === 'redis') redis = store }).catch(() => undefined)

function countShared(key: string, windowMs: number) {
  if (!redis) return
  redis.incr(`rl:${key}`, windowMs).then((count) => {
    if (shared.size > MAX_BUCKETS) shared.clear()
    shared.set(key, count)
  }).catch(() => undefined)
}

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
  countShared(key, windowMs)
  const bucket = buckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    shared.delete(key)
    return { ok: true, retryAfter: 0 }
  }
  bucket.count += 1
  if (Math.max(bucket.count, shared.get(key) || 0) > limit) return { ok: false, retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) }
  return { ok: true, retryAfter: 0 }
}
