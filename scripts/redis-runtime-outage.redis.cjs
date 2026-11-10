// A Redis that was connected and stops while the site runs, then comes back (audit 2026-11-10, owner follow-up to #421).
// Against a real Redis (REDIS_URL). Another process stops and starts that Redis; this script waits for it through marker
// files in REDIS_OUTAGE_CONTROL:
//   it writes  connected → (waits for) stopped → it writes degraded → (waits for) started → it writes recovered
// Skipped without REDIS_URL. Keys use a random REDIS_PREFIX.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), ts = require('typescript-api')

if (!process.env.REDIS_URL) { console.log('redis-runtime-outage: skipped (REDIS_URL is not set)'); process.exit(0) }
process.env.REDIS_PREFIX = `qa-outage-${crypto.randomUUID().slice(0, 8)}:`
const control = process.env.REDIS_OUTAGE_CONTROL || '/tmp/redis-outage'
fs.mkdirSync(control, { recursive: true })
const mark = (name) => { fs.writeFileSync(path.join(control, name), String(Date.now())); console.log(`phase: ${name}`) }
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
async function waitFor(name, ms = 180_000) { const end = Date.now() + ms; while (!fs.existsSync(path.join(control, name))) { if (Date.now() > end) throw new Error(`no ${name} marker`); await sleep(250) } }
async function until(check, ms, label) { const end = Date.now() + ms; let last; while (Date.now() < end) { try { last = await check(); if (last === true) return } catch (error) { last = error.message } await sleep(250) } throw new Error(`${label} (last: ${JSON.stringify(last)})`) }

const root = path.resolve(__dirname, '..'), logs = []
const modules = new Map()
const mocks = { '@/platform/observability/logger': { logEvent: (level, event, fields) => { logs.push({ level, event, fields, at: Date.now() }) } } }
function load(relative) {
  const file = path.resolve(root, `${relative}.ts`)
  if (modules.has(file)) return modules.get(file)
  const mod = { exports: {} }; modules.set(file, mod.exports)
  new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText)(
    (spec) => spec in mocks ? mocks[spec] : spec.startsWith('@/') ? load(`src/${spec.slice(2)}`) : require(spec), mod, mod.exports)
  modules.set(file, mod.exports)
  return mod.exports
}

async function main() {
  const { kv, kvHealth, cached } = load('src/platform/cache/kv'), { rateLimitStrict } = load('src/platform/http/rate-limit')
  // A: connected; a limit that guards a secret is counted in Redis.
  assert.equal((await kv()).kind, 'redis')
  assert.equal((await kvHealth()).degraded, false)
  for (let i = 0; i < 3; i++) assert.equal((await rateLimitStrict('qa:a', 3, 60_000)).ok, true)
  assert.equal((await rateLimitStrict('qa:a', 3, 60_000)).ok, false)
  mark('connected')

  // B: the Redis is stopped from outside while this process runs.
  await waitFor('stopped')
  const stoppedAt = Date.now()
  await until(async () => (await kvHealth()).degraded === true, 30_000, 'the outage is detected')
  const detectedMs = Date.now() - stoppedAt
  assert.equal((await kv()).kind, 'memory', 'the store reports the fallback')
  assert.ok(logs.some(l => l.event === 'kv.redis_unavailable' || l.event === 'kv.redis_lost'), 'the outage is logged')
  // Limits stay closed, the cache and locks keep working on the fallback.
  for (let i = 0; i < 2; i++) assert.equal((await rateLimitStrict('qa:b', 2, 60_000)).ok, true)
  assert.equal((await rateLimitStrict('qa:b', 2, 60_000)).ok, false, 'an outage is not a fresh allowance')
  assert.equal(await cached('qa:cache', 5_000, async () => 'fresh'), 'fresh')
  const store = await kv()
  assert.equal(await store.lock('qa:lock', 5_000), true); assert.equal(await store.lock('qa:lock', 5_000), false, 'a lock still holds once')
  mark('degraded')

  // C: the Redis comes back; the site reconnects by itself and the limit is shared again.
  await waitFor('started')
  const startedAt = Date.now()
  await until(async () => (await kvHealth()).degraded === false && (await kv()).kind === 'redis', 90_000, 'the site reconnects')
  const recoveredMs = Date.now() - startedAt
  assert.ok(logs.some(l => l.event === 'kv.redis_recovered'), 'the recovery is logged')
  for (let i = 0; i < 3; i++) assert.equal((await rateLimitStrict('qa:c', 3, 60_000)).ok, true)
  assert.equal((await rateLimitStrict('qa:c', 3, 60_000)).ok, false)
  const shared = await (await kv()).get('rls:qa:c')
  assert.equal(shared, '4', 'counted in Redis again')
  mark('recovered')
  console.log(JSON.stringify({ detectedMs, recoveredMs, events: logs.map(l => l.event).filter(e => e.startsWith('kv.')) }))
  console.log('redis-runtime-outage: ok')
  process.exit(0)
}
main().catch(error => { console.error(error); process.exit(1) })
