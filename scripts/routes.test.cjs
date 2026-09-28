const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const cache = new Map()
function load(relative) {
  const file = path.resolve(__dirname, '..', relative.endsWith('.ts') ? relative : `${relative}.ts`)
  if (cache.has(file)) return cache.get(file).exports
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const mod = { exports: {} }
  cache.set(file, mod)
  const localRequire = (specifier) => (specifier.startsWith('@/') ? load(`src/${specifier.slice(2)}`) : require(specifier))
  new Function('require', 'module', 'exports', source)(localRequire, mod, mod.exports)
  return mod.exports
}

const r = load('src/shared/routing/aliases')
const contracts = load('src/platform/extensions/contracts')

const map = { '/games': '/game', '/forum': '/discourse' }

test('public and internal paths map whole segments only', () => {
  assert.equal(r.toPublicPath('/games', map), '/game')
  assert.equal(r.toPublicPath('/games/elden?x=1#top', map), '/game/elden?x=1#top')
  assert.equal(r.toPublicPath('/games?sort=score', map), '/game?sort=score')
  assert.equal(r.toPublicPath('/gamesx', map), '/gamesx')
  assert.equal(r.toPublicPath('https://x.y/games', map), 'https://x.y/games')
  assert.equal(r.toPublicPath('//evil.com/games', map), '//evil.com/games')
  assert.equal(r.toInternalPath('/discourse/t/3', map), '/forum/t/3')
  assert.equal(r.toInternalPath('/discoursex', map), '/discoursex')
  assert.equal(r.toPublicPath('/blog/x', map), '/blog/x')
})

test('middleware decision rewrites aliases and redirects old addresses', () => {
  assert.deepEqual(r.routeDecision('/game/elden', map), { kind: 'rewrite', path: '/games/elden' })
  assert.deepEqual(r.routeDecision('/games/elden', map), { kind: 'redirect', path: '/game/elden' })
  assert.deepEqual(r.routeDecision('/forum', map), { kind: 'redirect', path: '/discourse' })
  assert.equal(r.routeDecision('/music', map), null)
})

test('aliases are validated: format, reserved names, other bases and duplicates', () => {
  const bases = ['/games', '/forum', '/music']
  assert.deepEqual(r.validateAliases({ '/games': 'Game/', '/forum': '/forum', '/music': '' }, bases), { ok: true, aliases: { '/games': '/game' } })
  assert.equal(r.validateAliases({ '/games': 'admin' }, bases).ok, false)
  assert.equal(r.validateAliases({ '/games': 'api' }, bases).ok, false)
  assert.equal(r.validateAliases({ '/games': 'music' }, bases).ok, false)
  assert.equal(r.validateAliases({ '/games': 'play', '/music': 'play' }, bases).ok, false)
  assert.equal(r.validateAliases({ '/games': 'bad path' }, bases).ok, false)
  assert.equal(r.validateAliases({ '/games': '-x' }, bases).ok, false)
  assert.deepEqual(r.validateAliases({ '/unknown': 'x' }, bases), { ok: true, aliases: {} })
})

test('the alias table is shared through a global and used by default', () => {
  r.setRouteAliases({ '/software': '/apps' })
  assert.equal(r.toPublicPath('/software/7zip'), '/apps/7zip')
  assert.equal(globalThis.__mcRouteAliases['/software'], '/apps')
  r.setRouteAliases({})
  assert.equal(r.toPublicPath('/software/7zip'), '/software/7zip')
})

test('module admin menus must stay inside the module admin paths', () => {
  const base = { id: 'demo', name: 'Demo', version: '1.0.0', kind: 'module', apiVersion: 1, adminPaths: ['/admin/demo'] }
  assert.doesNotThrow(() => contracts.assertValidExtensionManifest({ ...base, adminMenu: { items: [{ href: '/admin/demo/items', label: 'x' }, { href: '/admin/sections/demo', label: 'y' }, { href: '/admin/taxonomy?tax=demo', label: 'z' }] } }))
  assert.throws(() => contracts.assertValidExtensionManifest({ ...base, adminMenu: { items: [{ href: '/admin/users', label: 'x' }] } }), /outside/)
  assert.throws(() => contracts.assertValidExtensionManifest({ ...base, kind: 'plugin', adminPaths: undefined, adminMenu: { items: [] } }), /Only feature modules/)
})

test('every bundled module menu is valid and each section links to its settings page', () => {
  const dir = path.resolve(__dirname, '../src/plugins')
  for (const name of fs.readdirSync(dir)) {
    const file = path.join(dir, name, 'manifest.json')
    if (!fs.existsSync(file)) continue
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8'))
    contracts.assertValidExtensionManifest(manifest)
    // Public sections link to their settings page; admin-only tools (server panel) have none.
    if (manifest.adminMenu && manifest.publicPaths?.length) assert.ok(manifest.adminMenu.items.some((item) => item.href === `/admin/sections/${manifest.id}`), `${manifest.id} has a settings link`)
  }
})
