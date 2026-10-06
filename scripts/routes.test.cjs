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

// Public utilities that are not content sections (no templates or section settings).
const PUBLIC_TOOLS = new Set(['forwarder', 'ads', 'repository'])

test('every bundled module menu is valid and each section links to its settings page', () => {
  const dir = path.resolve(__dirname, '../src/plugins')
  for (const name of fs.readdirSync(dir)) {
    const file = path.join(dir, name, 'manifest.json')
    if (!fs.existsSync(file)) continue
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8'))
    contracts.assertValidExtensionManifest(manifest)
    // Public sections link to their settings page; admin-only tools (server panel) have none.
    if (manifest.adminMenu && manifest.publicPaths?.length && !PUBLIC_TOOLS.has(manifest.id)) assert.ok(manifest.adminMenu.items.some((item) => item.href === `/admin/sections/${manifest.id}`), `${manifest.id} has a settings link`)
  }
})

// ---- modules that depend on another module ---------------------------------
function loadState(manifests, settings) {
  const file = path.resolve(__dirname, '..', 'src/extensions/server/state.ts')
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const db = { setting: {
    findUnique: async ({ where }) => settings.has(where.key) ? { key: where.key, value: settings.get(where.key) } : null,
    findMany: async ({ where }) => where.key.in.filter((key) => settings.has(key)).map((key) => ({ key, value: settings.get(key) })),
    upsert: async ({ where, create }) => { settings.set(where.key, create.value) },
  } }
  const mocks = { '@/platform/database/prisma': { db }, '@/extensions/generated/catalog': { extensionCatalog: manifests, extensionById: new Map(manifests.map((m) => [m.id, m])) }, '@/extensions/generated/server-registry': { serverPlugins: {} } }
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', source)((specifier) => mocks[specifier] || require(specifier), mod, mod.exports)
  return mod.exports
}
const manifestOf = (id) => JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'src/plugins', id, 'manifest.json'), 'utf8'))

test('an extension is off while a module it requires is off, and comes back with it', async () => {
  const manifests = ['vpn', 'reseller', 'remnawave-control', 'marketplace'].map(manifestOf)
  contracts.assertUniqueExtensionIds(manifests)
  const settings = new Map()
  const state = loadState(manifests, settings)
  const enabled = async () => Object.fromEntries(await Promise.all(manifests.map(async (m) => [m.id, (await state.getExtensionState(m.id)).enabled])))
  const runtime = async () => Object.fromEntries(Object.entries(await state.getPublicExtensionRuntime()).map(([id, value]) => [id, value.enabled]))
  // A fresh site: the VPN service is off by default, so are the reseller module and the panel plugin, whatever their own default says.
  const fresh = { vpn: false, reseller: false, 'remnawave-control': false, marketplace: true }
  assert.deepEqual(await enabled(), fresh)
  assert.deepEqual(await runtime(), fresh)
  await assert.rejects(state.saveExtensionState('reseller', { enabled: true }), /VPN/)
  // Saving the plugin's settings meanwhile must not store "off" for it.
  await state.saveExtensionState('remnawave-control', { settings: { 'batch-size': 7 } })
  await state.saveExtensionState('vpn', { enabled: true })
  const all = { vpn: true, reseller: true, 'remnawave-control': true, marketplace: true }
  assert.deepEqual(await enabled(), all)
  assert.deepEqual(await runtime(), all)
  assert.equal((await state.getExtensionState('remnawave-control')).settings['batch-size'], 7)
  // The reseller module has its own switch …
  await state.saveExtensionState('reseller', { enabled: false })
  assert.deepEqual(await enabled(), { ...all, reseller: false })
  // … and the VPN service cannot be switched off under an extension that is still on.
  await assert.rejects(state.saveExtensionState('vpn', { enabled: false }), /RemnaWave/)
  await state.saveExtensionState('remnawave-control', { enabled: false })
  await state.saveExtensionState('vpn', { enabled: false })
  await state.saveExtensionState('marketplace', { enabled: false })
  assert.deepEqual(await runtime(), { vpn: false, reseller: false, 'remnawave-control': false, marketplace: false })
})

test('the admin sections and APIs of the VPN, reseller and marketplace modules belong to their switch', () => {
  const vpn = manifestOf('vpn'), reseller = manifestOf('reseller')
  assert.deepEqual(reseller.adminPaths, ['/admin/resellers', '/admin/reseller-sales'])
  assert.deepEqual(reseller.requires, ['vpn'])
  assert.ok(!vpn.adminPaths.some((item) => item.includes('reseller')))
  // Every item of the built-in admin menu that leads into one of these sections is covered by a module's adminPaths.
  const layout = fs.readFileSync(path.resolve(__dirname, '..', 'src/app/admin/layout.tsx'), 'utf8')
  const owned = [...vpn.adminPaths, ...reseller.adminPaths, ...manifestOf('marketplace').adminPaths]
  for (const href of ['/admin/plans', '/admin/service-offers', '/admin/trial', '/admin/subscriptions', '/admin/panels', '/admin/resellers', '/admin/reseller-sales', '/admin/happ', '/admin/connection-guide', '/admin/locations', '/admin/incidents']) {
    assert.ok(layout.includes(`href: '${href}'`), href)
    assert.ok(owned.includes(href), href)
  }
  const guarded = { vpn: ['admin/plans', 'admin/service-offers', 'admin/trial', 'admin/subscriptions', 'admin/panels', 'admin/panels/groups', 'admin/happ', 'admin/connection-guide', 'admin/incidents', 'trial'], reseller: ['admin/resellers', 'admin/reseller-sales'] }
  for (const [id, routes] of Object.entries(guarded)) for (const route of routes) {
    const source = fs.readFileSync(path.resolve(__dirname, '..', 'src/app/api', route, 'route.ts'), 'utf8')
    const handlers = source.match(/^export const (GET|POST|PUT|PATCH|DELETE) = .*$/gm) || []
    assert.ok(handlers.length > 0, route)
    for (const line of handlers) assert.ok(line.includes(`whenModuleOn('${id}', handlers.`), `${route}: ${line}`)
    assert.ok(!/^export \{/m.test(source), `${route} re-exports an unguarded handler`)
  }
})

test('notification kinds of a switched-off module are not offered', () => {
  const n = load('src/modules/notifications/domain/event-modules')
  const off = { vpn: false, marketplace: false, forum: true }
  assert.deepEqual(['SUBSCRIPTION_EXPIRING', 'SUBSCRIPTION_READY', 'MARKETPLACE', 'PAYMENT_PAID', 'TICKET_REPLY', 'FORUM_REPLY', 'MEMBERSHIP', 'PRODUCT_DELIVERED'].filter((kind) => n.notificationOffered(kind, off)), ['PAYMENT_PAID', 'TICKET_REPLY', 'FORUM_REPLY', 'MEMBERSHIP', 'PRODUCT_DELIVERED'])
  assert.equal(n.notificationOffered('FORUM_REPLY', { forum: false }), false)
  assert.equal(n.notificationOffered('SUBSCRIPTION_EXPIRED', {}), true, 'a module that is not listed counts as on')
  // Every kind with an owner names a module that exists.
  const ids = fs.readdirSync(path.resolve(__dirname, '..', 'src/plugins')).filter((dir) => fs.existsSync(path.resolve(__dirname, '..', 'src/plugins', dir, 'manifest.json'))).map((dir) => manifestOf(dir).id)
  const kinds = [...load('src/modules/mail/domain/mail').EMAIL_EVENTS, ...load('src/modules/sms/domain/sms').SMS_EVENTS].map((event) => event.id)
  for (const kind of [...kinds, 'FORUM_REPLY', 'COMMUNITY_LIKE']) { const owner = n.notificationModule(kind); if (owner) assert.ok(ids.includes(owner), `${kind} → ${owner}`) }
})
