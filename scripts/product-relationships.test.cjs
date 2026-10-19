const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript-api')
function load(file, mocks = {}) {
  const mod = { exports: {} }, code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText
  new Function('require', 'module', 'exports', code)(name => {
    if (Object.hasOwn(mocks, name)) return mocks[name]
    if (name.startsWith('@/')) return load(`src/${name.slice(2)}.ts`, mocks)
    return require(name)
  }, mod, mod.exports)
  return mod.exports
}
test('editorial references preserve directed kind/order and reject self/duplicates/invalid/unbounded input', () => {
  const { parseProductRelationships: parse } = load('src/modules/catalog/domain/product-relationships.ts')
  const valid = [{ kind: 'COMPATIBLE', targetId: 2 }, { kind: 'RELATED', targetId: 2 }, { kind: 'RELATED', targetId: 3 }]
  assert.deepEqual(parse(valid, 1), valid)
  for (const value of [null, {}, [{ kind: 'BUNDLE', targetId: 2 }], [{ kind: 'RELATED', targetId: '2' }], [{ kind: 'RELATED', targetId: 0 }], [{ kind: 'RELATED', targetId: 1 }], [valid[0], valid[0]], Array.from({ length: 13 }, (_, i) => ({ kind: 'RELATED', targetId: i + 2 }))]) assert.throws(() => parse(value, 1))
})
test('replacement rejects new private references before deleting and permits retained withdrawn references on pause', async () => {
  for (const state of ['private', 'paused', 'retained', 'ready']) {
    const writes = []
    const service = load('src/modules/catalog/server/product-relationships.ts', { '@/platform/database/prisma': { db: {} }, '@/modules/catalog/server/storefront': { isStoreEnabled: async () => state !== 'paused' && state !== 'retained' } })
    const tx = {
      productRelationship: { findMany: async () => state === 'retained' ? [{ kind: 'RELATED', targetId: 2 }] : [], deleteMany: async args => writes.push(args), createMany: async args => writes.push(args) },
      product: { findMany: async args => { assert.equal(args.where.active, true); assert.equal(args.where.approval, 'APPROVED'); return state === 'private' ? [] : [{ id: 2 }] } },
    }
    const call = service.replaceProductRelationships(tx, 1, [{ kind: 'RELATED', targetId: 2 }])
    if (state === 'private' || state === 'paused') { await assert.rejects(call); assert.equal(writes.length, 0) }
    else { await call; assert.deepEqual(writes[1].data, [{ productId: 1, kind: 'RELATED', targetId: 2, position: 0 }]) }
    await assert.rejects(service.replaceProductRelationships(tx, 1, [{ kind: 'RELATED', targetId: 1 }]), /itself/)
  }
})
test('public editorial read gates rollout/source/Store and preserves current target order without hidden cards', async () => {
  for (const state of ['disabled', 'paused', 'private', 'ready']) {
    let lookups = 0
    const read = load('src/modules/catalog/server/product-relationship-read.ts', {
      '@/platform/database/prisma': { db: { product: {
        findUnique: async () => ({ active: true, approval: state === 'private' ? 'PENDING' : 'APPROVED' }),
        findMany: async args => { assert.equal(args.where.approval, 'APPROVED'); return [{ id: 8 }, { id: 9 }] },
      } } },
      '@/modules/catalog/server/storefront': { isStoreEnabled: async () => state !== 'disabled' },
      '@/modules/store/server/catalog': { getStoreSettings: async () => ({ showProductRelationships: state !== 'paused' }) },
      '@/modules/catalog/server/product-relationships': { publicProductRelationshipIds: async () => { lookups++; return [9, 7, 8] } },
    }).readEditorialProductCards
    const result = await read(1, 'COMPATIBLE')
    if (state === 'ready') assert.deepEqual(result.items.map(row => row.id), [9, 8])
    else { assert.equal(result, null); assert.equal(lookups, 0) }
    assert.equal(await read(0, 'RELATED'), null)
  }
})
test('relationship settings preserve omitted behavior and start with rollout off', () => {
  const { DEFAULT_STORE_SETTINGS: defaults, normalizeStoreSettings: normalize } = load('src/modules/store/domain/store.ts')
  assert.equal(defaults.showProductRelationships, false)
  assert.equal(normalize({}, { ...defaults, showProductRelationships: true }).showProductRelationships, true)
  assert.equal(normalize({ showProductRelationships: false }, { ...defaults, showProductRelationships: true }).showProductRelationships, false)
})
test('existing related rail puts editorial order first and fills without duplicate products', async () => {
  const queries = [], row = id => ({ id, slug: `p${id}`, name: `Product ${id}`, variants: [], currency: 'USD', stock: -1, createdAt: new Date(), saleEndsAt: null, description: '', brand: null, category: null })
  const service = load('src/modules/store/server/catalog.ts', {
    '@/platform/database/prisma': { db: { product: { findMany: async args => {
      queries.push(args); const ids = args.where.AND[1].id
      if (ids.in) return [row(2), row(3)]
      return ids.notIn.length === 3 ? [row(4)] : [row(5)]
    } }, productReview: { groupBy: async () => [] } } },
    '@/modules/settings/server': { readJsonSetting: async () => ({ showProductRelationships: true }) },
    '@/modules/catalog/server/product-relationships': { publicProductRelationshipIds: async () => [3, 2] },
    '@/modules/store/server/pricing': { unitPrice: () => ({ unitMinor: 100n, listMinor: 0n, currency: 'USD' }) },
    '@/shared/money': { minorToNumber: () => 1 },
  })
  assert.deepEqual((await service.relatedProducts({ id: 1, categoryId: 7, brandId: null }, 4)).map(card => card.id), [3, 2, 4, 5])
  assert.deepEqual(queries[1].where.AND[1].id.notIn, [1, 3, 2])
  assert.deepEqual(queries[2].where.AND[1].id.notIn, [1, 3, 2, 4])
  assert.deepEqual(queries.map(query => query.take), [4, 2, 1])
})
test('Catalog picker retains cms.products, bounds refs and filters source through the shared registry', async () => {
  let denied = true, lookups = 0
  const handler = load('src/modules/catalog/server/http/admin/relationship-items/route.ts', {
    '@/modules/identity/server/admin-guard': { adminGuard: async (req, moduleId, permissions) => { assert.deepEqual(permissions, ['cms.products']); return denied ? { response: { status: 403 } } : { admin: { id: 1 } } } },
    '@/platform/http/response': { err: (error, status) => ({ error, status }), ok: body => body },
    '@/modules/catalog/server/storefront': { isStoreEnabled: async () => true },
    // The route imports the database client for its variant lookup; without this the real client starts in the background.
    '@/platform/database/prisma': { db: {} },
    '@/modules/content/server/registry': {
      searchItemCards: async (q, types, take) => { lookups++; assert.deepEqual(types, ['product']); assert.equal(take, 20); return [1, 2].map(id => ({ id, type: 'product', title: `P${id}`, url: `/products/p${id}`, image: '' })) },
      itemCards: async () => new Map(),
    },
  }).GET
  const req = query => ({ nextUrl: new URL(`http://localhost/?${query}`) })
  assert.equal((await handler(req('q=product'))).status, 403); assert.equal(lookups, 0)
  denied = false
  assert.equal((await handler(req('refs=product:2,product:2'))).status, 400)
  assert.equal((await handler(req('refs=game:2'))).status, 400)
  assert.deepEqual((await handler(req('sourceId=1&q=Product'))).matches.map(row => row.id), [2])
})
