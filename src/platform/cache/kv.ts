import { logEvent } from '@/platform/observability/logger'

/**
 * Shared key-value store for caching, rate limits and locks. With REDIS_URL
 * set, all app instances share one Redis; without it, a bounded in-process
 * store keeps a single instance fast (the default for small installs).
 */

export interface Kv {
  readonly kind: 'redis' | 'memory'
  get(key: string): Promise<string | null>
  set(key: string, value: string, ttlMs: number): Promise<void>
  del(key: string): Promise<void>
  /** Deletes every key that starts with `prefix`. */
  delPrefix(prefix: string): Promise<void>
  /** Increments a counter that expires `windowMs` after its first hit. */
  incr(key: string, windowMs: number): Promise<number>
  /** Counts one hit in a fixed window as one atomic step; `ttlMs` is what is left of the window. */
  hit(key: string, windowMs: number): Promise<{ count: number; ttlMs: number }>
  /** Sets `key` only when absent (a lock); true when this caller got it. */
  lock(key: string, ttlMs: number): Promise<boolean>
  /** Round-trip time in ms (-1 when unreachable). */
  ping(): Promise<number>
}

const PREFIX = process.env.REDIS_PREFIX || 'mobo:'
const MAX_MEMORY_KEYS = 50_000

class MemoryKv implements Kv {
  readonly kind = 'memory' as const
  private store = new Map<string, { value: string; expires: number }>()
  private sweep() {
    if (this.store.size < MAX_MEMORY_KEYS) return
    const now = Date.now()
    for (const [key, row] of this.store) if (row.expires <= now) this.store.delete(key)
    // Still full: drop the oldest entries (Map keeps insertion order).
    for (const key of this.store.keys()) { if (this.store.size < MAX_MEMORY_KEYS * 0.9) break; this.store.delete(key) }
  }
  private live(key: string) {
    const row = this.store.get(key)
    if (!row) return null
    if (row.expires <= Date.now()) { this.store.delete(key); return null }
    return row
  }
  async get(key: string) { return this.live(key)?.value ?? null }
  async set(key: string, value: string, ttlMs: number) { this.sweep(); this.store.delete(key); this.store.set(key, { value, expires: Date.now() + ttlMs }) }
  async del(key: string) { this.store.delete(key) }
  async delPrefix(prefix: string) { for (const key of this.store.keys()) if (key.startsWith(prefix)) this.store.delete(key) }
  async incr(key: string, windowMs: number) {
    const row = this.live(key)
    const next = (row ? Number(row.value) : 0) + 1
    this.sweep()
    this.store.set(key, { value: String(next), expires: row?.expires ?? Date.now() + windowMs })
    return next
  }
  async hit(key: string, windowMs: number) {
    const count = await this.incr(key, windowMs)
    return { count, ttlMs: Math.max(0, (this.store.get(key)?.expires ?? Date.now()) - Date.now()) }
  }
  async lock(key: string, ttlMs: number) { if (this.live(key)) return false; await this.set(key, '1', ttlMs); return true }
  async ping() { return 0 }
}

type RedisClient = import('ioredis').Redis

class RedisKv implements Kv {
  readonly kind = 'redis' as const
  constructor(private client: RedisClient) {}
  async get(key: string) { return this.client.get(PREFIX + key) }
  async set(key: string, value: string, ttlMs: number) { await this.client.set(PREFIX + key, value, 'PX', Math.max(1, Math.round(ttlMs))) }
  async del(key: string) { await this.client.del(PREFIX + key) }
  async delPrefix(prefix: string) {
    let cursor = '0'
    do {
      const [next, keys] = await this.client.scan(cursor, 'MATCH', `${PREFIX}${prefix.replace(/[*?[\]]/g, '\\$&')}*`, 'COUNT', 500)
      cursor = next
      if (keys.length) await this.client.del(...keys)
    } while (cursor !== '0')
  }
  async incr(key: string, windowMs: number) {
    const full = PREFIX + key
    // SET NX starts the window on the first hit (works on every Redis version), INCR counts.
    const results = await this.client.multi().set(full, '0', 'PX', Math.max(1, Math.round(windowMs)), 'NX').incr(full).exec()
    return Number(results?.[1]?.[1] ?? 0)
  }
  async hit(key: string, windowMs: number) {
    const full = PREFIX + key, window = Math.max(1, Math.round(windowMs))
    // One MULTI: the window starts, the hit is counted and the time left is read with nothing in between.
    const results = await this.client.multi().set(full, '0', 'PX', window, 'NX').incr(full).pttl(full).exec()
    if (!results) throw new Error('redis transaction was discarded')
    const failed = results.find((entry) => entry[0])
    if (failed) throw failed[0]
    const count = Number(results[1][1]), left = Number(results[2][1])
    if (!Number.isFinite(count) || count < 1) throw new Error('redis counter returned no count')
    // A counter without an expiry would block for ever; give it its window back.
    if (left < 0) await this.client.pexpire(full, window)
    return { count, ttlMs: left < 0 ? window : left }
  }
  async lock(key: string, ttlMs: number) { return (await this.client.set(PREFIX + key, '1', 'PX', Math.max(1, Math.round(ttlMs)), 'NX')) === 'OK' }
  async ping() {
    const started = performance.now()
    try { await this.client.ping(); return Math.round((performance.now() - started) * 10) / 10 } catch { return -1 }
  }
}

const globalKv = globalThis as unknown as { __mobocomKv?: Promise<Kv> }

async function connect(): Promise<Kv> {
  const url = process.env.REDIS_URL
  if (!url) return new MemoryKv()
  try {
    const { default: Redis } = await import('ioredis')
    const client = new Redis(url, { maxRetriesPerRequest: 2, enableOfflineQueue: false, lazyConnect: true, connectTimeout: 3000 })
    client.on('error', (error) => logEvent('warn', 'kv.redis_error', { error: error.message }))
    await client.connect()
    logEvent('info', 'kv.redis_connected', {})
    return new RedisKv(client)
  } catch (error) {
    // The site keeps working on the in-process store; the monitoring page shows the fallback.
    logEvent('error', 'kv.redis_unavailable', { error: error instanceof Error ? error.message : String(error) })
    return new MemoryKv()
  }
}

/** The process-wide store (connected once). */
export function kv(): Promise<Kv> {
  globalKv.__mobocomKv ??= connect()
  return globalKv.__mobocomKv
}

// ------------------------------------------------------------------ read-through cache

const local = new Map<string, { value: unknown; expires: number }>()
const inflight = new Map<string, Promise<unknown>>()
export const cacheStats = { hits: 0, misses: 0, errors: 0 }
/** Local copies are short-lived so instances converge quickly after a write elsewhere. */
const LOCAL_TTL_MS = 5_000

/**
 * Read-through cache: memory (≤5 s) → shared store → `load()`. Concurrent
 * misses for one key share a single load (no stampede). Values must be JSON.
 */
export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const now = Date.now()
  const hit = local.get(key)
  if (hit && hit.expires > now) { cacheStats.hits++; return hit.value as T }
  const pending = inflight.get(key)
  if (pending) return pending as Promise<T>
  const task = (async () => {
    const store = await kv()
    if (store.kind === 'redis') {
      const raw = await store.get(`c:${key}`).catch(() => { cacheStats.errors++; return null })
      if (raw !== null) {
        cacheStats.hits++
        const value = JSON.parse(raw, reviveBigInt) as T
        local.set(key, { value, expires: Date.now() + Math.min(LOCAL_TTL_MS, ttlMs) })
        return value
      }
    }
    cacheStats.misses++
    const value = await load()
    local.set(key, { value, expires: Date.now() + (store.kind === 'redis' ? Math.min(LOCAL_TTL_MS, ttlMs) : ttlMs) })
    if (local.size > 5000) for (const [k, row] of local) if (row.expires <= Date.now()) local.delete(k)
    if (store.kind === 'redis') await store.set(`c:${key}`, JSON.stringify(value, replaceBigInt), ttlMs).catch(() => { cacheStats.errors++ })
    return value
  })().finally(() => inflight.delete(key))
  inflight.set(key, task)
  return task
}

/** Drops cached values whose key starts with `prefix` (here and in the shared store). */
export async function invalidate(prefix: string) {
  for (const key of local.keys()) if (key.startsWith(prefix)) local.delete(key)
  const store = await kv()
  if (store.kind === 'redis') await store.delPrefix(`c:${prefix}`).catch(() => { cacheStats.errors++ })
}

function replaceBigInt(_key: string, value: unknown) { return typeof value === 'bigint' ? { __bigint: value.toString() } : value }
function reviveBigInt(_key: string, value: unknown) { return value && typeof value === 'object' && '__bigint' in (value as object) ? BigInt((value as { __bigint: string }).__bigint) : value }
