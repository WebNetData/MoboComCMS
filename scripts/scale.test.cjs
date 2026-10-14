const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

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
  const before = globalThis.__mobocomKv
  // A stand-in for Redis that already holds hits made through other instances.
  const counts = new Map()
  let down = false, calls = 0
  const fake = { kind: 'redis', hit: async (key) => { calls += 1; if (down) throw new Error('connection lost'); counts.set(key, (counts.get(key) || 0) + 1); return { count: counts.get(key), ttlMs: 42_000 } } }
  try {
    globalThis.__mobocomKv = Promise.resolve(fake)
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
    globalThis.__mobocomKv = Promise.resolve({ kind: 'memory', hit: async () => { calls += 1; return { count: 1, ttlMs: 1 } } })
    assert.equal((await rateLimitStrict('strict-d', 1, 60_000)).ok, true)
    assert.equal((await rateLimitStrict('strict-d', 1, 60_000)).ok, false)
    assert.equal(calls, 0)
  } finally { globalThis.__mobocomKv = before }
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
  const guarded = /rateLimitHit\(`(login:|2fa:|reset:|pwd-change:|register:|gift-redeem|club-redeem:|api-key:|install:|promotion:quote:)/
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? walk(path.join(dir, entry.name)) : /\.tsx?$/.test(entry.name) ? [path.join(dir, entry.name)] : [])
  const loose = walk(path.join(root, 'src')).filter((file) => guarded.test(fs.readFileSync(file, 'utf8')))
  assert.deepEqual(loose.map((file) => path.relative(root, file)), [])
  const strict = (file) => (fs.readFileSync(path.join(root, file), 'utf8').match(/await rateLimitStrict\(/g) || []).length
  assert.deepEqual([strict('src/modules/identity/auth.ts'), strict('src/modules/identity/server/account-security.ts'), strict('src/modules/store/server/http/marketing.ts'), strict('src/modules/public-api/server/api-keys.ts')], [4, 6, 3, 1])
})
