const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript-api')
function load(file, mocks = {}) {
  const mod = { exports: {} }, code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  new Function('require', 'module', 'exports', code)(name => {
    if (Object.hasOwn(mocks, name)) return mocks[name]
    if (name.startsWith('@/')) return load(`src/${name.slice(2)}.ts`, mocks)
    return require(name)
  }, mod, mod.exports)
  return mod.exports
}
test('co-purchase parameters are bounded and results expose product IDs only', async () => {
  const queries = []
  const { frequentlyBoughtProductIds: read } = load('src/modules/recommendations/server/product-purchases.ts', { '@/platform/database/prisma': { db: { $queryRaw: async (...args) => { queries.push(args); return [{ productId: 8 }] } } } })
  for (const [id, options] of [[0, { days: 90, minimumBuyers: 3 }], [1, { days: 29, minimumBuyers: 3 }], [1, { days: 366, minimumBuyers: 3 }], [1, { days: 90, minimumBuyers: 2 }], [1, { days: 90, minimumBuyers: 101 }]]) assert.deepEqual(await read(id, options), [])
  assert.equal(queries.length, 0)
  const now = new Date('2026-10-04T12:00:00Z')
  assert.deepEqual(await read(1, { days: 90, minimumBuyers: 3, take: 1000 }, now), [8])
  assert.deepEqual(queries[0].slice(1), [1, new Date(now.getTime() - 90 * 86400000), now, 1, 3, 12])
})
test('co-purchase storefront enforces rollout/module/source/target publication before exposing suggestions', async () => {
  for (const state of ['disabled', 'paused', 'missing', 'private', 'ready']) {
    let queries = 0
    const read = load('src/modules/catalog/server/frequently-bought.ts', {
      '@/platform/database/prisma': { db: { product: {
        findUnique: async () => state === 'missing' ? null : ({ active: true, approval: state === 'private' ? 'PENDING' : 'APPROVED' }),
        findMany: async args => { assert.equal(args.where.approval, 'APPROVED'); assert.equal(args.where.active, true); return [{ id: 9, name: 'second' }, { id: 8, name: 'first' }] },
      } } },
      '@/modules/catalog/server/storefront': { isStoreEnabled: async () => state !== 'disabled' },
      '@/modules/store/server/catalog': { getStoreSettings: async () => ({ showFrequentlyBoughtTogether: state !== 'paused', frequentlyBoughtDays: 90, frequentlyBoughtMinimumBuyers: 3 }) },
      '@/modules/recommendations/server/product-purchases': { frequentlyBoughtProductIds: async () => { queries++; return [8, 7, 9] } },
    }).readFrequentlyBoughtProducts
    const result = await read(1)
    if (state === 'ready') assert.deepEqual(result.items.map(item => item.id), [8, 9])
    else { assert.equal(result, null); assert.equal(queries, 0) }
  }
})
test('co-purchase Admin settings preserve omissions, validate bounds and default rollout off', () => {
  const { DEFAULT_STORE_SETTINGS: defaults, normalizeStoreSettings: normalize } = load('src/modules/store/domain/store.ts')
  assert.equal(defaults.showFrequentlyBoughtTogether, false)
  const current = { ...defaults, showFrequentlyBoughtTogether: true, frequentlyBoughtDays: 120, frequentlyBoughtMinimumBuyers: 5 }
  assert.deepEqual(normalize({}, current), current)
  const next = normalize({ frequentlyBoughtDays: 1, frequentlyBoughtMinimumBuyers: 2, showFrequentlyBoughtTogether: false }, current)
  assert.equal(next.frequentlyBoughtDays, 120); assert.equal(next.frequentlyBoughtMinimumBuyers, 5); assert.equal(next.showFrequentlyBoughtTogether, false)
})
