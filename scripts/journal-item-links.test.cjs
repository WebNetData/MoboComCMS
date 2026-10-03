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
      for (const suffix of ['.json', '.ts', '/index.ts']) {
        const candidate = base + suffix
        if (fs.existsSync(candidate)) {
          if (suffix === '.json') return require(candidate)
          return load(path.relative(path.resolve(__dirname, '..'), candidate), mocks, cache)
        }
      }
    }
    return require(name)
  }
  new Function('require', 'module', 'exports', code)(localRequire, mod, mod.exports)
  return mod.exports
}

const key = (type, id) => `${type}:${id}`
const card = (type, id, title) => ({ type, id, title, titleEn: `English ${title}`, url: `/${type}/${id}`, image: '' })
const itemMocks = (registry, module = true, store = true) => ({ '@/platform/database/prisma': { db: {} }, '@/modules/content/server/registry': registry, '@/extensions/server/modules': { isModuleEnabled: async () => module }, '@/modules/catalog/server/storefront': { isStoreEnabled: async () => store } })
const registryOf = (enabled, visible = []) => ({
  enabledItemTypes: async () => enabled,
  itemCards: async (refs) => new Map(refs.filter((ref) => visible.some((entry) => key(entry.type, entry.id) === key(ref.type, ref.id))).map((ref) => [key(ref.type, ref.id), visible.find((entry) => key(entry.type, entry.id) === key(ref.type, ref.id))])),
  searchItemCards: async () => [],
})

test('post links accept registry entity types and reject articles, threads and duplicates', async () => {
  const links = load('src/modules/journal/server/item-links.ts', itemMocks(registryOf(['product'])))
  assert.deepEqual(links.parsePostLinkRefs('game:5,product:5'), [{ type: 'game', id: 5 }, { type: 'product', id: 5 }])
  for (const value of ['game:1:2', 'game:1e2', 'game:01', 'post:1', 'thread:1', 'game:1,game:1']) assert.equal(links.parsePostLinkRefs(value), null)
  assert.deepEqual(links.parsePostItemLinks([{ type: 'game', id: 5 }, { type: 'product', id: 5 }, { type: 'product', id: 2 }]), [{ type: 'game', id: 5 }, { type: 'product', id: 5 }, { type: 'product', id: 2 }])
  for (const input of [null, {}, [{ type: 'post', id: 1 }], [{ type: 'thread', id: 1 }], [{ type: 'movie', id: 1 }], [{ type: 'game', id: 0 }], [{ type: 'product', id: 1 }, { type: 'product', id: 1 }], Array.from({ length: 13 }, (_, index) => ({ type: 'product', id: index + 1 }))]) {
    assert.throws(() => links.parsePostItemLinks(input), /Invalid article links/)
  }
  const calls = []
  const guarded = load('src/modules/journal/server/item-links.ts', itemMocks(registryOf(['game', 'product'], [card('game', 5, 'Fifth quest'), card('product', 5, 'Fifth tool'), card('product', 2, 'Second tool')])))
  const tx = {
    postItemLink: { findMany: async () => [{ itemType: 'game', itemId: 5 }], deleteMany: async args => calls.push(['delete', args]), createMany: async args => calls.push(['create', args]) },
  }
  const selected = guarded.parsePostItemLinks([{ type: 'game', id: 5 }, { type: 'product', id: 5 }, { type: 'product', id: 2 }])
  await guarded.validatePostItemLinks(tx, selected, 9)
  await guarded.replacePostItemLinks(tx, 9, selected)
  assert.deepEqual(calls, [['delete', { where: { postId: 9 } }], ['create', { data: [{ postId: 9, itemType: 'game', itemId: 5, position: 0 }, { postId: 9, itemType: 'product', itemId: 5, position: 1 }, { postId: 9, itemType: 'product', itemId: 2, position: 2 }] }]])
  await assert.rejects(guarded.validatePostItemLinks(tx, [...selected, { type: 'software', id: 7 }], 9), /Linked public item not found/)
  await guarded.validatePostItemLinks(tx, [{ type: 'game', id: 5 }], 9)
})

test('legacy product response retains names, slug and publication fields', async () => {
  const product = { id: 5, name: 'Product', nameEn: 'English product', slug: 'product', active: true, approval: 'APPROVED' }
  const queries = []
  const db = { product: { findMany: async args => { queries.push(args); return [product] } } }
  const links = load('src/modules/journal/server/item-links.ts', { ...itemMocks(registryOf(['product'])), '@/platform/database/prisma': { db } })
  assert.deepEqual(await links.searchPostLinkProducts('product', [5]), { matches: [product], selected: [product] })
  assert.deepEqual(queries[1].select, { id: true, name: true, nameEn: true, slug: true, active: true, approval: true })
})
test('picker searches one linkable type and resolves selected refs without leaking hidden targets', async () => {
  const game = card('game', 5, 'Fifth quest')
  const tool = card('product', 8, 'Eighth tool')
  const seen = []
  const registry = {
    enabledItemTypes: async () => ['game', 'product'],
    searchItemCards: async (q, types, take) => { seen.push([q, types, take]); return [game] },
    itemCards: async (refs) => new Map(refs.filter((ref) => key(ref.type, ref.id) === key(tool.type, tool.id)).map((ref) => [key(ref.type, ref.id), tool])),
  }
  const links = load('src/modules/journal/server/item-links.ts', itemMocks(registry))
  assert.deepEqual(await links.searchPostLinkItems('game', 'quest', [{ type: 'product', id: 8 }, { type: 'product', id: 9 }]), { matches: [game], selected: [tool] })
  assert.deepEqual(seen, [['quest', ['game'], 25]])
  assert.deepEqual(await links.searchPostLinkItems('post', 'quest', [{ type: 'game', id: 5 }]), { matches: [], selected: [] })
  const storeClosed = load('src/modules/journal/server/item-links.ts', itemMocks(registry, true, false))
  assert.deepEqual(await storeClosed.searchPostLinkItems('product', 'tool', [{ type: 'product', id: 8 }]), { matches: [], selected: [] })
})
test('article rail keeps editor order across entity types and drops hidden targets', async () => {
  const game = card('game', 5, 'Fifth quest')
  const tool = card('product', 8, 'Eighth tool')
  const db = {
    postItemLink: { findMany: async args => {
      assert.deepEqual(args.where, { postId: 17 })
      assert.equal(args.take, 12)
      return [{ itemType: 'game', itemId: 5 }, { itemType: 'product', itemId: 9 }, { itemType: 'product', itemId: 8 }]
    } },
  }
  const links = load('src/modules/journal/server/item-links.ts', { '@/platform/database/prisma': { db }, '@/modules/content/server/registry': registryOf(['game', 'product'], [game, tool]), '@/extensions/server/modules': { isModuleEnabled: async () => true }, '@/modules/catalog/server/storefront': { isStoreEnabled: async () => true } })
  assert.deepEqual(await links.publicPostLinkItems(17), [game, tool])
})

test('closed storefront hides linked products while other linked entities still render', async () => {
  const game = card('game', 5, 'Fifth quest')
  const db = { postItemLink: { findMany: async () => [{ itemType: 'game', itemId: 5 }, { itemType: 'product', itemId: 8 }] } }
  const closed = load('src/modules/journal/server/item-links.ts', { '@/platform/database/prisma': { db }, '@/modules/content/server/registry': registryOf(['game', 'product'], [game]), '@/extensions/server/modules': { isModuleEnabled: async () => true }, '@/modules/catalog/server/storefront': { isStoreEnabled: async () => false } })
  assert.deepEqual(await closed.publicPostLinkItems(17), [game])
})

test('disabled Store blocks new product links while existing references remain intact', async () => {
  const links = load('src/modules/journal/server/item-links.ts', itemMocks(registryOf(['game'], [card('game', 4, 'Fourth quest')]), false))
  const tx = { postItemLink: { findMany: async () => [{ itemType: 'game', itemId: 4 }] } }
  assert.deepEqual(await links.searchPostLinkItems('product', 'sample', [{ type: 'product', id: 4 }]), { matches: [], selected: [] })
  await links.validatePostItemLinks(tx, [{ type: 'game', id: 4 }], 7)
  await assert.rejects(links.validatePostItemLinks(tx, [{ type: 'product', id: 5 }], 7), /Store is unavailable/)
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
  const tabMocks = (module) => ({
    '@/platform/database/prisma': { db },
    '@/platform/http/response': { ok: value => value, err: (message, status) => ({ message, status }) },
    '@/modules/identity/server/access': { requireUser: async () => null },
    '@/modules/catalog/server/storefront': { isStoreEnabled: async () => true },
    '@/modules/catalog/server/product-config': { attributeFieldsForCategory: async () => [], parseJson: () => ({}) },
    '@/shared/content/sanitize': { cleanRichText: value => value },
    '@/modules/catalog/domain/product-publication': { isPublicProduct: () => true, publicProductWhere: {} },
    '@/modules/journal/domain/journal': { livePostWhere: () => ({ status: 'PUBLISHED', publishedAt: { lte: new Date('2026-01-01') } }) },
    '@/extensions/server/modules': module,
  })
  const route = load('src/modules/catalog/server/http/product-tabs/route.ts', tabMocks({ isModuleEnabled: async () => true }))
  const req = { nextUrl: { searchParams: new URL('http://localhost/?tab=related-posts').searchParams } }
  assert.deepEqual(await route.GET(req, { params: Promise.resolve({ slug: 'test' }) }), { items: [linked, suggested, latest] })
  assert.equal(queries[0].where.itemType, 'product')
  assert.equal(queries[0].where.post.status, 'PUBLISHED')
  assert.deepEqual(queries[1].where.id.notIn, [2])
  assert.deepEqual(queries[2].where.id.notIn, [2, 3])
})

test('disabled Journal returns no related articles without reading stored links', async () => {
  const closed = load('src/modules/catalog/server/http/product-tabs/route.ts', {
    '@/platform/database/prisma': { db: { product: { findUnique: async () => ({ id: 10, name: 'Test product', active: true, approval: 'APPROVED' }) }, postItemLink: { findMany: async () => { throw new Error('should not read links') } } } },
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
  assert.deepEqual(await closed.GET(req, { params: Promise.resolve({ slug: 'test' }) }), { items: [] })
})

const pickerRoute = (allowed, searches) => load('src/modules/journal/server/http/routes.ts', {
  '@/platform/http/response': { ok: value => value, err: (message, status) => ({ message, status }) },
  '@/platform/audit/server': { auditAdmin: async () => {} },
  '@/modules/identity/server/admin-guard': { adminGuard: async (_req, mod, permissions) => {
    assert.equal(mod, 'journal'); assert.deepEqual(permissions, ['cms.posts'])
    return allowed ? { admin: { id: 1 } } : { response: 'denied' }
  } },
  '@/modules/journal/server/admin': {},
  '@/modules/journal/server/item-links': { searchPostLinkItems: async (...args) => { searches.push(args); return { matches: [], selected: [] } }, parsePostLinkRefs: (value) => value === 'game:3,game:5' ? [{ type: 'game', id: 3 }, { type: 'game', id: 5 }] : null },
})

test('picker keeps the Journal permission and bounds refs and types', async () => {
  const searches = []
  const req = { url: 'http://localhost/api/admin/journal/link-items?type=game&q=apple&refs=game:3,game:5' }
  assert.equal(await pickerRoute(false, searches).GET_linkItems(req), 'denied')
  assert.equal(searches.length, 0)
  const open = pickerRoute(true, searches)
  assert.deepEqual(await open.GET_linkItems(req), { matches: [], selected: [] })
  assert.deepEqual(searches, [['game', 'apple', [{ type: 'game', id: 3 }, { type: 'game', id: 5 }]]])
  assert.deepEqual(await open.GET_linkItems({ url: 'http://localhost/api/admin/journal/link-items?type=game&refs=bogus' }), { message: 'invalid refs', status: 400 })
})
test('legacy product picker keeps its contract and permission boundary', async () => {
  const searches = []
  const legacy = (allowed) => load('src/modules/journal/server/http/routes.ts', {
    '@/platform/http/response': { ok: value => value, err: (message, status) => ({ message, status }) },
    '@/platform/audit/server': { auditAdmin: async () => {} },
    '@/modules/identity/server/admin-guard': { adminGuard: async () => allowed ? { admin: { id: 1 } } : { response: 'denied' } },
    '@/modules/journal/server/admin': {},
    '@/modules/journal/server/item-links': { searchPostLinkProducts: async (...args) => { searches.push(args); return { matches: [], selected: [] } }, parsePostLinkRefs: () => [] },
  })
  const req = { url: 'http://localhost/api/admin/journal/link-products?q=apple&ids=3,5' }
  assert.equal(await legacy(false).GET_linkProducts(req), 'denied')
  assert.equal(searches.length, 0)
  assert.deepEqual(await legacy(true).GET_linkProducts(req), { matches: [], selected: [] })
  assert.deepEqual(searches, [['apple', [3, 5]]])
  assert.deepEqual(await legacy(true).GET_linkProducts({ url: 'http://localhost/api/admin/journal/link-products?ids=0' }), { message: 'invalid ids', status: 400 })
})
