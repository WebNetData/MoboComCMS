// npm run test:redis — the strict rate limit against a real Redis (REDIS_URL).
// Two copies of the limiter, each with its own Redis connection, stand for two app instances.
// Skipped without REDIS_URL: `npm run check` and `npm run test:pg` must run without Redis.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), ts = require('typescript')

if (!process.env.REDIS_URL) { console.log('rate-limit.redis: skipped (REDIS_URL is not set)'); process.exit(0) }
process.env.REDIS_PREFIX = `qa-rl-${crypto.randomUUID().slice(0, 8)}:`

const root = path.resolve(__dirname, '..')
/** One app instance: its own module state, its own connection. */
function instance() {
  const cache = new Map(), scope = {}
  const logger = { logEvent: () => undefined }
  const load = (relative) => {
    const file = path.resolve(root, `${relative}.ts`)
    if (cache.has(file)) return cache.get(file)
    // The store keeps its connection on globalThis; each instance gets a global of its own.
    const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText.replace(/\bglobalThis\b/g, '__scope')
    const mod = { exports: {} }
    cache.set(file, mod.exports)
    const req = (spec) => (spec === '@/platform/observability/logger' ? logger : spec.startsWith('@/') ? load(`src/${spec.slice(2)}`) : require(spec))
    new Function('require', 'module', 'exports', '__scope', source)(req, mod, mod.exports, scope)
    return mod.exports
  }
  return { limiter: load('src/platform/http/rate-limit'), store: () => load('src/platform/cache/kv').kv(), scope }
}

async function main() {
  const a = instance(), b = instance()
  const [storeA, storeB] = [await a.store(), await b.store()]
  assert.equal(storeA.kind, 'redis', 'REDIS_URL is set but Redis did not answer')
  assert.notEqual(storeA, storeB, 'the two instances share nothing in this process')
  const key = () => `t:${crypto.randomUUID()}`
  try {
    // 1. Forty requests at once over two instances with a limit of 10: exactly ten pass.
    const burst = key()
    const answers = await Promise.all(Array.from({ length: 40 }, (_, index) => (index % 2 ? a : b).limiter.rateLimitStrict(burst, 10, 60_000)))
    assert.equal(answers.filter((answer) => answer.ok).length, 10, 'exactly the limit passes, however the requests are spread')
    const refused = answers.find((answer) => !answer.ok)
    assert.ok(refused.retryAfter >= 1 && refused.retryAfter <= 60, 'a refusal says when the window ends')

    // 2. What one instance used is gone for the other.
    const split = key()
    for (let index = 0; index < 3; index += 1) assert.equal((await a.limiter.rateLimitStrict(split, 3, 60_000)).ok, true)
    assert.equal((await b.limiter.rateLimitStrict(split, 3, 60_000)).ok, false, 'the second instance sees the first one\'s hits at once')

    // 3. The window ends by itself and the count starts again.
    const short = key()
    assert.equal((await a.limiter.rateLimitStrict(short, 1, 300)).ok, true)
    assert.equal((await b.limiter.rateLimitStrict(short, 1, 300)).ok, false)
    await new Promise((resolve) => setTimeout(resolve, 400))
    assert.equal((await b.limiter.rateLimitStrict(short, 1, 300)).ok, true)

    // 4. The counter always has an expiry: nobody is refused for ever.
    const counted = await storeA.hit(`rls:${key()}`, 5_000)
    assert.ok(counted.count === 1 && counted.ttlMs > 0 && counted.ttlMs <= 5_000)

    // 5. Redis stops answering: the instance keeps refusing on what it counted itself.
    const outage = key()
    for (let index = 0; index < 3; index += 1) assert.equal((await a.limiter.rateLimitStrict(outage, 3, 60_000)).ok, true)
    const realHit = storeA.hit
    storeA.hit = async () => { throw new Error('connection lost') }
    assert.equal((await a.limiter.rateLimitStrict(outage, 3, 60_000)).ok, false, 'an outage does not hand out a fresh allowance')
    storeA.hit = realHit
    console.log('rate-limit.redis: ok')
  } finally {
    await storeA.delPrefix('').catch(() => undefined)
    for (const one of [a, b]) await one.scope.__mobocomKv?.then((store) => store.client?.quit?.()).catch(() => undefined)
  }
}

main().then(() => process.exit(0), (error) => { console.error(error); process.exit(1) })
