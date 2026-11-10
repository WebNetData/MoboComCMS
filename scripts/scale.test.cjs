const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript-api')

const root = path.resolve(__dirname, '..')
const cache = new Map()
/** Loads a TS module and its "@/…" imports (transpiled on the fly); `mocks` replace modules by specifier. */
function load(relative, mocks = {}) {
  const file = path.resolve(root, `${relative}.ts`)
  if (cache.has(file)) return cache.get(file)
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  const mod = { exports: {} }
  cache.set(file, mod.exports)
  const req = (spec) => (spec in mocks ? mocks[spec] : spec.startsWith('@/') ? load(`src/${spec.slice(2)}`, mocks) : require(spec))
  new Function('require', 'module', 'exports', source)(req, mod, mod.exports)
  cache.set(file, mod.exports)
  return mod.exports
}

test('memory store: TTL, counters, locks and prefixes', async () => {
  delete process.env.REDIS_URL
  const { kv } = load('src/platform/cache/kv')
  const store = await kv()
  assert.equal(store.kind, 'memory')
  await store.set('a:1', 'x', 50)
  assert.equal(await store.get('a:1'), 'x')
  await new Promise((r) => setTimeout(r, 70))
  assert.equal(await store.get('a:1'), null)
  assert.equal(await store.incr('n', 1000), 1)
  assert.equal(await store.incr('n', 1000), 2)
  assert.equal(await store.lock('L', 1000), true)
  assert.equal(await store.lock('L', 1000), false)
  await store.set('p:1', '1', 1000); await store.set('p:2', '2', 1000); await store.set('q:1', '3', 1000)
  await store.delPrefix('p:')
  assert.equal(await store.get('p:1'), null)
  assert.equal(await store.get('q:1'), '3')
})

test('read-through cache shares one load between concurrent misses and invalidates by prefix', async () => {
  const { cached, invalidate } = load('src/platform/cache/kv')
  let loads = 0
  const loader = async () => { loads++; await new Promise((r) => setTimeout(r, 20)); return { value: 42, big: 7n } }
  const [a, b, c] = await Promise.all([cached('t:x', 10_000, loader), cached('t:x', 10_000, loader), cached('t:x', 10_000, loader)])
  assert.equal(loads, 1)
  assert.deepEqual([a.value, b.value, c.value], [42, 42, 42])
  await cached('t:x', 10_000, loader)
  assert.equal(loads, 1)
  await invalidate('t:')
  await cached('t:x', 10_000, loader)
  assert.equal(loads, 2)
})

test('rate limiter blocks over the limit and resets after the window', async () => {
  const { rateLimitHit } = load('src/platform/http/rate-limit')
  for (let i = 0; i < 3; i++) assert.equal(rateLimitHit('rl-test', 3, 60).ok, true)
  assert.equal(rateLimitHit('rl-test', 3, 60).ok, false)
  await new Promise((r) => setTimeout(r, 80))
  assert.equal(rateLimitHit('rl-test', 3, 60).ok, true)
})

test('web vitals: percentiles and Google thresholds', () => {
  const m = load('src/modules/operations/server/monitoring', {
    '@/platform/database/prisma': { db: {} }, 'node:os': require('node:os'), 'node:fs/promises': require('node:fs/promises'),
    '@/modules/operations/server/queue': { queueOverview: async () => ({}) },
  })
  assert.equal(m.percentile([], 75), 0)
  assert.equal(m.percentile([100, 200, 300, 400], 75), 300)
  assert.equal(m.percentile([5], 99), 5)
  assert.equal(m.rateVital('LCP', 2400), 'good')
  assert.equal(m.rateVital('LCP', 3000), 'needs')
  assert.equal(m.rateVital('LCP', 5000), 'poor')
  assert.equal(m.rateVital('CLS', 0.05), 'good')
  assert.equal(m.rateVital('INP', 600), 'poor')
})

test('settings are cached and invalidated on writes from anywhere; queue and CDN wiring', () => {
  const settings = fs.readFileSync(path.join(root, 'src/modules/settings/server.ts'), 'utf8')
  assert.match(settings, /cached\('settings:all'/)
  assert.match(settings, /startsWith: 'lease\.'/)
  const prisma = fs.readFileSync(path.join(root, 'src/platform/database/prisma.ts'), 'utf8')
  assert.match(prisma, /params\.model === 'Setting' && WRITES\.has\(params\.action\)/)
  assert.match(prisma, /recordQuery\(/)
  const scheduler = fs.readFileSync(path.join(root, 'src/modules/notifications/server/jobs-scheduler.ts'), 'utf8')
  assert.match(scheduler, /name: 'queue'/)
  const config = fs.readFileSync(path.join(root, 'next.config.js'), 'utf8')
  assert.match(config, /assetPrefix: process\.env\.CDN_URL/)
  assert.ok(fs.existsSync(path.join(root, 'scripts/load-test.mjs')))
})

test('the strict rate limit: Redis decides, an outage falls back to what this process counted', async () => {
  const { rateLimitStrict } = load('src/platform/http/rate-limit')
  // kv.ts keeps its store in one process-wide state object (audit 2026-11-10: it can reconnect).
  const kvState = globalThis.__mobocomKvState
  const before = kvState.store
  // A stand-in for Redis that already holds hits made through other instances.
  const counts = new Map()
  let down = false, calls = 0
  const fake = { kind: 'redis', hit: async (key) => { calls += 1; if (down) throw new Error('connection lost'); counts.set(key, (counts.get(key) || 0) + 1); return { count: counts.get(key), ttlMs: 42_000 } } }
  try {
    kvState.store = Promise.resolve(fake)
    counts.set('rls:strict-a', 4)
    assert.deepEqual(await rateLimitStrict('strict-a', 5, 60_000), { ok: true, retryAfter: 0 })
    assert.deepEqual(await rateLimitStrict('strict-a', 5, 60_000), { ok: false, retryAfter: 42 }, 'the shared count refuses although this process saw two hits')
    // Hits counted while Redis answered still count when it stops answering.
    for (let i = 0; i < 3; i++) assert.equal((await rateLimitStrict('strict-b', 3, 60_000)).ok, true)
    down = true
    assert.equal((await rateLimitStrict('strict-b', 3, 60_000)).ok, false, 'an outage is not a fresh allowance')
    assert.equal((await rateLimitStrict('strict-c', 1, 60_000)).ok, true)
    assert.equal((await rateLimitStrict('strict-c', 1, 60_000)).ok, false, 'during an outage the process still limits by itself')
    down = false
    // Without Redis the process count is the whole truth and the shared counter is not asked.
    calls = 0
    kvState.store = Promise.resolve({ kind: 'memory', hit: async () => { calls += 1; return { count: 1, ttlMs: 1 } } })
    assert.equal((await rateLimitStrict('strict-d', 1, 60_000)).ok, true)
    assert.equal((await rateLimitStrict('strict-d', 1, 60_000)).ok, false)
    assert.equal(calls, 0)
  } finally { kvState.store = before }
})

test('the memory store counts a hit with the time left in its window', async () => {
  delete process.env.REDIS_URL
  const before = globalThis.__mobocomKv
  delete globalThis.__mobocomKv
  try {
    const store = await load('src/platform/cache/kv').kv()
    const first = await store.hit('hit-test', 5_000), second = await store.hit('hit-test', 5_000)
    assert.deepEqual([first.count, second.count], [1, 2])
    assert.ok(second.ttlMs > 0 && second.ttlMs <= 5_000)
  } finally { globalThis.__mobocomKv = before }
})

test('every limit that guards a secret is the strict one', () => {
  const guarded = /rateLimitHit\(`(login:|email-otp:|sms:otp:|2fa:|reset:|pwd-change:|register:|gift-redeem|club-redeem:|api-key:|install:|promotion:quote:)/
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? walk(path.join(dir, entry.name)) : /\.tsx?$/.test(entry.name) ? [path.join(dir, entry.name)] : [])
  const loose = walk(path.join(root, 'src')).filter((file) => guarded.test(fs.readFileSync(file, 'utf8')))
  assert.deepEqual(loose.map((file) => path.relative(root, file)), [])
  const strict = (file) => (fs.readFileSync(path.join(root, file), 'utf8').match(/await rateLimitStrict\(/g) || []).length
  assert.deepEqual([strict('src/modules/identity/auth.ts'), strict('src/modules/identity/server/account-security.ts'), strict('src/modules/store/server/http/marketing.ts'), strict('src/modules/public-api/server/api-keys.ts')], [6, 6, 3, 1], 'auth.ts: password ×3, SMS code, email code, Google ticket')
  assert.equal(strict('src/modules/identity/server/email-otp.ts'), 1, 'email issuance enforces all three strict buckets')
  assert.equal(strict('src/modules/sms/server/sms.ts'), 2, 'SMS issuance has strict recipient/IP limits')
})

test("a configured Redis that does not answer: the site falls back, says so, reconnects, and sensitive limits never open (audit 2026-11-10, P1)", async () => {
  // A stand-in for ioredis on a shared fake server, so two separately loaded "instances" see the same data.
  const server = { up: false, data: new Map(), ttl: new Map(), clients: [] }
  // Like ioredis: `status` is "ready" on a live connection; losing the server emits "close", getting it back "ready".
  const setUp = (up) => { server.up = up; for (const client of server.clients) if (client.connected) (client.handlers[up ? "ready" : "close"] || (() => {}))() }
  class FakeRedis {
    constructor() { this.handlers = {}; this.connected = false; server.clients.push(this) }
    get status() { return this.connected && server.up ? "ready" : this.connected ? "reconnecting" : "wait" }
    on(event, fn) { this.handlers[event] = fn; return this }
    async connect() { if (!server.up) throw new Error("connect ECONNREFUSED 127.0.0.1:6379"); this.connected = true }
    disconnect() { this.closed = true }
    async ping() { if (!server.up) throw new Error("offline"); return "PONG" }
    multi() {
      const ops = []
      const chain = {
        set: (key, value, _px, ms, nx) => { ops.push(() => { if (nx && server.data.has(key)) return null; server.data.set(key, value); server.ttl.set(key, ms); return "OK" }); return chain },
        incr: (key) => { ops.push(() => { const n = Number(server.data.get(key) || 0) + 1; server.data.set(key, String(n)); return n }); return chain },
        pttl: (key) => { ops.push(() => server.ttl.get(key) ?? -1); return chain },
        exec: async () => { if (!server.up) throw new Error("connection lost"); return ops.map((op) => [null, op()]) },
      }
      return chain
    }
  }
  const logs = []
  const instance = () => {
    // Each instance is a fresh module graph with its own process-wide state, as a second server would have.
    const graph = new Map()
    const mocks = { ioredis: { default: FakeRedis, __esModule: true }, "@/platform/observability/logger": { logEvent: (level, event, fields) => logs.push({ level, event, fields }) } }
    const own = (relative) => {
      const file = path.resolve(root, relative + ".ts")
      if (graph.has(file)) return graph.get(file)
      const mod = { exports: {} }; graph.set(file, mod.exports)
      const source = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
      new Function("require", "module", "exports", source)((spec) => spec in mocks ? mocks[spec] : spec.startsWith("@/") ? own("src/" + spec.slice(2)) : require(spec), mod, mod.exports)
      graph.set(file, mod.exports)
      return mod.exports
    }
    const saved = globalThis.__mobocomKvState
    delete globalThis.__mobocomKvState
    const kv = own("src/platform/cache/kv"), limits = own("src/platform/http/rate-limit")
    const state = globalThis.__mobocomKvState
    globalThis.__mobocomKvState = saved
    // Run each call of this instance with its own state in place.
    const within = (fn) => async (...args) => { const outer = globalThis.__mobocomKvState; globalThis.__mobocomKvState = state; try { return await fn(...args) } finally { globalThis.__mobocomKvState = outer } }
    return { kv: within(kv.kv), health: within(kv.kvHealth), reconnect: within(kv.reconnectKv), strict: within(limits.rateLimitStrict), state }
  }
  const before = process.env.REDIS_URL
  process.env.REDIS_URL = "redis://127.0.0.1:6379"
  try {
    const a = instance(), b = instance()
    // Down at start: each falls back, reports it and keeps trying.
    assert.equal((await a.kv()).kind, "memory")
    const health = await a.health()
    assert.equal(health.degraded, true); assert.ok(health.degradedSince); assert.match(health.lastError, /ECONNREFUSED/)
    assert.equal(logs.filter((l) => l.event === "kv.redis_unavailable").length, 1, "the outage is logged once, not per call")
    assert.ok(a.state.timer, "a reconnect is scheduled")
    clearTimeout(a.state.timer); a.state.timer = null
    // While down, a limit that guards a secret counts in each instance and stays closed.
    for (let i = 0; i < 3; i++) assert.equal((await a.strict("login:acc:x", 3, 60_000)).ok, true)
    assert.equal((await a.strict("login:acc:x", 3, 60_000)).ok, false, "never opens during the outage")
    // Redis comes back: both instances switch to it and share one limit.
    setUp(true)
    assert.equal(await a.reconnect(), true); assert.equal(await b.reconnect(), true)
    assert.equal((await a.kv()).kind, "redis"); assert.equal((await b.health()).degraded, false)
    assert.ok(logs.some((l) => l.event === "kv.redis_recovered"))
    const spread = [await a.strict("otp:y", 3, 60_000), await b.strict("otp:y", 3, 60_000), await a.strict("otp:y", 3, 60_000), await b.strict("otp:y", 3, 60_000)]
    assert.deepEqual(spread.map((r) => r.ok), [true, true, true, false], "the fourth hit is refused whichever instance it reaches")
    // Redis drops again mid-run: noticed from the connection, the store falls back, the local count still limits.
    setUp(false)
    assert.equal((await b.health()).degraded, true, "a runtime outage is reported")
    assert.ok(logs.some((l) => l.event === "kv.redis_lost"), "and logged at once")
    for (let i = 0; i < 2; i++) await b.strict("pwd:z", 2, 60_000)
    assert.equal((await b.strict("pwd:z", 2, 60_000)).ok, false, "an outage is not a fresh allowance")
    // Back again: Redis decides once more.
    setUp(true)
    assert.equal((await b.health()).degraded, false); assert.equal((await b.kv()).kind, "redis")
    assert.ok(logs.some((l) => l.event === "kv.redis_recovered"))
    clearTimeout(b.state.timer)
  } finally {
    if (before === undefined) delete process.env.REDIS_URL; else process.env.REDIS_URL = before
  }
})
