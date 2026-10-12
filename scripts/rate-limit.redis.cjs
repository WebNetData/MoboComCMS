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
  const fixture = { moduleOn: true, vendorOn: true, calls: [] }
  const delegated = (name, result = {}) => async () => { fixture.calls.push(name); return result }
  const vendor = {
    getVendorConfig: async () => ({ enabled: fixture.vendorOn }),
    activateLicense: delegated('activate'), checkLicense: delegated('check'), deactivateLicense: delegated('deactivate'),
    downloadRelease: delegated('download', { buffer: Buffer.from('owned fixture'), version: '1.0.0', sha256: 'fixture' }),
    publicMeta: delegated('meta'),
  }
  const logger = { logEvent: () => undefined }
  const load = (relative) => {
    const file = path.resolve(root, `${relative}.ts`)
    if (cache.has(file)) return cache.get(file)
    // The store keeps its connection on globalThis; each instance gets a global of its own.
    const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText.replace(/\bglobalThis\b/g, '__scope')
    const mod = { exports: {} }
    cache.set(file, mod.exports)
    const req = (spec) => {
      if (spec === '@/platform/observability/logger') return logger
      if (spec === '@/platform/config/env') return { authSecret: () => 'owned redis fixture' }
      if (spec === '@/extensions/server/modules') return { moduleGuard: async () => fixture.moduleOn ? null : new Response(null, { status: 404 }) }
      if (spec === '@/modules/identity/server/access') return { requireUser: async () => { throw Error('Secret route must not acquire a human identity') } }
      if (spec === '@/modules/repository/server/vendor') return vendor
      return spec.startsWith('@/') ? load(`src/${spec.slice(2)}`) : require(spec)
    }
    new Function('require', 'module', 'exports', '__scope', source)(req, mod, mod.exports, scope)
    return mod.exports
  }
  return { limiter: load('src/platform/http/rate-limit'), repository: () => load('src/modules/repository/server/http/public'), fixture, store: () => load('src/platform/cache/kv').kv(), scope }
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

    // 6. Actual repository HTTP owners share the strict allowance before secret delegates.
    // Business delegates are spies; the HTTP gates, limiter and Redis are real.
    const { NextRequest } = require('next/server')
    const routes = [a.repository(), b.repository()]
    const request = (ip, method = 'GET', body = undefined) => new NextRequest('https://fixture.invalid/api/repository', {
      method, headers: { 'x-forwarded-for': ip, Origin: 'https://fixture.invalid' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    const ips = new Set()
    const ip = () => {
      let value
      do { value = `10.${crypto.randomInt(1, 255)}.${crypto.randomInt(1, 255)}.${crypto.randomInt(1, 255)}` } while (ips.has(value))
      ips.add(value); return value
    }
    const licenseIp = ip(), actions = ['activate', 'check', 'deactivate']
    a.fixture.calls.length = 0; b.fixture.calls.length = 0
    const licenseAnswers = await Promise.all(Array.from({ length: 48 }, (_, index) => routes[index % 2].POST_license(request(licenseIp, 'POST', { slug: 'owned-fixture', key: 'fixture-only', site: 'https://site.invalid' }), actions[index % 3])))
    assert.equal(licenseAnswers.filter(answer => answer.status === 200).length, 30, 'exactly 30 secret license actions across two instances')
    assert.equal(licenseAnswers.filter(answer => answer.status === 429).length, 18)
    assert.equal(a.fixture.calls.length + b.fixture.calls.length, 30, 'denied actions never reach license delegates')
    assert.deepEqual(new Set([...a.fixture.calls, ...b.fixture.calls]), new Set(actions))

    const downloadIp = ip()
    a.fixture.calls.length = 0; b.fixture.calls.length = 0
    const downloadAnswers = await Promise.all(Array.from({ length: 80 }, (_, index) => routes[index % 2].GET_download(request(downloadIp), 'owned-fixture', '1.0.0')))
    assert.equal(downloadAnswers.filter(answer => answer.status === 200).length, 60, 'exactly 60 secret-capable downloads across two instances')
    assert.equal(downloadAnswers.filter(answer => answer.status === 429).length, 20)
    assert.equal(a.fixture.calls.length + b.fixture.calls.length, 60, 'denied downloads never reach file delegates')
    assert.equal((await routes[0].POST_license(request(downloadIp, 'POST', { slug: 'owned-fixture' }), 'check')).status, 429, 'secret routes retain the shared per-IP budget')

    const malformedIp = ip()
    const malformed = await Promise.all(Array.from({ length: 40 }, (_, index) => routes[index % 2].POST_license(request(malformedIp, 'POST', {}), 'check')))
    assert.equal(malformed.filter(answer => answer.status === 400).length, 30, 'invalid secret requests also consume the allowance')
    assert.equal(malformed.filter(answer => answer.status === 429).length, 10)
    assert.equal((await routes[0].GET_meta(request(licenseIp))).status, 200, 'public discovery keeps its separate existing ordinary limiter')

    // Disabled owners refuse before touching the secret allowance.
    const disabledIp = ip(), actualHit = storeA.hit
    let disabledHits = 0
    storeA.hit = async () => { disabledHits++; throw Error('Disabled route must not touch Redis') }
    a.fixture.moduleOn = false
    assert.equal((await routes[0].GET_download(request(disabledIp), 'owned-fixture', '1.0.0')).status, 404)
    a.fixture.moduleOn = true; a.fixture.vendorOn = false
    assert.equal((await routes[0].POST_license(request(disabledIp, 'POST', {}), 'check')).status, 404)
    assert.equal(disabledHits, 0, 'disabled module/vendor must not reach the limiter even if it has an outage fallback')
    a.fixture.vendorOn = true; storeA.hit = actualHit
    console.log('rate-limit.redis: ok')
  } finally {
    await storeA.delPrefix('').catch(() => undefined)
    for (const one of [a, b]) await one.scope.__mobocomKv?.then((store) => store.client?.quit?.()).catch(() => undefined)
  }
}

main().then(() => process.exit(0), (error) => { console.error(error); process.exit(1) })
