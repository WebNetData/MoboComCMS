// Settings asked for several times in one server render are read once (audit 2026-11-10, owner item 3).
// React's `cache` is the request scope Next gives a render; here it is modelled with AsyncLocalStorage the same way:
// inside a request one read is shared, outside one (route handlers, jobs) every call reads, and nothing outlives
// its request, so a save is seen by the next request without any invalidation step.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { AsyncLocalStorage } = require('node:async_hooks')
const ts = require('typescript-api')

const scope = new AsyncLocalStorage()
const fakeReact = {
  cache(fn) {
    const key = Symbol('cached')
    return (...args) => {
      const store = scope.getStore()
      if (!store) return fn(...args)
      if (!store.has(key)) store.set(key, fn(...args))
      return store.get(key)
    }
  },
}
const inRequest = (work) => scope.run(new Map(), work)

// One Setting table, with a count of every read that reached it.
const rows = new Map()
const reads = []
let failNext = 0
const tick = () => new Promise(resolve => setImmediate(resolve))
function settingClient(label) {
  return {
    async findMany({ where }) {
      reads.push({ label, kind: 'many', keys: where.key.in.length }); await tick()
      if (failNext > 0) { failNext--; throw Object.assign(new Error('connection lost'), { name: 'PrismaClientKnownRequestError' }) }
      return where.key.in.filter(key => rows.has(key)).map(key => ({ key, value: rows.get(key) }))
    },
    async findUnique({ where }) {
      reads.push({ label, kind: 'one', key: where.key }); await tick()
      return rows.has(where.key) ? { key: where.key, value: rows.get(where.key) } : null
    },
  }
}
const db = { setting: settingClient('db') }
const tx = { setting: settingClient('tx') }
const logs = []

const catalog = [
  { id: 'store', kind: 'module', name: 'فروشگاه', stateSetting: 'storeEnabled', defaultEnabled: false, settings: [] },
  { id: 'reviews', kind: 'module', name: 'نقد', requires: ['store'], defaultEnabled: true, settings: [{ key: 'title', type: 'text', public: true }, { key: 'apiKey', type: 'secret', public: true }] },
]
const mocks = {
  react: fakeReact,
  '@/platform/database/prisma': { db },
  '@/platform/observability/logger': { logEvent: (level, event, fields) => logs.push({ level, event, fields }) },
  '@/extensions/generated/catalog': { extensionCatalog: catalog, extensionById: new Map(catalog.map(m => [m.id, m])) },
  '@/extensions/generated/server-registry': { serverPlugins: {} },
  'next/navigation': { notFound: () => { throw new Error('notFound') } },
  'next/server': { NextResponse: { json: (body, init) => ({ body, init }) } },
}
const modules = new Map()
function load(relative) {
  const file = path.resolve(__dirname, '..', `${relative}.ts`)
  if (modules.has(file)) return modules.get(file).exports
  const mod = { exports: {} }; modules.set(file, mod)
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  new Function('require', 'module', 'exports', source)((spec) => {
    if (spec in mocks) return mocks[spec]
    if (spec.startsWith('@/')) return load(`src/${spec.slice(2)}`)
    if (spec.startsWith('.')) return load(path.relative(path.resolve(__dirname, '..'), path.resolve(path.dirname(file), spec)).replace(/\\/g, '/'))
    return require(spec)
  }, mod, mod.exports)
  return mod.exports
}

const { getPublicExtensionRuntime } = load('src/extensions/server/state')
const { isStoreEnabled } = load('src/modules/catalog/server/storefront')
const { isPublicApiEnabled } = load('src/modules/public-api/server/availability')
const { readThemeIndex } = load('src/modules/site/server/theme-index')
const { THEME_INDEX_KEY } = load('src/modules/site/server/theme-index')

function reset(values) {
  rows.clear(); reads.length = 0; logs.length = 0; failNext = 0
  for (const [key, value] of Object.entries(values)) rows.set(key, value)
}
const template = (id) => ({ id: `tpl-header-${id}aaaa`, name: id, nameEn: '', status: 'published', conditions: [{ mode: 'include', target: 'all' }], updatedAt: '2026-11-10T00:00:00.000Z' })
const base = () => ({
  storeEnabled: 'true',
  publicApiEnabled: 'false',
  'extension.reviews.state.v1': JSON.stringify({ enabled: true, settings: { title: 'نقد و بررسی', apiKey: 'sk-secret-value' } }),
  [THEME_INDEX_KEY]: JSON.stringify([template('t1')]),
})
const count = (kind, key) => reads.filter(read => read.label === 'db' && read.kind === kind && (key === undefined || read.key === key)).length

test('one render: every caller shares one read of each setting', async () => {
  reset(base())
  await inRequest(async () => {
    const runtimes = await Promise.all(Array.from({ length: 5 }, () => getPublicExtensionRuntime()))
    const flags = await Promise.all([isStoreEnabled(), isStoreEnabled(), isStoreEnabled(), isPublicApiEnabled(), isPublicApiEnabled()])
    const indexes = await Promise.all([readThemeIndex(), readThemeIndex()])
    assert.ok(runtimes.every(runtime => runtime.reviews.enabled === true && runtime.store.enabled === true))
    assert.deepEqual(flags, [true, true, true, false, false])
    assert.deepEqual(indexes.map(index => index.list.map(t => t.name)), [['t1'], ['t1']])
  })
  assert.equal(count('many'), 1, 'the extension runtime is read once, not five times')
  assert.equal(count('one', 'storeEnabled'), 1)
  assert.equal(count('one', 'publicApiEnabled'), 1)
  assert.equal(count('one', THEME_INDEX_KEY), 1)
})

test('callers never share a mutable result, and secrets stay out of the public runtime', async () => {
  reset(base())
  await inRequest(async () => {
    const first = await getPublicExtensionRuntime()
    first.reviews.enabled = false; first.reviews.settings.title = 'changed by a caller'
    const second = await getPublicExtensionRuntime()
    assert.equal(second.reviews.enabled, true)
    assert.equal(second.reviews.settings.title, 'نقد و بررسی')
    assert.equal('apiKey' in second.reviews.settings, false, 'a secret setting is never public')
    const a = await readThemeIndex(), b = await readThemeIndex()
    a.list.push(template('injected'))
    assert.deepEqual(b.list.map(t => t.name), ['t1'])
  })
  assert.equal(count('many'), 1)
})

test('a save is seen by the next request: nothing outlives its request', async () => {
  reset(base())
  await inRequest(async () => {
    assert.equal((await getPublicExtensionRuntime()).store.enabled, true)
    assert.equal(await isStoreEnabled(), true)
    assert.equal((await readThemeIndex()).list.length, 1)
  })
  // Admin turns the store off and adds a template (route handlers, outside any render).
  rows.set('storeEnabled', 'false'); rows.set(THEME_INDEX_KEY, JSON.stringify([template('t1'), template('t2')])); rows.set('publicApiEnabled', 'true')
  await inRequest(async () => {
    const runtime = await getPublicExtensionRuntime()
    assert.equal(runtime.store.enabled, false, 'the module mirror follows the new flag')
    assert.equal(runtime.reviews.enabled, false, 'a module that needs the store goes off with it')
    assert.equal(await isStoreEnabled(), false)
    assert.equal(await isPublicApiEnabled(), true)
    assert.deepEqual((await readThemeIndex()).list.map(t => t.name), ['t1', 't2'])
  })
  assert.equal(count('many'), 2, 'one read per request')
})

test('overlapping requests each read for themselves; a save between them reaches only the later one', async () => {
  reset(base())
  let releaseA
  const aHolds = new Promise(resolve => { releaseA = resolve })
  const a = inRequest(async () => {
    const before = await getPublicExtensionRuntime()
    await aHolds
    const again = await getPublicExtensionRuntime()
    return [before.store.enabled, again.store.enabled]
  })
  await tick(); await tick()
  rows.set('storeEnabled', 'false')
  const b = inRequest(async () => (await getPublicExtensionRuntime()).store.enabled)
  assert.equal(await b, false, 'the later request sees the save')
  releaseA()
  assert.deepEqual(await a, [true, true], 'the earlier request keeps one consistent view for its whole render')
  assert.equal(count('many'), 2)
})

test('transactions and route handlers always read fresh', async () => {
  reset(base())
  await inRequest(async () => {
    await getPublicExtensionRuntime(); await readThemeIndex()
    rows.set('storeEnabled', 'false')
    assert.equal((await getPublicExtensionRuntime(tx)).store.enabled, false, 'a claimed transaction reads its own rows')
    assert.equal((await readThemeIndex(tx)).list.length, 1)
  })
  assert.equal(reads.filter(read => read.label === 'tx').length, 2)
  // No render scope (an API route handler, a job): every call goes to the database.
  reset(base())
  await Promise.all([isPublicApiEnabled(), isPublicApiEnabled(), getPublicExtensionRuntime(), getPublicExtensionRuntime()])
  assert.equal(count('one', 'publicApiEnabled'), 2)
  assert.equal(count('many'), 2)
})

test('a failed read closes modules for that request only and is not remembered', async () => {
  reset(base())
  failNext = 1
  await inRequest(async () => {
    const runtimes = await Promise.all([getPublicExtensionRuntime(), getPublicExtensionRuntime()])
    assert.ok(runtimes.every(runtime => runtime.store.enabled === false && runtime.reviews.enabled === false), 'unavailable storage keeps modules off, as before')
  })
  assert.ok(logs.some(log => log.event === 'extensions.runtime_unavailable'))
  await inRequest(async () => assert.equal((await getPublicExtensionRuntime()).reviews.enabled, true, 'the next request reads again'))
  assert.equal(count('many'), 2)
})
