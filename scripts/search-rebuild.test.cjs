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
