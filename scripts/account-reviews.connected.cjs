// Real PostgreSQL "My reviews" account read; module switches and the public item registry are test doubles.
const assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript'), {PrismaClient} = require('@prisma/client')
const db = new PrismaClient(), seed = `account-reviews-${Date.now()}`, base = 800_000_000 + (Date.now() % 50_000_000)
const state = {reviews: true, store: true, hidden: new Set()}
const mocks = {
 '@/platform/database/prisma': {db},
 '@/platform/http/rate-limit': {rateLimitHit: () => ({ok: true})},
 '@/platform/observability/logger': {logEvent: () => {}},
 '@/extensions/server/modules': {isModuleEnabled: async id => id === 'reviews' ? state.reviews : true, getModuleSettings: async () => ({})},
 '@/modules/catalog/server/storefront': {isStoreEnabled: async () => state.store},
 '@/modules/notifications/server/inbox': {createInboxEvent: async () => ({})},
 // Public cards only: an item in `hidden` is unpublished.
 '@/modules/content/server/registry': {
  itemCard: async ref => state.hidden.has(ref.id) ? null : {type: ref.type, id: ref.id, title: `game ${ref.id}`, url: `/games/${ref.id}`, image: ''},
  itemCards: async refs => new Map(refs.filter(ref => !state.hidden.has(ref.id)).map(ref => [`${ref.type}:${ref.id}`, {type: ref.type, id: ref.id, title: `game ${ref.id}`, url: `/games/${ref.id}`, image: ''}])),
 },
}
function load(file, cache = new Map()) {
 if (cache.has(file)) return cache.get(file).exports
 const mod = {exports: {}}; cache.set(file, mod)
 new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}}).outputText)(name => {
  if (Object.hasOwn(mocks, name)) return mocks[name]
  if (name.startsWith('@/')) {const path = `src/${name.slice(2)}`; return load(fs.existsSync(path + '.ts') ? path + '.ts' : path + '/index.ts', cache)}
  return require(name)
 }, mod, mod.exports)
 return mod.exports
}
const at = minutes => new Date(Date.UTC(2026, 0, 1, 12, minutes))
async function main() {
 const account = load('src/modules/account/server/reviews.ts')
 const [member, other] = await Promise.all(['member', 'other'].map(name => db.user.create({data: {email: `${seed}-${name}@example.invalid`, passwordHash: 'test-only'}})))
 const live = await db.product.create({data: {slug: `${seed}-live`, name: 'Live product', price: 1, priceMinor: 100n, currency: 'USD', stock: 5, approval: 'APPROVED'}})
 const withdrawn = await db.product.create({data: {slug: `${seed}-withdrawn`, name: 'Secret product', price: 1, priceMinor: 100n, currency: 'USD', stock: 5, approval: 'PENDING'}})
 // Twelve shared reviews (minutes 1..12) and two product reviews (minutes 20 and 6) for the member; others belong to someone else.
 await db.itemReview.createMany({data: Array.from({length: 12}, (_, i) => ({itemType: 'game', itemId: base + i, userId: member.id, rating: (i % 5) + 1, body: i === 0 ? '' : `review text number ${i}`, status: i === 3 ? 'PENDING' : i === 4 ? 'REJECTED' : 'APPROVED', updatedAt: at(i + 1)}))})
 await db.itemReview.create({data: {itemType: 'game', itemId: base, userId: other.id, rating: 1, body: 'someone else wrote this', updatedAt: at(50)}})
 await db.productReview.createMany({data: [
  {productId: live.id, userId: member.id, rating: 5, title: 'Great', body: 'works well for me', status: 'APPROVED', updatedAt: at(20)},
  {productId: withdrawn.id, userId: member.id, rating: 2, title: 'Meh', body: 'not what I expected', status: 'PENDING', updatedAt: at(6)},
  {productId: live.id, userId: other.id, rating: 1, title: 'Other', body: 'someone else on the product', status: 'APPROVED', updatedAt: at(60)},
 ]})
 state.hidden.add(base + 7)
 let page = await account.memberReviewPage(member.id, 1)
 assert.equal(page.total, 14); assert.equal(page.pages, 2); assert.equal(page.page, 1); assert.equal(page.reviews.length, 10)
 // Both sources are merged by last change, newest first.
 assert.deepEqual(page.reviews.map(row => row.updatedAt.getUTCMinutes()), [20, 12, 11, 10, 9, 8, 7, 6, 6, 5])
 assert.deepEqual(page.reviews[0], {key: page.reviews[0].key, kind: 'product', label: 'محصول', rating: 5, title: 'Great', body: 'works well for me', status: 'APPROVED', updatedAt: at(20), target: {title: 'Live product', url: `/products/${seed}-live`, image: ''}})
 assert.ok(page.reviews.every(row => !row.body.includes('someone else')), 'nobody else\'s review is listed')
 const hiddenItem = page.reviews.find(row => row.kind === 'item' && row.updatedAt.getUTCMinutes() === 8)
 assert.equal(hiddenItem.target, null, 'an unpublished item is not named'); assert.equal(hiddenItem.label, 'بازی')
 const secret = page.reviews.find(row => row.kind === 'product' && row.status === 'PENDING')
 assert.equal(secret.target, null, 'a product that is not public is not named'); assert.equal(secret.body, 'not what I expected')
 assert.ok(!JSON.stringify(page).includes('Secret product'))
 page = await account.memberReviewPage(member.id, 2)
 assert.deepEqual(page.reviews.map(row => [row.updatedAt.getUTCMinutes(), row.status]), [[4, 'PENDING'], [3, 'APPROVED'], [2, 'APPROVED'], [1, 'APPROVED']])
 assert.equal(page.reviews.at(-1).body, '', 'a rating without text is listed too')
 assert.equal((await account.memberReviewPage(member.id, 1)).reviews.find(row => row.updatedAt.getUTCMinutes() === 5).status, 'REJECTED', 'the member sees a rejected review')
 // Out-of-range and malformed pages.
 for (const input of [0, -3, 'abc', undefined, 1.5]) assert.equal((await account.memberReviewPage(member.id, input)).page, 1)
 assert.deepEqual((await account.memberReviewPage(member.id, 9)).reviews, [])
 assert.equal((await account.memberReviewPage(member.id, 10_000)).page, 50)
 // A disabled module's reviews are left out, and kept.
 state.reviews = false
 page = await account.memberReviewPage(member.id, 1)
 assert.equal(page.total, 2); assert.deepEqual(page.reviews.map(row => row.kind), ['product', 'product'])
 state.reviews = true; state.store = false
 page = await account.memberReviewPage(member.id, 1)
 assert.equal(page.total, 12); assert.ok(page.reviews.every(row => row.kind === 'item'))
 state.store = true
 assert.equal(await db.itemReview.count({where: {userId: member.id}}), 12); assert.equal(await db.productReview.count({where: {userId: member.id}}), 2)
 // The other member sees only their own two.
 page = await account.memberReviewPage(other.id, 1)
 assert.deepEqual(page.reviews.map(row => [row.kind, row.body]), [['product', 'someone else on the product'], ['item', 'someone else wrote this']])
 assert.deepEqual(await account.memberReviewPage(999_999_999, 1), {total: 0, page: 1, pages: 0, reviews: []})
 console.log('PostgreSQL merged order across shared and product reviews, pagination, own rows only, unpublished targets unnamed, rejected and rating-only rows, disabled modules passed')
}
main().catch(error => {console.error(error); process.exitCode = 1}).finally(async () => {
 try {
  const ids = (await db.user.findMany({where: {email: {startsWith: seed}}, select: {id: true}})).map(user => user.id)
  await db.itemReview.deleteMany({where: {userId: {in: ids}}}); await db.productReview.deleteMany({where: {userId: {in: ids}}})
  await db.product.deleteMany({where: {slug: {startsWith: seed}}}); await db.user.deleteMany({where: {id: {in: ids}}})
 } finally {await db.$disconnect()}
})
