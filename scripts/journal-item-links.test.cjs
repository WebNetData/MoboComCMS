const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

function load(file, mocks = {}, cache = new Map()) {
  const absolute = path.resolve(__dirname, '..', file)
  if (cache.has(absolute)) return cache.get(absolute).exports
  const mod = { exports: {} }; cache.set(absolute, mod)
  const code = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText
  const localRequire = name => {
    if (Object.hasOwn(mocks, name)) return mocks[name]
    if (name.startsWith('@/') || name.startsWith('.')) {
      const base = name.startsWith('@/') ? path.resolve(__dirname, '../src', name.slice(2)) : path.resolve(path.dirname(absolute), name)
      for (const suffix of ['.ts', '/index.ts']) if (fs.existsSync(base + suffix)) return load(path.relative(path.resolve(__dirname, '..'), base + suffix), mocks, cache)
    }
    return require(name)
  }
  new Function('require', 'module', 'exports', code)(localRequire, mod, mod.exports)
  return mod.exports
}

test('post links reject malformed or duplicate refs and preserve explicit order', async () => {
  const links = load('src/modules/journal/server/item-links.ts', { '@/platform/database/prisma': { db: {} }, '@/extensions/server/modules': { isModuleEnabled: async () => true } })
  assert.deepEqual(links.parsePostItemLinks([{ type: 'product', id: 5 }, { type: 'product', id: 2 }]), [{ type: 'product', id: 5 }, { type: 'product', id: 2 }])
  for (const input of [null, {}, [{ type: 'game', id: 1 }], [{ type: 'product', id: 0 }], [{ type: 'product', id: 1 }, { type: 'product', id: 1 }], Array.from({ length: 13 }, (_, index) => ({ type: 'product', id: index + 1 }))]) {
    assert.throws(() => links.parsePostItemLinks(input), /Invalid article links/)
  }
  const calls = []
  const tx = {
    product: { findMany: async () => [{ id: 5 }, { id: 2 }] },
    postItemLink: { findMany: async () => [{ itemId: 5 }], deleteMany: async args => calls.push(['delete', args]), createMany: async args => calls.push(['create', args]) },
  }
  const selected = links.parsePostItemLinks([{ type: 'product', id: 5 }, { type: 'product', id: 2 }])
  await links.validatePostItemLinks(tx, selected)
  await links.replacePostItemLinks(tx, 9, selected)
  assert.deepEqual(calls, [['delete', { where: { postId: 9 } }], ['create', { data: [{ postId: 9, itemType: 'product', itemId: 5, position: 0 }, { postId: 9, itemType: 'product', itemId: 2, position: 1 }] }]])
  tx.product.findMany = async () => [{ id: 5 }]
  await assert.rejects(links.validatePostItemLinks(tx, selected), /Linked public product not found/)
  await links.validatePostItemLinks(tx, [{ type: 'product', id: 5 }], 9)
})

test('product picker searches public products and does not reveal withdrawn selected names', async () => {
  const queries = []
  const db = { product: { findMany: async (args) => { queries.push(args); return [] } } }
  const links = load('src/modules/journal/server/item-links.ts', { '@/platform/database/prisma': { db }, '@/extensions/server/modules': { isModuleEnabled: async () => true } })
  assert.deepEqual(await links.searchPostLinkProducts('sample', [8]), { matches: [], selected: [] })
  assert.equal(queries.length, 2)
  assert.ok(queries.every((args) => args.where.active === true && args.where.approval === 'APPROVED'))
  assert.equal(queries[0].take, 25)
  assert.deepEqual(queries[1].where.id.in, [8])
})

test('disabled Store blocks new links while existing references remain intact', async () => {
  const db = { product: { findMany: async () => { throw new Error('should not query products') } } }
  const links = load('src/modules/journal/server/item-links.ts', { '@/platform/database/prisma': { db }, '@/extensions/server/modules': { isModuleEnabled: async () => false } })
  const tx = { product: db.product, postItemLink: { findMany: async () => [{ itemId: 4 }] } }
  assert.deepEqual(await links.searchPostLinkProducts('sample', [4]), { matches: [], selected: [] })
  await links.validatePostItemLinks(tx, [{ type: 'product', id: 4 }], 7)
  await assert.rejects(links.validatePostItemLinks(tx, [{ type: 'product', id: 5 }], 7), /Store module is disabled/)
})

test('product related articles prioritize explicit live links and fill remaining slots', async () => {
  const linked = { id: 2, slug: 'linked', title: 'Linked' }
  const suggested = { id: 3, slug: 'suggested', title: 'Suggested' }
  const latest = { id: 4, slug: 'latest', title: 'Latest' }
  const queries = []
  const db = {
    product: { findUnique: async () => ({ id: 10, name: 'Test product', active: true, approval: 'APPROVED' }) },
    postItemLink: { findMany: async args => { queries.push(args); return [{ post: linked }] } },
    post: { findMany: async args => { queries.push(args); return args.where.OR ? [suggested] : [latest] } },
  }
  const route = load('src/modules/catalog/server/http/product-tabs/route.ts', {
    '@/platform/database/prisma': { db },
    '@/platform/http/response': { ok: value => value, err: (message, status) => ({ message, status }) },
    '@/modules/identity/server/access': { requireUser: async () => null },
    '@/modules/catalog/server/storefront': { isStoreEnabled: async () => true },
    '@/modules/catalog/server/product-config': { attributeFieldsForCategory: async () => [], parseJson: () => ({}) },
    '@/shared/content/sanitize': { cleanRichText: value => value },
    '@/modules/catalog/domain/product-publication': { isPublicProduct: () => true, publicProductWhere: {} },
    '@/modules/journal/domain/journal': { livePostWhere: () => ({ status: 'PUBLISHED', publishedAt: { lte: new Date('2026-01-01') } }) },
    '@/extensions/server/modules': { isModuleEnabled: async () => true },
  })
  const req = { nextUrl: { searchParams: new URL('http://localhost/?tab=related-posts').searchParams } }
  assert.deepEqual(await route.GET(req, { params: Promise.resolve({ slug: 'test' }) }), { items: [linked, suggested, latest] })
  assert.equal(queries[0].where.itemType, 'product')
  assert.equal(queries[0].where.post.status, 'PUBLISHED')
  assert.deepEqual(queries[1].where.id.notIn, [2])
  assert.deepEqual(queries[2].where.id.notIn, [2, 3])
})

test('disabled Journal returns no related articles without reading stored links', async () => {
  const db = {
    product: { findUnique: async () => ({ id: 10, name: 'Test product', active: true, approval: 'APPROVED' }) },
    postItemLink: { findMany: async () => { throw new Error('should not read links') } },
  }
  const route = load('src/modules/catalog/server/http/product-tabs/route.ts', {
    '@/platform/database/prisma': { db },
    '@/platform/http/response': { ok: value => value, err: (message, status) => ({ message, status }) },
    '@/modules/identity/server/access': { requireUser: async () => null },
    '@/modules/catalog/server/storefront': { isStoreEnabled: async () => true },
    '@/modules/catalog/server/product-config': { attributeFieldsForCategory: async () => [], parseJson: () => ({}) },
    '@/shared/content/sanitize': { cleanRichText: value => value },
    '@/modules/catalog/domain/product-publication': { isPublicProduct: () => true, publicProductWhere: {} },
    '@/modules/journal/domain/journal': { livePostWhere: () => ({ status: 'PUBLISHED' }) },
    '@/extensions/server/modules': { isModuleEnabled: async () => false },
  })
  const req = { nextUrl: { searchParams: new URL('http://localhost/?tab=related-posts').searchParams } }
  assert.deepEqual(await route.GET(req, { params: Promise.resolve({ slug: 'test' }) }), { items: [] })
})

test('link product picker keeps Journal permission and bounds selected IDs', async () => {
  let allowed = false
  const searches = []
  const route = load('src/modules/journal/server/http/routes.ts', {
    '@/platform/http/response': { ok: value => value, err: (message, status) => ({ message, status }) },
    '@/platform/audit/server': { auditAdmin: async () => {} },
    '@/modules/identity/server/admin-guard': { adminGuard: async (_req, module, permissions) => {
      assert.equal(module, 'journal'); assert.deepEqual(permissions, ['cms.posts'])
      return allowed ? { admin: { id: 1 } } : { response: 'denied' }
    } },
    '@/modules/journal/server/admin': {},
    '@/modules/journal/server/item-links': { searchPostLinkProducts: async (...args) => { searches.push(args); return { matches: [], selected: [] } } },
  })
  const req = { url: 'http://localhost/api/admin/journal/link-products?q=apple&ids=3,5' }
  assert.equal(await route.GET_linkProducts(req), 'denied')
  assert.equal(searches.length, 0)
  allowed = true
  assert.deepEqual(await route.GET_linkProducts(req), { matches: [], selected: [] })
  assert.deepEqual(searches, [['apple', [3, 5]]])
  assert.deepEqual(await route.GET_linkProducts({ url: 'http://localhost/api/admin/journal/link-products?ids=0' }), { message: 'invalid ids', status: 400 })
})
