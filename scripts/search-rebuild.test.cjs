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

const card = id => ({ type: 'post', id, slug: `post-${id}`, title: `Post ${id}`, subtitle: '', summary: '', keywords: '', url: `/blog/post-${id}`, image: '', access: 'PUBLIC', popularity: 0, publishedAt: new Date(), updatedAt: new Date() })

test('full search rebuild scans past 5,000 items and replaces the index once', async () => {
  const cursors = []
  const indexed = []
  let deleted = 0
  let stamped = 0
  let transactions = 0
  const db = { $transaction: async fn => {
    transactions++
    return fn({
      searchDocument: { deleteMany: async () => { deleted++ }, createMany: async ({ data }) => { assert.ok(data.length <= 500); indexed.push(...data) } },
      setting: { upsert: async () => { stamped++ } },
    })
  } }
  const search = load('src/modules/search/server/search.ts', {
    '@/platform/database/prisma': { db },
    '@/platform/observability/logger': { logEvent: () => {} },
    '@/extensions/server/modules': { isModuleEnabled: async () => true },
    '@/modules/content/server/registry': {
      enabledItemTypes: async () => ['post'],
      searchIndexPage: async (_type, afterId, take) => {
        cursors.push(afterId)
        return Array.from({ length: Math.min(take, 5001 - afterId) }, (_, index) => card(afterId + index + 1))
      },
    },
    '@/modules/analytics/server/collect': {},
  })
  assert.equal(await search.rebuildSearchIndex(), 5001)
  assert.deepEqual(cursors, [0, 500, 1000, 1500, 2000, 2500, 3000, 3500, 4000, 4500, 5000])
  assert.equal(indexed.length, 5001)
  assert.equal(indexed[5000].itemId, 5001)
  assert.equal(new Set(indexed.map(row => row.itemId)).size, 5001)
  assert.equal(transactions, 1)
  assert.equal(deleted, 1)
  assert.equal(stamped, 1)
})

test('a broken index page fails before the existing index is replaced', async () => {
  let transactions = 0
  const search = load('src/modules/search/server/search.ts', {
    '@/platform/database/prisma': { db: { $transaction: async () => { transactions++ } } },
    '@/platform/observability/logger': { logEvent: () => {} },
    '@/extensions/server/modules': { isModuleEnabled: async () => true },
    '@/modules/content/server/registry': { enabledItemTypes: async () => ['post'], searchIndexPage: async () => [card(2), card(1)] },
    '@/modules/analytics/server/collect': {},
  })
  await assert.rejects(search.rebuildSearchIndex(), /not ordered/)
  assert.equal(transactions, 0)
})

test('public search ranks beyond the old candidate bound and counts visible matches', async () => {
  const rows = Array.from({ length: 521 }, (_, index) => ({
    id: index + 1, itemType: 'post', itemId: index + 1,
    title: index === 520 ? 'Needle' : `Guide ${index + 1}`,
    text: 'needle', boost: index === 520 ? 0 : 1000,
    publishedAt: new Date('2025-01-01T00:00:00Z'),
  }))
  const cursors = []
  const db = {
    setting: { findUnique: async () => ({ value: new Date().toISOString() }) },
    searchDocument: { findMany: async ({ where, orderBy, take }) => {
      cursors.push(where.id?.gt ?? 0)
      const ordered = orderBy.id === 'asc' ? rows : [...rows].sort((a, b) => b.boost - a.boost)
      return ordered.filter(row => row.id > (where.id?.gt ?? 0)).slice(0, take)
    } },
  }
  const search = load('src/modules/search/server/search.ts', {
    '@/platform/database/prisma': { db },
    '@/extensions/server/modules': { isModuleEnabled: async () => true },
    '@/modules/content/server/registry': {
      enabledItemTypes: async () => ['post'],
      itemCards: async refs => new Map(refs.filter(ref => ref.id !== 2).map(ref => [`post:${ref.id}`, card(ref.id)])),
    },
    '@/modules/analytics/server/collect': { recordSearch: async () => {} },
  })
  const first = await search.searchSite({ q: 'needle', log: false })
  assert.equal(first.total, 520, 'one hidden source card is excluded from the exact count')
  assert.equal(first.counts.post, 520)
  assert.equal(first.pages, 26)
  assert.equal(first.hits[0].id, 521, 'an exact title match outranks 500 popular text matches')
  assert.deepEqual(cursors, [0, 500])
  const last = await search.searchSite({ q: 'needle', page: 26, log: false })
  assert.equal(last.hits.length, 20)
  assert.equal(last.total, 520)
})

test('section suggestions query their own type in the bounded autocomplete path', async () => {
  const queriedTypes = []
  const db = {
    setting: { findUnique: async () => ({ value: new Date().toISOString() }) },
    searchDocument: { findMany: async ({ where, take }) => {
      queriedTypes.push(where.itemType.in)
      assert.equal(take, 400)
      return []
    } },
  }
  const search = load('src/modules/search/server/search.ts', {
    '@/platform/database/prisma': { db },
    '@/extensions/server/modules': { isModuleEnabled: async () => true },
    '@/modules/content/server/registry': { enabledItemTypes: async () => ['post', 'product'] },
    '@/modules/analytics/server/collect': { recordSearch: async () => {} },
  })
  assert.deepEqual(await search.suggest('needle', ['post', 'product']), [])
  assert.deepEqual(queriedTypes, [['post'], ['product']])
})

test('public search reports all matches while retaining the existing 50-page window', async () => {
  const rows = Array.from({ length: 1001 }, (_, index) => ({
    id: index + 1, itemType: 'post', itemId: index + 1, title: `Needle ${index + 1}`,
    text: 'needle', boost: 0, publishedAt: new Date('2025-01-01T00:00:00Z'),
  }))
  const db = {
    setting: { findUnique: async () => ({ value: new Date().toISOString() }) },
    searchDocument: { findMany: async ({ where, take }) => rows.filter(row => row.id > where.id.gt).slice(0, take) },
  }
  const search = load('src/modules/search/server/search.ts', {
    '@/platform/database/prisma': { db },
    '@/extensions/server/modules': { isModuleEnabled: async () => true },
    '@/modules/content/server/registry': {
      enabledItemTypes: async () => ['post'],
      itemCards: async refs => new Map(refs.map(ref => [`post:${ref.id}`, card(ref.id)])),
    },
    '@/modules/analytics/server/collect': { recordSearch: async () => {} },
  })
  const last = await search.searchSite({ q: 'needle', page: 51, log: false })
  assert.equal(last.total, 1001)
  assert.equal(last.counts.post, 1001)
  assert.equal(last.pages, 50)
  assert.equal(last.page, 50)
  assert.equal(last.hits.length, 20)
})
