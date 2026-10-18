// Real PostgreSQL songs, a product, reviews and search documents, through the real search. Every document
// carries a word only this script uses, so the search sees these fixtures only; the "index is fresh" mark is
// answered from memory, so the site's own index and its mark are not touched.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript'), { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient(), seed = `sfacet${Date.now()}`
const state = { reviews: true, indexedAt: new Date().toISOString() }
const db = new Proxy(prisma, { get: (target, key) => key === 'setting' ? { findUnique: async () => ({ key: 'search.indexedAt', value: state.indexedAt }), upsert: async () => {} } : typeof target[key] === 'function' ? target[key].bind(target) : target[key] })
const cache = new Map()
function load(file) {
  const full = path.resolve(file.endsWith('.ts') || file.endsWith('.tsx') ? file : fs.existsSync(`${file}.ts`) ? `${file}.ts` : fs.existsSync(`${file}.tsx`) ? `${file}.tsx` : path.join(file, 'index.ts'))
  if (cache.has(full)) return cache.get(full).exports
  const mod = { exports: {} }; cache.set(full, mod)
  const source = ts.transpileModule(fs.readFileSync(full, 'utf8'), { fileName: full, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText
  new Function('require', 'module', 'exports', source)(name => {
    if (name === '@/platform/database/prisma') return { db }
    if (name === '@/platform/observability/logger') return { logEvent: () => {} }
    if (name === '@/extensions/server/modules') return { isModuleEnabled: async id => id === 'reviews' ? state.reviews : true, getModuleSettings: async () => ({}), getModuleStates: async () => ({}) }
    if (name === '@/modules/analytics/server/collect') return { recordSearch: async () => {} }
    if (name === 'react') return { ...require('react'), cache: fn => fn }
    if (name.endsWith('.json')) return JSON.parse(fs.readFileSync(name.startsWith('@/') ? `src/${name.slice(2)}` : path.join(path.dirname(full), name), 'utf8'))
    if (name.startsWith('@/')) return load(`src/${name.slice(2)}`)
    if (name.startsWith('.')) return load(path.join(path.dirname(full), name))
    return require(name)
  }, mod, mod.exports)
  return mod.exports
}
const { searchSite } = load('src/modules/search/server/search.ts'), ratings = load('src/modules/reviews/server/ratings.ts'), facetRules = load('src/modules/search/domain/facets.ts')
const DAY = 86_400_000, ago = days => new Date(Date.now() - days * DAY)

async function main() {
  const artist = await prisma.musicArtist.create({ data: { slug: seed, name: `${seed} artist` } })
  const song = (name, data = {}) => prisma.musicTrack.create({ data: { slug: `${seed}-${name}`, title: `${seed} ${name}`, artistId: artist.id, audioUrl: '/x.mp3', status: 'PUBLISHED', publishedAt: ago(2), ...data } })
  const loved = await song('loved'), fine = await song('fine'), poor = await song('poor'), unrated = await song('unrated'), old = await song('old', { publishedAt: ago(200) })
  const vip = await song('vip', { access: 'MEMBERS' }), turned = await song('turned')
  const product = await prisma.product.create({ data: { slug: `${seed}-product`, name: `${seed} product`, active: true, approval: 'APPROVED', price: 1000, priceMinor: 1000n } })
  const stat = (row, sum, count) => prisma.itemStat.create({ data: { itemType: 'track', itemId: row.id, ratingSum: sum, ratingCount: count } })
  await stat(loved, 23, 5); await stat(fine, 7, 2); await stat(poor, 4, 2); await stat(old, 10, 2); await stat(vip, 9, 2)
  const buyers = await Promise.all([0, 1, 2].map(n => prisma.user.create({ data: { email: `${seed}-${n}@example.invalid`, passwordHash: 'test-only' } })))
  await prisma.productReview.createMany({ data: [{ productId: product.id, userId: buyers[0].id, rating: 5, status: 'APPROVED' }, { productId: product.id, userId: buyers[1].id, rating: 4, status: 'APPROVED' }, { productId: product.id, userId: buyers[2].id, rating: 1, status: 'PENDING' }].map(row => ({ title: 'r', body: 'review body', ...row })) })
  const doc = (type, row, title, extra = {}) => ({ itemType: type, itemId: row.id, title, text: title.toLowerCase(), url: `/x/${row.id}`, publishedAt: ago(2), ...extra })
  await prisma.searchDocument.createMany({ data: [
    ...[loved, fine, poor, unrated, turned].map(row => doc('track', row, row.title)), doc('track', old, old.title, { publishedAt: ago(200) }), doc('track', vip, vip.title, { access: 'MEMBERS' }), doc('product', product, `${seed} product`),
  ] })
  // The index still says "open to all" for a song that has just been made members-only.
  await prisma.musicTrack.update({ where: { id: turned.id }, data: { access: 'MEMBERS' } })
  const names = result => result.hits.map(hit => hit.title.replace(`${seed} `, '')).sort()
  const find = (facets, extra = {}) => searchSite({ q: seed, log: false, facets, ...extra })

  // ---- one answer about ratings from both owners of them
  const asked = await ratings.ratingsOfItems([{ type: 'track', id: loved.id }, { type: 'track', id: unrated.id }, { type: 'product', id: product.id }])
  assert.deepEqual([asked.get(`track:${loved.id}`), asked.get(`track:${unrated.id}`), asked.get(`product:${product.id}`)], [{ average: 4.6, count: 5 }, undefined, { average: 4.5, count: 2 }], 'shared reviews from their totals, a product from its approved buyers\' reviews only')

  // ---- no facet: everything, each result with what members think of it
  const all = await find(null)
  assert.deepEqual([names(all), all.total, all.counts, all.facets], [['fine', 'loved', 'old', 'poor', 'product', 'turned', 'unrated', 'vip'], 8, { track: 7, product: 1 }, facetRules.NO_FACETS])
  const shown = Object.fromEntries(all.hits.map(hit => [hit.title.replace(`${seed} `, ''), hit.rating]))
  assert.deepEqual([shown.loved, shown.unrated, shown.product], [{ average: 4.6, count: 5 }, null, { average: 4.5, count: 2 }])

  // ---- rating: an item nobody rated never passes; the counts by kind follow the facet
  const four = await find({ rated: '4' })
  assert.deepEqual([names(four), four.total, four.counts, four.facets.rated], [['loved', 'old', 'product', 'vip'], 4, { track: 3, product: 1 }, 4])
  assert.deepEqual(names(await find({ rated: 3 })), ['fine', 'loved', 'old', 'product', 'vip'])
  assert.deepEqual(names(await find({ rated: 4 }, { type: 'product' })), ['product'])
  assert.deepEqual([names(await find({ rated: 2 })).length, (await find({ rated: 'high' })).facets.rated], [8, 0], 'a step that is not offered is no facet')

  // ---- who may open it: decided by the item as it is now, not by an index that lags
  assert.deepEqual([names(await find({ access: 'members' })), names(await find({ access: 'free' }))], [['vip'], ['fine', 'loved', 'old', 'poor', 'product', 'unrated']], 'the song that has just become members-only is in neither list until the index catches up: never shown as free')
  await prisma.searchDocument.updateMany({ where: { itemType: 'track', itemId: turned.id }, data: { access: 'MEMBERS' } })
  assert.deepEqual(names(await find({ access: 'members' })), ['turned', 'vip'])

  // ---- how new, and facets together
  assert.deepEqual([names(await find({ since: 'week' })).includes('old'), names(await find({ since: 'year' })).includes('old'), names(await find({ since: 'decade' })).length], [false, true, 8])
  assert.deepEqual(names(await find({ rated: 4, since: 'month', access: 'free' })), ['loved', 'product'])
  assert.deepEqual([(await find({ rated: 4, access: 'members', since: 'week' })).total, names(await find({ rated: 4, access: 'members' }))], [1, ['vip']])

  // ---- a page cursor belongs to the facets it was made under
  const many = Array.from({ length: 25 }, (_, n) => n)
  const extra = await Promise.all(many.map(n => song(`more${n}`)))
  await prisma.searchDocument.createMany({ data: extra.map(row => doc('track', row, row.title)) })
  await prisma.itemStat.createMany({ data: extra.map(row => ({ itemType: 'track', itemId: row.id, ratingSum: 9, ratingCount: 2 })) })
  const first = await find({ rated: 4 })
  assert.deepEqual([first.hits.length, first.total, typeof first.nextCursor], [20, 29, 'string'])
  const second = await find({ rated: 4 }, { cursor: first.nextCursor })
  assert.deepEqual([second.cursorReset, second.hits.length, second.page, new Set([...first.hits, ...second.hits].map(hit => `${hit.type}:${hit.id}`)).size], [false, 9, 2, 29], 'the next page under the same facets: nothing repeated, nothing lost')
  const other = await find({ rated: 3 }, { cursor: first.nextCursor })
  assert.deepEqual([other.cursorReset, other.page], [true, 1], 'the same cursor under other facets starts again instead of continuing another list')
  assert.equal((await find(null, { cursor: first.nextCursor })).cursorReset, true)

  // Explicit orders use the same bounded window/cursor; old relevance cursor scopes stay unchanged.
  await prisma.searchDocument.updateMany({ where: { itemType: 'track', itemId: loved.id }, data: { publishedAt: ago(1) } })
  await prisma.musicTrack.update({ where: { id: loved.id }, data: { publishedAt: ago(1) } })
  assert.equal(facetRules.normalizeFacets({ since: 'constructor' }).since, '')
  const newest = await find({ sort: 'newest' }), highest = await find({ sort: 'rating' })
  assert.deepEqual([newest.hits[0].type, newest.hits[0].id], ['product', product.id], 'newest uses the current owner publication time, including a product just created')
  assert.equal(highest.hits[0].id, old.id, 'highest-rated outranks a more recent, more relevant lower rating')
  for (const sort of ['newest', 'rating']) {
    const firstPage = await find({ sort }), nextPage = await find({ sort }, { cursor: firstPage.nextCursor })
    assert.equal(new Set([...firstPage.hits, ...nextPage.hits].map(hit => `${hit.type}:${hit.id}`)).size, firstPage.total)
    assert.equal((await find({ sort }, { cursor: nextPage.previousCursor })).hits[0].id, firstPage.hits[0].id)
    assert.equal((await find({ sort: sort === 'newest' ? 'rating' : 'newest' }, { cursor: firstPage.nextCursor })).cursorReset, true)
  }
  const scored = await prisma.itemReview.create({ data: { itemType: 'track', itemId: loved.id, userId: buyers[0].id, rating: 5, body: 'approved dimensions', status: 'APPROVED', scores: { create: [{ key: 'lyrics', score: 5 }, { key: 'production', score: 3 }] } } })
  await prisma.itemReview.create({ data: { itemType: 'track', itemId: poor.id, userId: buyers[1].id, rating: 5, body: 'private pending', status: 'PENDING', scores: { create: { key: 'lyrics', score: 5 } } } })
  assert.deepEqual(names(await find({ dimension: 'lyrics', dimensionMin: 4 })), ['loved'], 'only approved scores count; unsupported/unscored items do not pass')
  assert.deepEqual(names(await find({ dimension: 'production', dimensionMin: 4 })), [])
  assert.deepEqual(names(await find({ dimension: 'production', dimensionMin: 3, sort: 'newest' })), ['loved'])
  assert.equal((await find({ dimension: 'lyrics' }, { cursor: newest.nextCursor })).cursorReset, true)
  await prisma.itemReview.update({ where: { id: scored.id }, data: { status: 'REJECTED' } })
  assert.deepEqual(names(await find({ dimension: 'lyrics' })), [], 'a changed approval is reflected without rebuilding search')

  // ---- autocomplete is never narrowed; reviews switched off
  assert.equal((await searchSite({ q: seed, log: false, suggestion: true, facets: { rated: 4, access: 'members' } })).hits.length > 4, true)
  state.reviews = false
  assert.deepEqual(names(await find({ rated: 4 })), ['product'], 'with shared reviews off only what its own owner still rates passes')
  state.reviews = true
  assert.deepEqual([facetRules.facetParams({ access: 'free', rated: 4, since: 'week' }), facetRules.facetParams(facetRules.NO_FACETS), facetRules.facetKey(facetRules.NO_FACETS)], ['access=free&rated=4&since=week', '', ''])
  console.log('PostgreSQL search facets: ratings read from both owners, rating, access and recency facets alone and together, counts by kind under facets, page cursors bound to their facets, and autocomplete left alone passed')
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => {
  try {
    const tracks = (await prisma.musicTrack.findMany({ where: { slug: { startsWith: seed } }, select: { id: true } })).map(row => row.id)
    const products = (await prisma.product.findMany({ where: { slug: { startsWith: seed } }, select: { id: true } })).map(row => row.id)
    await prisma.searchDocument.deleteMany({ where: { OR: [{ itemType: 'track', itemId: { in: tracks } }, { itemType: 'product', itemId: { in: products } }] } })
    await prisma.itemStat.deleteMany({ where: { itemType: 'track', itemId: { in: tracks } } })
    await prisma.itemReview.deleteMany({ where: { itemType: 'track', itemId: { in: tracks } } })
    await prisma.productReview.deleteMany({ where: { productId: { in: products } } }); await prisma.product.deleteMany({ where: { id: { in: products } } })
    await prisma.musicTrack.deleteMany({ where: { id: { in: tracks } } }); await prisma.musicArtist.deleteMany({ where: { slug: seed } })
    await prisma.user.deleteMany({ where: { email: { startsWith: seed } } })
  } finally { await prisma.$disconnect() }
})
