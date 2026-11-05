const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript-api')

const cache = new Map()
function load(relative) {
  const file = path.resolve(__dirname, '..', relative.endsWith('.ts') ? relative : `${relative}.ts`)
  if (cache.has(file)) return cache.get(file).exports
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText
  const mod = { exports: {} }
  cache.set(file, mod)
  const localRequire = (specifier) => specifier.endsWith('.json') ? JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', `src/${specifier.slice(2)}`), 'utf8')) : (specifier.startsWith('@/') ? load(`src/${specifier.slice(2)}`) : specifier.startsWith('.') ? load(path.resolve(path.dirname(file), specifier)) : require(specifier))
  new Function('require', 'module', 'exports', source)(localRequire, mod, mod.exports)
  return mod.exports
}
const f = load('src/modules/forwarder/domain/forwarder')
const automatic = load('src/modules/forwarder/domain/automatic')

test('automatic anchors preserve web URLs and never wrap internal, unsafe or non-web addresses', () => {
  const policy = { enabled: true, siteHost: 'mobocom.example' }, origin = 'https://preview.example'
  const target = 'https://outside.example/سلام/a%2Fb?q=a%26b&x=2#بخش'
  const wrapped = automatic.automaticForwardHref(target, origin, policy)
  const parsed = new URL(wrapped, origin)
  assert.equal(parsed.pathname, '/forwarder'); assert.equal(parsed.searchParams.get('auto'), '1')
  assert.equal(parsed.searchParams.get('url'), new URL(target).href)
  assert.equal(automatic.automaticForwardHref('//outside.example/x', origin, policy), '/forwarder?auto=1&url=https%3A%2F%2Foutside.example%2Fx')
  for (const href of ['/games/x', '#part', '?page=2', 'mailto:a@outside.example', 'tel:123', 'javascript:alert(1)', 'ftp://outside.example/a', 'https://u:p@outside.example', 'http://127.0.0.1', 'https://preview.example/x', 'http://mobocom.example/x', 'https://MOBOCOM.example./x', 'https://preview.example/forwarder?url=x']) assert.equal(automatic.automaticForwardHref(href, origin, policy), href)
  assert.equal(automatic.automaticForwardHref(target, origin, { ...policy, enabled: false }), target)
  assert.equal(f.normalizeForwarderSettings({}).autoExternalLinks, false)
  assert.equal(f.normalizeForwarderSettings({ autoExternalLinks: true }).autoExternalLinks, true)
  for (const path of ['/admin', '/admin/forwarder', '/forwarder', '/forwarder/x', '/builder-preview/x']) assert.equal(automatic.automaticLinksAllowed(path), false)
  for (const path of ['/', '/journal/x', '/forum/x', '/forwarders']) assert.equal(automatic.automaticLinksAllowed(path), true)
})

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
