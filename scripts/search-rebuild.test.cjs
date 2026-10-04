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

test('cursor navigation crosses page 50, reverses ties and preserves visibility and facets', async () => {
  const rows = Array.from({ length: 1108 }, (_, index) => ({
    id: index + 1, itemType: 'post', itemId: index + 1, title: 'Needle', text: 'needle',
    boost: index % 3, publishedAt: new Date(`2025-01-${String(index % 9 + 1).padStart(2, '0')}T00:00:00Z`),
  }))
  rows.push({ ...rows[0], id: 2000, itemId: 2000, itemType: 'product' })
  let epoch = new Date().toISOString()
  const search = load('src/modules/search/server/search.ts', {
    '@/platform/database/prisma': { db: {
      setting: { findUnique: async () => ({ value: epoch }) },
      searchDocument: { findMany: async ({ where, take }) => rows.filter(row => row.id > where.id.gt).slice(0, take) },
    } },
    '@/extensions/server/modules': { isModuleEnabled: async () => true },
    '@/modules/content/server/registry': {
      enabledItemTypes: async () => ['post', 'product'],
      itemCards: async refs => new Map(refs.filter(ref => ref.id !== 5).map(ref => [`${ref.type}:${ref.id}`, { ...card(ref.id), type: ref.type }])),
    },
    '@/modules/analytics/server/collect': { recordSearch: async () => {} },
  })
  const expected = rows.filter(row => row.itemType === 'post' && row.itemId !== 5)
    .sort((a, b) => b.boost - a.boost || b.publishedAt - a.publishedAt || a.id - b.id).map(row => row.itemId)
  let result = await search.searchSite({ q: 'needle', type: 'post', page: 50, log: false })
  assert.equal(result.pages, 50)
  assert.equal(result.totalPages, 56)
  assert.equal(result.total, 1107)
  assert.deepEqual(result.counts, { post: 1107, product: 1 })
  const page50 = result.hits.map(hit => hit.id)
  assert.deepEqual(page50, expected.slice(980, 1000))
  for (let page = 51; page <= 56; page++) {
    const previous = result
    result = await search.searchSite({ q: 'needle', type: 'post', cursor: previous.nextCursor, log: false })
    assert.equal(result.cursorReset, false)
    assert.equal(result.page, page)
    assert.equal(result.pages, 56)
    assert.deepEqual(result.hits.map(hit => hit.id), expected.slice((page - 1) * 20, page * 20))
    assert.deepEqual(result.counts, previous.counts)
    const back = await search.searchSite({ q: 'needle', type: 'post', cursor: result.previousCursor, log: false })
    assert.deepEqual(back.hits.map(hit => hit.id), previous.hits.map(hit => hit.id))
    assert.equal(back.page, page - 1)
  }
  assert.equal(result.nextCursor, null)
  const removedIds = new Set(result.hits.map(hit => hit.id))
  const lastBoundary = result.previousCursor
  const previousPage = await search.searchSite({ q: 'needle', type: 'post', cursor: lastBoundary, log: false })
  const removed = rows.filter(row => removedIds.has(row.itemId))
  rows.splice(0, rows.length, ...rows.filter(row => !removedIds.has(row.itemId)))
  const emptied = await search.searchSite({ q: 'needle', type: 'post', cursor: previousPage.nextCursor, log: false })
  assert.equal(emptied.cursorReset, true)
  assert.equal(emptied.page, 1)
  assert.equal(emptied.hits.length, 20)
  rows.push(...removed)
  rows.sort((a, b) => a.id - b.id)
  const first = await search.searchSite({ q: 'needle', type: 'post', log: false })
  const second = await search.searchSite({ q: 'needle', type: 'post', cursor: first.nextCursor, log: false })
  const backFirst = await search.searchSite({ q: 'needle', type: 'post', cursor: second.previousCursor, log: false })
  assert.deepEqual(backFirst.hits, first.hits)
  assert.equal(backFirst.previousCursor, null)
  for (const cursor of ['', '!', 'x'.repeat(1025), first.nextCursor.slice(0, -3)]) {
    const reset = await search.searchSite({ q: 'needle', type: 'post', page: 50, cursor, log: false })
    assert.equal(reset.cursorReset, true)
    assert.deepEqual(reset.hits, first.hits)
  }
  const mismatched = await search.searchSite({ q: 'needle', cursor: first.nextCursor, log: false })
  assert.equal(mismatched.cursorReset, true, 'type scope cannot be reused')
  const queryMismatch = await search.searchSite({ q: 'needle other', type: 'post', cursor: first.nextCursor, log: false })
  assert.equal(queryMismatch.cursorReset, true)
  epoch = new Date(Date.now() + 1000).toISOString()
  const stale = await search.searchSite({ q: 'needle', type: 'post', cursor: first.nextCursor, log: false })
  assert.equal(stale.cursorReset, true, 'a rebuilt index invalidates the rank boundary')
  assert.deepEqual(stale.hits, first.hits)
})

test('cursor decoder refuses malformed numeric boundaries without trusting navigation state', () => {
  const { encodeSearchCursor, decodeSearchCursor } = load('src/modules/search/server/cursor.ts')
  const valid = { direction: 'after', page: 51, score: 40.123, publishedAt: Date.now(), boost: 100, id: 9 }
  assert.deepEqual(decodeSearchCursor(encodeSearchCursor(valid, 'scope'), 'scope'), valid)
  for (const delta of [{ page: Infinity }, { page: 0 }, { page: 1.1 }, { score: '40' }, { score: -1 },
    { publishedAt: 9e15 }, { boost: 1_000_001 }, { id: 0 }, { direction: 'unknown' }]) {
    assert.equal(decodeSearchCursor(encodeSearchCursor({ ...valid, ...delta }, 'scope'), 'scope'), null)
  }
  assert.equal(decodeSearchCursor(Buffer.from('null').toString('base64url'), 'scope'), null)
})
