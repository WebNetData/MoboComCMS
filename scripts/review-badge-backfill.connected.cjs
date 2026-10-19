// Real PostgreSQL badge backfill for reviews nobody reopened. The run only sees this script's reviews and keeps its cursor
// in memory, so the site's own cursor and other members' reviews are untouched; the item registry and module switch are test doubles.
const assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript-api'), {PrismaClient} = require('@prisma/client')
const prisma = new PrismaClient(), seed = `badge-backfill-${Date.now()}`, base = 500_000_000 + (Date.now() % 50_000_000)
const state = {reviews: true, ids: [], cursor: null, breakFor: 0}
const itemReview = new Proxy(prisma.itemReview, {get: (target, key) => key === 'findMany' ? args => target.findMany({...args, where: {...args.where, userId: {in: state.ids}}}) : typeof target[key] === 'function' ? target[key].bind(target) : target[key]})
const setting = {findUnique: async () => state.cursor === null ? null : {key: 'x', value: state.cursor}, upsert: async ({update}) => { state.cursor = update.value; return {} }}
// One member's download log read fails, to show the others are still handled.
const downloadLog = new Proxy(prisma.downloadLog, {get: (target, key) => key === 'findFirst' ? args => { if (args.where.userId === state.breakFor) throw new Error('log unavailable'); return target.findFirst(args) } : typeof target[key] === 'function' ? target[key].bind(target) : target[key]})
const db = new Proxy(prisma, {get: (target, key) => key === 'itemReview' ? itemReview : key === 'setting' ? setting : key === 'downloadLog' ? downloadLog : typeof target[key] === 'function' ? target[key].bind(target) : target[key]})
const mocks = {
 '@/platform/database/prisma': {db},
 '@/platform/http/rate-limit': {rateLimitHit: () => ({ok: true})},
 '@/platform/observability/logger': {logEvent: () => {}},
 '@/extensions/server/modules': {isModuleEnabled: async () => state.reviews, getModuleSettings: async () => ({})},
 '@/modules/notifications/server/inbox': {createInboxEvent: async () => ({})},
 '@/modules/content/server/registry': {itemCard: async () => null, itemCards: async () => new Map()},
}
const cache = new Map()
function load(file) {
 if (cache.has(file)) return cache.get(file).exports
 const mod = {exports: {}}; cache.set(file, mod)
 new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}}).outputText)(name => {
  if (Object.hasOwn(mocks, name)) return mocks[name]
  if (name.startsWith('@/')) {const path = `src/${name.slice(2)}`; return load(fs.existsSync(path + '.ts') ? path + '.ts' : path + '/index.ts')}
  if (name.startsWith('.')) {const dir = file.slice(0, file.lastIndexOf('/')), parts = []; for (const part of `${dir}/${name}`.split('/')) { if (part === '..') parts.pop(); else if (part !== '.') parts.push(part) } const path = parts.join('/'); return load(fs.existsSync(path + '.ts') ? path + '.ts' : path + '/index.ts')}
  return require(name)
 }, mod, mod.exports)
 return mod.exports
}
async function main() {
 const {backfillVerifiedBadges} = load('src/modules/reviews/server/reviews.ts')
 const users = await Promise.all(Array.from({length: 6}, (_, i) => prisma.user.create({data: {email: `${seed}-${i}@example.invalid`, passwordHash: 'test-only'}})))
 state.ids = users.map(user => user.id)
 const old = new Date(Date.UTC(2025, 0, 1))
 // Six reviews of one game, in id order: downloaded, nothing, purchased, already badged, downloaded, nothing.
 const reviews = []
 for (const [i, user] of users.entries()) reviews.push(await prisma.itemReview.create({data: {itemType: 'game', itemId: base, userId: user.id, rating: 4, verified: i === 3 ? 'WATCH' : '', updatedAt: old}}))
 await prisma.downloadLog.createMany({data: [0, 4].map(i => ({ownerType: 'game', ownerId: base, userId: users[i].id}))})
 await prisma.contentPurchase.create({data: {userId: users[2].id, ownerType: 'game', ownerId: base}})
 const badges = async () => (await prisma.itemReview.findMany({where: {id: {in: reviews.map(row => row.id)}}, orderBy: {id: 'asc'}})).map(row => row.verified)

 // The reviews module off: nothing is read or written.
 state.reviews = false
 assert.deepEqual(await backfillVerifiedBadges(2), {checked: 0, badged: 0, failed: 0}); assert.equal(state.cursor, null)
 state.reviews = true
 // Bounded runs walk the unbadged reviews in id order and remember where they stopped.
 assert.deepEqual(await backfillVerifiedBadges(2), {checked: 2, badged: 1, failed: 0})
 assert.deepEqual(await badges(), ['DOWNLOAD', '', '', 'WATCH', '', '']); assert.equal(state.cursor, String(reviews[1].id))
 assert.deepEqual(await backfillVerifiedBadges(2), {checked: 2, badged: 2, failed: 0}, 'the already badged review is not looked at')
 assert.deepEqual(await badges(), ['DOWNLOAD', '', 'PURCHASE', 'WATCH', 'DOWNLOAD', '']); assert.equal(state.cursor, String(reviews[4].id))
 // The last, short page ends the pass and the next run starts over.
 assert.deepEqual(await backfillVerifiedBadges(2), {checked: 1, badged: 0, failed: 0}); assert.equal(state.cursor, '0')
 // A badge is not an edit: the review keeps its date.
 assert.ok((await prisma.itemReview.findMany({where: {id: {in: reviews.map(row => row.id)}}})).every(row => row.updatedAt.getTime() === old.getTime()))
 // A member who uses the item after reviewing it gets the badge on a later pass.
 await prisma.downloadLog.create({data: {ownerType: 'game', ownerId: base, userId: users[5].id}})
 // One review that cannot be checked is counted and does not stop the next one.
 state.breakFor = users[1].id
 assert.deepEqual(await backfillVerifiedBadges(50), {checked: 2, badged: 1, failed: 1})
 assert.deepEqual(await badges(), ['DOWNLOAD', '', 'PURCHASE', 'WATCH', 'DOWNLOAD', 'DOWNLOAD'])
 // A badge is never taken back when the record behind it is gone.
 state.breakFor = 0
 await prisma.downloadLog.deleteMany({where: {userId: {in: state.ids}}})
 assert.deepEqual(await backfillVerifiedBadges(50), {checked: 1, badged: 0, failed: 0})
 assert.deepEqual(await badges(), ['DOWNLOAD', '', 'PURCHASE', 'WATCH', 'DOWNLOAD', 'DOWNLOAD'])
 console.log('PostgreSQL badge backfill: bounded id-ordered passes with a cursor, badged and unbadged reviews, later use, edit date kept, one failing review isolated, no badge taken back, module off passed')
}
main().catch(error => {console.error(error); process.exitCode = 1}).finally(async () => {
 try {
  await prisma.itemReview.deleteMany({where: {userId: {in: state.ids}}}); await prisma.downloadLog.deleteMany({where: {userId: {in: state.ids}}}); await prisma.contentPurchase.deleteMany({where: {userId: {in: state.ids}}})
  await prisma.user.deleteMany({where: {email: {startsWith: seed}}})
 } finally {await prisma.$disconnect()}
})
