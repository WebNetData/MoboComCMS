const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const cache = new Map()
function load(relative) {
  const file = path.resolve(__dirname, '..', relative.endsWith('.ts') ? relative : `${relative}.ts`)
  if (cache.has(file)) return cache.get(file).exports
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText
  const mod = { exports: {} }
  cache.set(file, mod)
  const localRequire = (specifier) => specifier.endsWith('.json') ? JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', `src/${specifier.slice(2)}`), 'utf8')) : (specifier.startsWith('@/') ? load(`src/${specifier.slice(2)}`) : require(specifier))
  new Function('require', 'module', 'exports', source)(localRequire, mod, mod.exports)
  return mod.exports
}
const f = load('src/modules/forwarder/domain/forwarder')

test('targets: scheme added, only public http(s)', () => {
  assert.equal(f.normalizeTarget('google.com').url, 'https://google.com/')
  assert.equal(f.normalizeTarget('https:/google.com/search?q=1').url, 'https://google.com/search?q=1')
  assert.equal(f.normalizeTarget('http://example.org:8080/x').url, 'http://example.org:8080/x')
  assert.equal(f.normalizeTarget('example.org:8080/x').url, 'https://example.org:8080/x')
  for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'https://user:pw@x.com', 'http://localhost/a', 'http://127.0.0.1', 'https://192.168.1.1', 'https://intranet', '', 'ftp://x.com']) {
    assert.equal(f.normalizeTarget(bad).ok, false, bad)
  }
  assert.equal(f.isBlocked('ads.bad.com', ['bad.com']), true)
  assert.equal(f.isBlocked('notbad.com', ['bad.com']), false)
})

test('paths: url= or a slug', () => {
  assert.deepEqual(f.parseForwarderPath('url=google.com'), { kind: 'raw', target: 'google.com' })
  assert.deepEqual(f.parseForwarderPath('url%3Dgoogle.com'), { kind: 'raw', target: 'google.com' })
  assert.deepEqual(f.parseForwarderPath('Google'), { kind: 'slug', slug: 'google' })
})

test('slugs: cleaned, reserved words refused, random ones readable', () => {
  assert.equal(f.normalizeSlug(' My Link!! '), 'my-link')
  assert.equal(f.normalizeSlug('دانلود-فیلم'), 'دانلود-فیلم')
  assert.ok(f.slugProblem('url'))
  assert.ok(f.slugProblem('a'))
  assert.equal(f.slugProblem('google'), '')
  let i = 0
  const slug = f.randomSlug(() => (i++ * 7) % 32)
  assert.match(slug, /^[a-km-np-z2-9]{6}$/)
})

test('settings are clamped and banner links validated', () => {
  const s = f.normalizeForwarderSettings({ countdown: 999, bannerLink: 'javascript:x', bannerImage: 'http://x.com/a.png', title: '<b>x</b>', blockedHosts: ['https://Bad.com/path', '??'] })
  assert.equal(s.countdown, 60)
  assert.equal(s.bannerLink, '')
  assert.equal(s.bannerImage, '')
  assert.doesNotMatch(s.title, /[<>]/)
  assert.deepEqual(s.blockedHosts, ['bad.com'])
  assert.match(f.adDocument('<script>x</script>'), /<base target="_blank">/)
})

test('full-access roles include permissions that plugins add later', () => {
  const rbac = load('src/modules/identity/rbac')
  const everyCore = rbac.PERMISSIONS.join(',')
  assert.ok(rbac.parsePermissions(everyCore).includes('server.manage'), 'admin preset saved before server.manage existed')
  assert.ok(rbac.parsePermissions('*').includes('server.manage'))
  assert.deepEqual(rbac.parsePermissions('dashboard.view,orders.manage'), ['dashboard.view', 'orders.manage'])
  assert.equal(rbac.parsePermissions('dashboard.view,server.manage').includes('server.manage'), true)
})

test('ad code runs sandboxed and the page is not indexed', () => {
  const page = fs.readFileSync(path.resolve(__dirname, '..', 'src/modules/forwarder/server/page.tsx'), 'utf8')
  assert.match(page, /sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"/)
  assert.doesNotMatch(page, /allow-same-origin/)
  assert.match(page, /index: false/)
})
