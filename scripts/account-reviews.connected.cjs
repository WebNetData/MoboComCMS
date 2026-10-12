// Real PostgreSQL "My reviews" account read; module switches and the public item registry are test doubles.
const assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript'), {PrismaClient} = require('@prisma/client')
const db = new PrismaClient(), seed = `account-reviews-${Date.now()}`, base = 800_000_000 + (Date.now() % 50_000_000)
const state = {reviews: true, store: true, journal: true, hidden: new Set()}
const mocks = {
 '@/platform/database/prisma': {db},
 '@/platform/http/rate-limit': {rateLimitHit: () => ({ok: true})},
 '@/platform/observability/logger': {logEvent: () => {}},
 '@/extensions/server/modules': {isModuleEnabled: async id => id === 'reviews' ? state.reviews : id === 'journal' ? state.journal : true, getModuleSettings: async () => ({})},
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
  if (name.startsWith('.')) {const dir = file.slice(0, file.lastIndexOf('/')), parts = []; for (const part of `${dir}/${name}`.split('/')) { if (part === '..') parts.pop(); else if (part !== '.') parts.push(part) } const path = parts.join('/'); return load(fs.existsSync(path + '.ts') ? path + '.ts' : path + '/index.ts', cache)}
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
 const scored = await db.itemReview.findFirstOrThrow({where: {userId: member.id, itemId: base + 11}})
 await db.itemReviewScore.createMany({data: [{reviewId: scored.id, key: 'gameplay', score: 5}, {reviewId: scored.id, key: 'story', score: 2}, {reviewId: scored.id, key: 'usability', score: 4}]})
 await db.itemReview.updateMany({where: {id: scored.id}, data: {verified: 'DOWNLOAD', updatedAt: scored.updatedAt}})
 let page = await account.memberReviewPage(member.id, 1)
 assert.equal(page.total, 14); assert.equal(page.pages, 2); assert.equal(page.page, 1); assert.equal(page.reviews.length, 10)
 // Both sources are merged by last change, newest first.
 assert.deepEqual(page.reviews.map(row => row.updatedAt.getUTCMinutes()), [20, 12, 11, 10, 9, 8, 7, 6, 6, 5])
 assert.deepEqual(page.reviews[0], {key: page.reviews[0].key, kind: 'product', label: 'محصول', rating: 5, title: 'Great', body: 'works well for me', status: 'APPROVED', updatedAt: at(20), target: {title: 'Live product', url: `/products/${seed}-live`, image: ''}, manage: null})
 assert.ok(page.reviews.every(row => !row.body.includes('someone else')), 'nobody else\'s review is listed')
 const hiddenItem = page.reviews.find(row => row.kind === 'item' && row.updatedAt.getUTCMinutes() === 8)
 assert.equal(hiddenItem.target, null, 'an unpublished item is not named'); assert.equal(hiddenItem.label, 'بازی')
 const secret = page.reviews.find(row => row.kind === 'product' && row.status === 'PENDING')
 assert.equal(secret.target, null, 'a product that is not public is not named'); assert.equal(secret.body, 'not what I expected')
 assert.ok(!JSON.stringify(page).includes('Secret product'))
 // What edit and delete need: shared reviews carry their address, badge and dimension scores; product reviews are written once.
 assert.ok(page.reviews.filter(row => row.kind === 'product').every(row => row.manage === null))
 assert.deepEqual(page.reviews.find(row => row.updatedAt.getUTCMinutes() === 12).manage, {item: `game:${base + 11}`, itemType: 'game', verified: 'DOWNLOAD', scores: {gameplay: 5, story: 2}}, 'unknown and other types\' keys are not shown')
 assert.deepEqual(hiddenItem.manage, {item: `game:${base + 7}`, itemType: 'game', verified: '', scores: {}}, 'a withdrawn item can still be deleted')
 // Edit and delete go through the reviews module's own write path and show up in the list.
 const reviews = load('src/modules/reviews/server/reviews.ts')
 const edited = await reviews.saveReview(member.id, {type: 'game', id: base + 2}, {rating: 1, body: 'edited from the account list', scores: {graphics: 4}})
 assert.equal(edited.status, 'PENDING', 'an edited text goes back to moderation')
 let first = (await account.memberReviewPage(member.id, 1)).reviews[0]
 assert.deepEqual([first.kind, first.rating, first.body, first.manage.scores], ['item', 1, 'edited from the account list', {graphics: 4}], 'an edited review moves to the top')
 await assert.rejects(reviews.saveReview(member.id, {type: 'game', id: base + 7}, {rating: 5}), error => error.status === 404, 'a withdrawn item cannot be edited')
 await reviews.deleteReview(member.id, {type: 'game', id: base + 7})
 await reviews.deleteReview(other.id, {type: 'game', id: base + 2})
 let after = await account.memberReviewPage(member.id, 1)
 assert.equal(after.total, 13); assert.ok(after.reviews.every(row => row.manage?.item !== `game:${base + 7}`)); assert.equal(await db.itemReview.count({where: {userId: member.id, itemId: base + 2}}), 1, 'deleting addresses only the member\'s own review')
 // Put the two back so the rest of the script reads the original set.
 await db.itemReview.deleteMany({where: {userId: member.id, itemId: base + 2}})
 await db.itemReview.createMany({data: [{itemType: 'game', itemId: base + 2, userId: member.id, rating: 3, body: 'review text number 2', status: 'APPROVED', updatedAt: at(3)}, {itemType: 'game', itemId: base + 7, userId: member.id, rating: 3, body: 'review text number 7', status: 'APPROVED', updatedAt: at(8)}]})
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
 // --- article comments join the list: every state, no rating, and no title for an article that is not live
 const livePost = await db.post.create({data: {slug: `${seed}-مقاله`, title: 'Live article', content: 'x', cover: '/cover.jpg', status: 'PUBLISHED', publishedAt: at(0)}})
 const laterPost = await db.post.create({data: {slug: `${seed}-later`, title: 'Secret article', content: 'x', status: 'PUBLISHED', publishedAt: new Date(Date.now() + 86_400_000)}})
 const top = await db.postComment.create({data: {postId: livePost.id, userId: other.id, body: 'a waiting comment', status: 'PENDING', updatedAt: at(70)}})
 await db.postComment.createMany({data: [
  {postId: livePost.id, userId: other.id, body: 'a rejected reply', status: 'REJECTED', parentId: top.id, updatedAt: at(65)},
  {postId: laterPost.id, userId: other.id, body: 'under an article that is not live', status: 'APPROVED', updatedAt: at(55)},
  {postId: livePost.id, userId: member.id, body: 'the first member commented too', status: 'APPROVED', updatedAt: at(80)},
 ]})
 page = await account.memberReviewPage(other.id, 1)
 assert.equal(page.total, 5)
 assert.deepEqual(page.reviews.map(row => [row.kind, row.label, row.status, row.body]), [
  ['comment', 'دیدگاه مقاله', 'PENDING', 'a waiting comment'],
  ['comment', 'پاسخ زیر مقاله', 'REJECTED', 'a rejected reply'],
  ['product', 'محصول', 'APPROVED', 'someone else on the product'],
  ['comment', 'دیدگاه مقاله', 'APPROVED', 'under an article that is not live'],
  ['item', 'بازی', 'APPROVED', 'someone else wrote this'],
 ], 'comments are merged by last change with the reviews')
 assert.deepEqual(page.reviews[0], {key: `comment:${top.id}`, kind: 'comment', label: 'دیدگاه مقاله', rating: 0, title: '', body: 'a waiting comment', status: 'PENDING', updatedAt: at(70), target: {title: 'Live article', url: `/blog/${encodeURIComponent(livePost.slug)}`, image: '/cover.jpg'}, manage: null, commentId: top.id})
 assert.equal(page.reviews[3].target, null); assert.ok(!JSON.stringify(page).includes('Secret article'), 'an article that is not live is not named')
 assert.ok(!JSON.stringify(page).includes('the first member commented too'), 'nobody else\'s comment is listed')
 // The journal module off: comments are left out, and kept.
 state.journal = false
 page = await account.memberReviewPage(other.id, 1)
 assert.equal(page.total, 2); assert.ok(page.reviews.every(row => row.kind !== 'comment'))
 state.journal = true
 assert.equal(await db.postComment.count({where: {userId: other.id}}), 3)
 // --- deleting an own comment: gone when nobody answered, an empty placeholder when someone did; never someone else's
 const {deleteOwnPostComment} = load('src/modules/journal/server/comment-delete.ts')
 const mine = await db.postComment.findFirstOrThrow({where: {userId: member.id, postId: livePost.id}})
 assert.deepEqual(await deleteOwnPostComment(other.id, mine.id), {deleted: false, placeholder: false}, 'not the member\'s comment')
 assert.equal((await db.postComment.findUniqueOrThrow({where: {id: mine.id}})).body, 'the first member commented too')
 assert.deepEqual(await deleteOwnPostComment(other.id, top.id), {deleted: true, placeholder: true}, 'it has a reply, so a placeholder stays')
 const placeholder = await db.postComment.findUniqueOrThrow({where: {id: top.id}})
 assert.deepEqual([placeholder.status, placeholder.body], ['DELETED', ''], 'the text is erased')
 assert.equal(await db.postComment.count({where: {parentId: top.id}}), 1, 'the answer keeps its place')
 assert.deepEqual(await deleteOwnPostComment(other.id, top.id), {deleted: false, placeholder: false}, 'deleting twice changes nothing')
 page = await account.memberReviewPage(other.id, 1)
 assert.equal(page.total, 4); assert.ok(page.reviews.every(row => row.commentId !== top.id), 'the placeholder leaves the member\'s list')
 const reply = await db.postComment.findFirstOrThrow({where: {parentId: top.id}})
 assert.deepEqual(await deleteOwnPostComment(other.id, reply.id), {deleted: true, placeholder: false}, 'nobody answered a reply: it is removed')
 assert.equal(await db.postComment.count({where: {id: reply.id}}), 0)
 for (const bad of [0, -1, 1.5, NaN]) assert.deepEqual(await deleteOwnPostComment(other.id, bad), {deleted: false, placeholder: false})
 console.log('PostgreSQL merged order across shared reviews, product reviews and article comments, pagination, own rows only, unpublished targets unnamed, rejected and rating-only rows, disabled modules passed')
}
main().catch(error => {console.error(error); process.exitCode = 1}).finally(async () => {
 try {
  const ids = (await db.user.findMany({where: {email: {startsWith: seed}}, select: {id: true}})).map(user => user.id)
  await db.itemReview.deleteMany({where: {userId: {in: ids}}}); await db.itemStat.deleteMany({where: {itemType: 'game', itemId: {gte: base, lt: base + 12}}}); await db.productReview.deleteMany({where: {userId: {in: ids}}})
  await db.post.deleteMany({where: {slug: {startsWith: seed}}}); await db.product.deleteMany({where: {slug: {startsWith: seed}}}); await db.user.deleteMany({where: {id: {in: ids}}})
 } finally {await db.$disconnect()}
})
