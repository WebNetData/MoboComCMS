import { randomBytes } from 'node:crypto'
import { gunzipSync, gzipSync } from 'node:zlib'
import { db } from '@/platform/database/prisma'
import { logEvent } from '@/platform/observability/logger'
import { publish, subscribe } from '@/platform/realtime/bus'
import {
  DEFAULT_PAGECACHE, cacheControl, decide, freshness, mbToBytes, normalizePageCache, viewTarget, warmPaths,
  type Decision, type PageCacheConfig, type RequestInfo,
} from '@/modules/performance/domain/pagecache'

/**
 * Guest page cache (micro-cache) in front of the app's pages.
 *
 * The middleware asks `pageCacheHandle` for every page request. A visitor
 * without a session or cart gets a stored copy of the page (HIT); a missing or
 * expired one is rendered once by the app itself through an internal request
 * and stored (MISS) — concurrent visitors share that single render. A stale
 * copy is served at once and refreshed in the background (STALE), and when the
 * app cannot render at all the last good copy keeps the site up.
 *
 * State lives on `globalThis` because the middleware, the route handlers and
 * the scheduler are separate bundles in one process. Instances share purges
 * through the realtime bus (Redis pub/sub when REDIS_URL is set).
 */

const KEY = 'performance.pagecache.v1'
const PURGE_CHANNEL = 'pagecache:purge'
const MAX_BODY = 2_000_000
const FILL_TIMEOUT_MS = 25_000
const CONFIG_TTL_MS = 5_000

interface Entry { gz: Buffer; status: number; type: string; robots: string; at: number; ttl: number; size: number; hits: number; path: string; fillMs: number }
interface Stats { hits: number; misses: number; stale: number; errorServes: number; fills: number; fillErrors: number; bypass: Record<string, number>; evictions: number; purges: number }
interface State {
  entries: Map<string, Entry>
  bytes: number
  inflight: Map<string, Promise<FillResult>>
  stats: Stats
  fillTimes: number[]
  config: { value: PageCacheConfig; at: number } | null
  token: string
  port: string
  subscribed: boolean
  purgeTimers: ReturnType<typeof setTimeout>[]
  views: Map<string, number>
  viewTimer: ReturnType<typeof setTimeout> | null
  lastPurge: { at: number; reason: string; entries: number } | null
  lastWarm: { at: number; pages: number; ms: number } | null
}

const g = globalThis as unknown as { __mobocomPageCache?: State }
const newStats = (): Stats => ({ hits: 0, misses: 0, stale: 0, errorServes: 0, fills: 0, fillErrors: 0, bypass: {}, evictions: 0, purges: 0 })
export const cacheState = (): State => (g.__mobocomPageCache ??= {
  entries: new Map(), bytes: 0, inflight: new Map(), stats: newStats(), fillTimes: [], config: null, token: randomBytes(16).toString('hex'), port: '',
  subscribed: false, purgeTimers: [], views: new Map(), viewTimer: null, lastPurge: null, lastWarm: null,
})

// ------------------------------------------------------------------ settings

/** The stored settings (read every few seconds, so a change reaches every bundle quickly). */
export async function getPageCacheConfig(force = false): Promise<PageCacheConfig> {
  const s = cacheState()
  if (!force && s.config && Date.now() - s.config.at < CONFIG_TTL_MS) return s.config.value
  try {
    const row = await db.setting.findUnique({ where: { key: KEY } })
    const value = row ? normalizePageCache(JSON.parse(row.value)) : DEFAULT_PAGECACHE
    s.config = { value, at: Date.now() }
    return value
  } catch {
    // Keep serving with the last known settings when the database hiccups.
    return s.config?.value || DEFAULT_PAGECACHE
  }
}

export async function savePageCacheConfig(input: Record<string, unknown>): Promise<PageCacheConfig> {
  const previous = await getPageCacheConfig(true)
  const next = normalizePageCache(input, previous)
  const value = JSON.stringify(next)
  await db.setting.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } })
  cacheState().config = { value: next, at: Date.now() }
  // Settings decide what is cached: start from a clean slate.
  await purgeAll('settings')
  return next
}

// ------------------------------------------------------------------ store

function put(key: string, entry: Entry, config: PageCacheConfig) {
  const s = cacheState()
  const budget = mbToBytes(config.maxMemoryMb)
  if (entry.size > budget) return
  const old = s.entries.get(key)
  if (old) { s.bytes -= old.size; s.entries.delete(key) }
  s.entries.set(key, entry)
  s.bytes += entry.size
  // Least recently used pages go first (a Map keeps insertion order; hits re-insert).
  for (const [k, e] of s.entries) {
    if (s.bytes <= budget) break
    s.entries.delete(k); s.bytes -= e.size; s.stats.evictions++
  }
}

function touch(key: string, entry: Entry) {
  const s = cacheState()
  s.entries.delete(key)
  s.entries.set(key, entry)
}

async function ensureSubscribed() {
  const s = cacheState()
  if (s.subscribed) return
  s.subscribed = true
  // Purges from other instances (or another bundle) empty this store too.
  await subscribe(PURGE_CHANNEL, (event) => { if (event.from !== s.token) clearLocal(String(event.reason || 'remote')) }).catch(() => { s.subscribed = false })
}

function clearLocal(reason: string) {
  const s = cacheState()
  const count = s.entries.size
  s.entries.clear(); s.bytes = 0
  s.stats.purges++
  s.lastPurge = { at: Date.now(), reason, entries: count }
  return count
}

/** Empties the cache here and on every other instance. */
export async function purgeAll(reason = 'manual') {
  const count = clearLocal(reason)
  await publish(PURGE_CHANNEL, { type: 'purge', reason, from: cacheState().token })
  return count
}

/** Removes the pages under one path prefix ("/blog") on this instance. */
export function purgePrefix(prefix: string) {
  const s = cacheState()
  let count = 0
  for (const [key, entry] of s.entries) {
    if (entry.path === prefix || entry.path.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`)) { s.entries.delete(key); s.bytes -= entry.size; count++ }
  }
  s.lastPurge = { at: Date.now(), reason: `prefix ${prefix}`, entries: count }
  return count
}

/**
 * After an admin change: purge now-ish and once more later, so a save that is
 * still running when the first purge happens is not served stale afterwards.
 */
export function purgeSoon(reason = 'admin-change') {
  const s = cacheState()
  if (s.purgeTimers.length) return
  for (const delay of [1500, 9000]) {
    const timer = setTimeout(() => { s.purgeTimers = s.purgeTimers.filter((t) => t !== timer); void purgeAll(reason) }, delay)
    timer.unref?.()
    s.purgeTimers.push(timer)
  }
}

// ------------------------------------------------------------------ views

const VIEW_DELEGATE = {
  post: () => db.post, product: () => db.product, software: () => db.softwareTitle, game: () => db.gameTitle, title: () => db.cinemaTitle, album: () => db.musicAlbum,
} as const

/** A page served from the cache is still a visit: counted here, written in batches. */
function countView(path: string) {
  const target = viewTarget(path)
  if (!target) return
  const s = cacheState()
  const key = `${target.model}:${target.slug}`
  s.views.set(key, (s.views.get(key) || 0) + 1)
  if (s.viewTimer) return
  s.viewTimer = setTimeout(() => { s.viewTimer = null; void flushViews() }, 20_000)
  s.viewTimer.unref?.()
}

export async function flushViews() {
  const s = cacheState()
  const batch = [...s.views]
  s.views.clear()
  for (const [key, count] of batch) {
    const [model, ...rest] = key.split(':')
    const delegate = VIEW_DELEGATE[model as keyof typeof VIEW_DELEGATE]?.() as { updateMany: (args: unknown) => Promise<unknown> } | undefined
    if (delegate) await delegate.updateMany({ where: { slug: rest.join(':') }, data: { views: { increment: count } } }).catch(() => undefined)
  }
}

// ------------------------------------------------------------------ fill

type FillResult = { entry: Entry } | { pass: Response } | { failed: true }

const HOP = new Set(['content-encoding', 'content-length', 'transfer-encoding', 'connection', 'keep-alive'])

function originFor(port: string) { return `http://127.0.0.1:${process.env.PORT || port || cacheState().port || '3000'}` }

/** Renders one page through the app itself (as an anonymous visitor) and stores it. */
async function render(key: string, d: Extract<Decision, { cache: true }>, ctx: { host: string; fetchPath: string; proto: string; port: string; userAgent: string }, config: PageCacheConfig): Promise<FillResult> {
  const s = cacheState()
  const started = performance.now()
  try {
    const cookie = [d.lang && `lang=${d.lang}`, d.theme && `theme=${d.theme}`].filter(Boolean).join('; ')
    const response = await fetch(`${originFor(ctx.port)}${ctx.fetchPath}${d.canonicalSearch}`, {
      redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(FILL_TIMEOUT_MS),
      headers: {
        host: ctx.host, accept: 'text/html,application/xhtml+xml', 'accept-encoding': 'identity', 'user-agent': ctx.userAgent || 'MoboComPageCache/1.0',
        'x-forwarded-proto': ctx.proto, 'x-forwarded-host': ctx.host, 'x-pagecache-fill': s.token, ...(cookie ? { cookie } : {}),
      },
    })
    const ms = Math.round(performance.now() - started)
    const type = response.headers.get('content-type') || ''
    const cacheable = (response.status === 200 || response.status === 404) && /text\/html/i.test(type) && !response.headers.has('set-cookie')
    if (response.status >= 500) { await response.body?.cancel().catch(() => undefined); s.stats.fillErrors++; return { failed: true } }
    if (!cacheable) {
      // Redirects, other statuses and personalised answers go to the visitor as they are, uncached.
      const headers = new Headers()
      response.headers.forEach((value, name) => { if (!HOP.has(name.toLowerCase())) headers.append(name, value) })
      return { pass: new Response(response.status === 204 || response.status === 304 ? null : await response.arrayBuffer(), { status: response.status, headers }) }
    }
    const body = Buffer.from(await response.arrayBuffer())
    if (body.length > MAX_BODY) return { pass: new Response(body, { status: response.status, headers: { 'content-type': type } }) }
    const gz = gzipSync(body, { level: 6 })
    // A missing page is remembered briefly so crawlers cannot make the app render it again and again.
    const ttl = response.status === 404 ? Math.min(d.ttl, 30) : d.ttl
    const entry: Entry = { gz, status: response.status, type, robots: response.headers.get('x-robots-tag') || '', at: Date.now(), ttl, size: gz.length + key.length + 200, hits: 0, path: d.path, fillMs: ms }
    put(key, entry, config)
    s.stats.fills++
    s.fillTimes.push(ms)
    if (s.fillTimes.length > 300) s.fillTimes.shift()
    return { entry }
  } catch (error) {
    s.stats.fillErrors++
    logEvent('warn', 'pagecache.fill_failed', { path: d.path, error: error instanceof Error ? error.message : String(error) })
    return { failed: true }
  }
}

/** One render per page at a time; everyone waiting for it shares the result. */
function fillOnce(key: string, d: Extract<Decision, { cache: true }>, ctx: Parameters<typeof render>[2], config: PageCacheConfig) {
  const s = cacheState()
  const running = s.inflight.get(key)
  if (running) return running
  const task = render(key, d, ctx, config).finally(() => s.inflight.delete(key))
  s.inflight.set(key, task)
  return task
}

// ------------------------------------------------------------------ serving

function serve(entry: Entry, state: 'HIT' | 'MISS' | 'STALE' | 'STALE-ERROR', config: PageCacheConfig): Response {
  // The body goes out plain: Next compresses middleware responses itself and drops a Content-Encoding
  // set here, which would leave the browser with unreadable gzip bytes. Memory keeps the compressed copy.
  const headers = new Headers({ 'content-type': entry.type, 'cache-control': cacheControl(config, entry.ttl), vary: config.edgeHeaders ? 'Accept-Encoding, Cookie' : 'Accept-Encoding' })
  if (entry.robots) headers.set('x-robots-tag', entry.robots)
  if (config.debugHeaders) { headers.set('x-cache', state); headers.set('x-cache-age', String(Math.round((Date.now() - entry.at) / 1000))) }
  return new Response(new Uint8Array(gunzipSync(entry.gz)), { status: entry.status, headers })
}

export interface HandleInput {
  request: Request
  /** The page's own path after section addresses are resolved (what the app renders). */
  canonicalPath: string
  /** The address the visitor used (what the app is asked for). */
  publicPath: string
  search: string
  host: string
  port: string
  proto: string
}

/**
 * The response for a guest page request, or null to let the app answer.
 * Called by the middleware for every GET/HEAD page request.
 */
export async function pageCacheHandle(input: HandleInput): Promise<Response | null> {
  const s = cacheState()
  const config = await getPageCacheConfig()
  if (config.mode === 'off') return null
  const h = input.request.headers
  const info: RequestInfo = {
    method: input.request.method, pathname: input.canonicalPath, search: input.search, host: input.host, cookie: h.get('cookie') || '', accept: h.get('accept') || '',
    rsc: h.has('rsc') || h.has('next-router-prefetch') || h.has('next-router-state-tree') || h.has('next-action'), fill: !!h.get('x-pagecache-fill') && h.get('x-pagecache-fill') === s.token,
  }
  const d = decide(config, info)
  if (!d.cache) {
    if (d.reason !== 'fill' && d.reason !== 'off') s.stats.bypass[d.reason] = (s.stats.bypass[d.reason] || 0) + 1
    return null
  }
  if (input.port) s.port = input.port
  await ensureSubscribed()
  const ctx = { host: input.host, fetchPath: input.publicPath, proto: input.proto, port: input.port, userAgent: h.get('user-agent') || '' }
  const entry = s.entries.get(d.key)
  const state = entry ? freshness(config, entry.ttl, (Date.now() - entry.at) / 1000) : 'expired'

  if (entry && state === 'fresh') {
    entry.hits++; s.stats.hits++; touch(d.key, entry); countView(d.path)
    return serve(entry, 'HIT', config)
  }
  if (entry && state === 'stale') {
    entry.hits++; s.stats.stale++; touch(d.key, entry); countView(d.path)
    void fillOnce(d.key, d, ctx, config)
    return serve(entry, 'STALE', config)
  }
  // The visitor whose request starts the render is counted by the app; those who join it are counted here.
  const joined = s.inflight.has(d.key)
  const result = await fillOnce(d.key, d, ctx, config)
  if ('entry' in result) {
    s.stats.misses++
    if (joined) countView(d.path)
    return serve(result.entry, 'MISS', config)
  }
  if ('pass' in result) return result.pass
  // The app could not render: the last good copy keeps the page available.
  if (entry && state !== 'expired') {
    s.stats.errorServes++
    return serve(entry, 'STALE-ERROR', config)
  }
  return null
}

// ------------------------------------------------------------------ warm-up & report

/** Public address of the site for warm-up requests (its host is part of every key). */
async function siteHost(): Promise<{ host: string; proto: string }> {
  const { siteBaseUrl } = await import('@/modules/site/server/site-url')
  try { const url = new URL(await siteBaseUrl()); return { host: url.host, proto: url.protocol.replace(':', '') } } catch { return { host: `localhost:${process.env.PORT || '3000'}`, proto: 'http' } }
}

/** Renders the sections' entry pages ahead of visitors (after a purge, on a schedule). */
export async function warmPages(options: { force?: boolean } = {}) {
  const config = await getPageCacheConfig()
  if (config.mode === 'off') return { pages: 0, ms: 0 }
  const s = cacheState()
  const started = Date.now()
  const { host, proto } = await siteHost()
  // Sections may be published under another address (/game for /games): ask the app for the public one.
  const { loadRouteAliases } = await import('@/modules/site/server/routes')
  const { routeDecision } = await import('@/platform/routing/aliases')
  const aliases = await loadRouteAliases().catch(() => ({}))
  const paths = warmPaths(config).slice(0, config.warmLimit)
  let done = 0
  const one = async (path: string) => {
    const d = decide(config, { method: 'GET', pathname: path, search: '', host, cookie: '', accept: 'text/html', rsc: false, fill: false })
    if (!d.cache) return
    const existing = s.entries.get(d.key)
    if (!options.force && existing && (Date.now() - existing.at) / 1000 < d.ttl / 2) return
    const route = routeDecision(path, aliases)
    const result = await fillOnce(d.key, d, { host, fetchPath: route?.kind === 'redirect' ? route.path : path, proto, port: '', userAgent: 'MoboComPageCache/1.0 (warm)' }, config)
    if ('entry' in result) done++
  }
  // Two at a time: warming must never compete with visitors.
  const queue = [...paths]
  await Promise.all([0, 1].map(async () => { for (let path = queue.shift(); path; path = queue.shift()) await one(path) }))
  s.lastWarm = { at: Date.now(), pages: done, ms: Date.now() - started }
  return s.lastWarm
}

/** Scheduler entry: keeps the entry pages warm at the configured interval. */
export async function runWarmJob() {
  const config = await getPageCacheConfig()
  if (config.mode === 'off' || !config.warm) return
  const s = cacheState()
  if (s.lastWarm && Date.now() - s.lastWarm.at < config.warmIntervalMinutes * 60_000 - 20_000) return
  await warmPages()
}

const percentile = (values: number[], p: number) => {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]
}

export function pageCacheReport() {
  const s = cacheState()
  const served = s.stats.hits + s.stats.stale + s.stats.misses
  const top = [...s.entries.values()].sort((a, b) => b.hits - a.hits).slice(0, 12).map((e) => ({ path: e.path, hits: e.hits, kb: Math.round(e.size / 102.4) / 10, ageSeconds: Math.round((Date.now() - e.at) / 1000), fillMs: e.fillMs, status: e.status }))
  return {
    entries: s.entries.size, bytes: s.bytes, hits: s.stats.hits, stale: s.stats.stale, misses: s.stats.misses, errorServes: s.stats.errorServes, fills: s.stats.fills, fillErrors: s.stats.fillErrors,
    evictions: s.stats.evictions, purges: s.stats.purges, hitRate: served ? Math.round(((s.stats.hits + s.stats.stale) / served) * 100) : 0, bypass: s.stats.bypass,
    fillP50: percentile(s.fillTimes, 50), fillP95: percentile(s.fillTimes, 95), top, lastPurge: s.lastPurge, lastWarm: s.lastWarm, pendingViews: [...s.views.values()].reduce((a, b) => a + b, 0),
  }
}

export function resetPageCacheStats() {
  const s = cacheState()
  s.stats = newStats(); s.fillTimes = []
}
