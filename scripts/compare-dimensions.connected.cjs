// Real PostgreSQL comparison rows for members' dimension scores; the public item registry and module switch are test doubles.
const assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript-api'), {PrismaClient} = require('@prisma/client')
const db = new PrismaClient(), seed = `compare-dimensions-${Date.now()}`, base = 600_000_000 + (Date.now() % 50_000_000)
const state = {reviews: true}
const card = ref => ({type: ref.type, id: ref.id, title: `${ref.type} ${ref.id}`, subtitle: '', url: `/x/${ref.id}`, image: '', access: 'PUBLIC'})
const mocks = {
 '@/platform/database/prisma': {db},
 '@/platform/http/rate-limit': {rateLimitHit: () => ({ok: true})},
 '@/platform/observability/logger': {logEvent: () => {}},
 '@/extensions/server/modules': {isModuleEnabled: async id => id === 'reviews' ? state.reviews : true, getModuleSettings: async () => ({})},
 '@/modules/notifications/server/inbox': {createInboxEvent: async () => ({})},
 '@/modules/content/server/registry': {itemCard: async ref => card(ref), itemCards: async refs => new Map(refs.map(ref => [`${ref.type}:${ref.id}`, card(ref)]))},
 '@/modules/catalog/server/product-config': {attributeFieldsForCategory: async () => [], parseJson: (value, fallback) => fallback},
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
const GROUP = 'امتیاز تخصصی کاربران (از ۵)'
async function main() {
 const {compareItems, parseCompareRefs, bestIndex} = load('src/modules/compare/server/compare.ts')
 const users = await Promise.all(['a', 'b', 'c'].map(name => db.user.create({data: {email: `${seed}-${name}@example.invalid`, passwordHash: 'test-only'}})))
 const [one, two, three] = [base, base + 1, base + 2]
 const add = async (user, itemId, scores, extra = {}) => {
  const review = await db.itemReview.create({data: {itemType: 'game', itemId, userId: user.id, rating: 4, ...extra}})
  await db.itemReviewScore.createMany({data: Object.entries(scores).map(([key, score]) => ({reviewId: review.id, key, score}))})
 }
 await add(users[0], one, {gameplay: 5, graphics: 3}, {verified: 'DOWNLOAD'})
 await add(users[1], one, {gameplay: 4, usability: 5})
 await add(users[2], one, {gameplay: 1, story: 1}, {status: 'REJECTED', verified: 'PURCHASE', body: 'a rejected review text'})
 await add(users[0], two, {gameplay: 3, graphics: 5, replay: 2})
 const refs = parseCompareRefs(`game:${one},game:${two},game:${three}`)
 let data = await compareItems(refs)
 const rows = data.rows.filter(row => row.group === GROUP)
 assert.deepEqual(rows.map(row => [row.label, row.numbers || row.values]), [
  ['گیم‌پلی', [4.5, 3, null]],
  ['گرافیک و طراحی هنری', [3, 5, null]],
  ['ارزش تکرار', [null, 2, null]],
  ['امتیازدهندگان با تجربهٔ تأییدشده', ['۱', '۰', '۰']],
 ], 'the type\'s order; rejected reviews, other types\' keys and unscored dimensions left out')
 assert.deepEqual(rows[0].values, ['۴٫۵', '۳٫۰', '—'])
 assert.deepEqual(rows.slice(0, 3).map(bestIndex), [0, 1, -1], 'the higher average is marked; a single value is not a winner')
 assert.equal(bestIndex(rows[3]), -1, 'a head count is not a contest')
 // Nobody verified: no such row. Nothing scored: no group at all.
 await db.itemReview.updateMany({where: {itemId: one, verified: 'DOWNLOAD'}, data: {verified: ''}})
 assert.deepEqual((await compareItems(refs)).rows.filter(row => row.group === GROUP).map(row => row.label), ['گیم‌پلی', 'گرافیک و طراحی هنری', 'ارزش تکرار'])
 assert.equal((await compareItems(parseCompareRefs(`game:${three}`)))?.rows.some(row => row.group === GROUP) ?? false, false)
 // Reviews module off: the rows are left out and the scores are kept.
 state.reviews = false
 assert.equal((await compareItems(refs)).rows.some(row => row.group === GROUP), false)
 state.reviews = true
 assert.equal(await db.itemReviewScore.count({where: {review: {itemId: {in: [one, two]}, itemType: 'game'}}}), 9)
 console.log('PostgreSQL comparison rows for dimension averages, best cell, verified count, empty and module-off cases passed')
}
main().catch(error => {console.error(error); process.exitCode = 1}).finally(async () => {
 try {
  const ids = (await db.user.findMany({where: {email: {startsWith: seed}}, select: {id: true}})).map(user => user.id)
  await db.itemReview.deleteMany({where: {userId: {in: ids}}}); await db.user.deleteMany({where: {id: {in: ids}}})
 } finally {await db.$disconnect()}
})
