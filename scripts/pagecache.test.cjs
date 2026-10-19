const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript-api')

const root = path.resolve(__dirname, '..')
function load(relative) {
  const source = ts.transpileModule(fs.readFileSync(path.resolve(root, relative), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', source)(require, mod, mod.exports)
  return mod.exports
}
const p = load('src/modules/performance/domain/pagecache.ts')
const on = (extra = {}) => p.normalizePageCache({ mode: 'balanced', ...extra })
const req = (extra = {}) => ({ method: 'GET', pathname: '/blog', search: '', host: 'example.com', cookie: '', accept: 'text/html,application/xhtml+xml', rsc: false, fill: false, ...extra })

test('presets fix the times; custom keeps them; values are clamped', () => {
  assert.equal(on().ttl, 60)
  assert.equal(p.normalizePageCache({ mode: 'aggressive' }).staleIfError, 21600)
  const custom = p.normalizePageCache({ mode: 'custom', ttl: 999999, staleWhileRevalidate: -5, maxMemoryMb: 1 })
  assert.equal(custom.ttl, 86400)
  assert.equal(custom.staleWhileRevalidate, 0)
  assert.equal(custom.maxMemoryMb, 16)
  assert.equal(p.normalizePageCache({}).mode, 'off')
  assert.equal(p.normalizePageCache({ mode: 'weird' }).mode, 'off')
})

test('only guests on listed public pages are cached, as full HTML documents', () => {
  assert.equal(p.decide(p.normalizePageCache({}), req()).cache, false, 'off by default')
  assert.equal(p.decide(on(), req()).cache, true)
  assert.equal(p.decide(on(), req({ method: 'POST' })).reason, 'method')
  assert.equal(p.decide(on(), req({ accept: '*/*' })).reason, 'accept')
  assert.equal(p.decide(on(), req({ rsc: true })).reason, 'rsc')
  assert.equal(p.decide(on(), req({ search: '?_rsc=abc' })).reason, 'rsc', 'client-side navigation payloads are never HTML')
  assert.equal(p.decide(on(), req({ fill: true })).reason, 'fill')
  for (const cookie of ['next-auth.session-token=x', '__Secure-next-auth.session-token=x', 'a=1; mc_cart=abc', 'mc_preview=1']) assert.equal(p.decide(on(), req({ cookie })).reason, 'personal', cookie)
  assert.equal(p.decide(on(), req({ cookie: 'lang=fa; theme=dark' })).cache, true)
  for (const pathname of ['/admin', '/api/x', '/login', '/checkout/1', '/dashboard/orders', '/cart', '/search']) assert.equal(p.decide(on(), req({ pathname })).cache, false, pathname)
  assert.equal(p.decide(on(), req({ pathname: '/unknown' })).reason, 'not-listed')
  // exclusions win over inclusions
  assert.equal(p.decide(on({ include: ['/blog'], exclude: ['/blog/private'] }), req({ pathname: '/blog/private/x' })).reason, 'excluded')
  assert.equal(p.decide(on(), req({ pathname: '/' })).cache, true)
  assert.equal(p.decide(on(), req({ pathname: '/blogger' })).reason, 'not-listed', 'a prefix matches whole segments only')
})

test('the key ignores tracking, orders parameters, varies by host, language and theme', () => {
  const a = p.decide(on(), req({ search: '?page=2&utm_source=x&fbclid=1' }))
  const b = p.decide(on(), req({ search: '?utm_campaign=y&page=2' }))
  assert.equal(a.key, b.key)
  assert.equal(a.canonicalSearch, '?page=2')
  assert.notEqual(p.decide(on(), req({ host: 'other.com' })).key, p.decide(on(), req()).key)
  assert.notEqual(p.decide(on(), req({ cookie: 'lang=en' })).key, p.decide(on(), req()).key)
  assert.notEqual(p.decide(on(), req({ cookie: 'theme=dark' })).key, p.decide(on(), req({ cookie: 'theme=light' })).key)
  assert.equal(p.decide(on(), req({ cookie: 'lang=<script>' })).key, p.decide(on(), req()).key, 'a hostile cookie value cannot create keys')
  assert.equal(p.decide(on(), req({ search: '?q=abc' })).reason, 'query', 'unknown parameters are never cached')
  assert.equal(p.decide(on(), req({ pathname: '/blog/' })).key, p.decide(on(), req()).key, 'trailing slash')
})

test('per-path times: the longest matching prefix wins', () => {
  const config = on({ overrides: [{ prefix: '/', ttl: 10 }, { prefix: '/blog', ttl: 600 }, { prefix: '/blog/hot', ttl: 5 }] })
  assert.equal(p.decide(config, req({ pathname: '/' })).ttl, 10)
  assert.equal(p.decide(config, req({ pathname: '/blog/x' })).ttl, 600)
  assert.equal(p.decide(config, req({ pathname: '/blog/hot/x' })).ttl, 5)
  assert.equal(p.decide(config, req({ pathname: '/software' })).ttl, 60)
})

test('freshness: fresh, stale-while-revalidate, stale-if-error, expired', () => {
  const c = on()
  assert.equal(p.freshness(c, 60, 10), 'fresh')
  assert.equal(p.freshness(c, 60, 100), 'stale')
  assert.equal(p.freshness(c, 60, 60 + 300 + 10), 'error-only')
  assert.equal(p.freshness(c, 60, 60 + 300 + 3600 + 1), 'expired')
  assert.match(p.cacheControl(on({ edgeHeaders: true }), 60), /s-maxage=60, stale-while-revalidate=300/)
  assert.equal(p.cacheControl(on(), 60), 'private, no-cache')
})

test('cached pages still count their visits: address → record', () => {
  assert.deepEqual(p.viewTarget('/blog/my-post'), { model: 'post', slug: 'my-post' })
  assert.deepEqual(p.viewTarget('/products/abc'), { model: 'product', slug: 'abc' })
  assert.deepEqual(p.viewTarget('/music/album/x'), { model: 'album', slug: 'x' })
  assert.deepEqual(p.viewTarget('/software/%D8%A8'), { model: 'software', slug: 'ب' })
  assert.equal(p.viewTarget('/blog'), null)
  assert.equal(p.viewTarget('/blog/a/b'), null)
})

test('wiring: middleware, scheduler, admin write purge, plain bodies', () => {
  const middleware = fs.readFileSync(path.resolve(root, 'src/proxy.ts'), 'utf8')
  assert.match(middleware, /pageCacheHandle\(/)
  assert.match(middleware, /purgeSoon\('admin-change'\)/)
  assert.match(fs.readFileSync(path.resolve(root, 'src/modules/notifications/server/jobs-scheduler.ts'), 'utf8'), /name: 'pagecache'/)
  const server = fs.readFileSync(path.resolve(root, 'src/modules/performance/server/pagecache.ts'), 'utf8')
  // Next drops Content-Encoding from middleware responses; a gzip body would reach the browser unreadable
  assert.doesNotMatch(server, /'content-encoding'\s*,\s*'gzip'/)
  assert.match(server, /x-pagecache-fill/)
})
