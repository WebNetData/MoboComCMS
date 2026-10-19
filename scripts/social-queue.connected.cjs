// Real PostgreSQL announcement queue; item lookup and the push channel are test doubles and the run only sees this script's rows.
const assert = require('node:assert/strict'), fs = require('node:fs'), {execFileSync} = require('node:child_process'), ts = require('typescript-api'), {PrismaClient} = require('@prisma/client')
const prisma = new PrismaClient(), base = 900_000_000 + (Date.now() % 50_000_000)
const baseline = process.env.SOCIAL_QUEUE_BASELINE
const state = {throwFor: new Set(), missing: new Set()}, pushed = []
const own = args => ({...args, where: {...args.where, itemType: 'post', itemId: {gte: base, lt: base + 100}}})
const posts = new Proxy(prisma.socialPost, {get(target, key) {return ['findMany', 'updateMany'].includes(key) ? args => target[key](own(args)) : typeof target[key] === 'function' ? target[key].bind(target) : target[key]}})
const db = new Proxy(prisma, {get(target, key) {return key === 'socialPost' ? posts : typeof target[key] === 'function' ? target[key].bind(target) : target[key]}})
// SOCIAL_QUEUE_BASELINE=<git ref> runs the service of that revision to reproduce the old behaviour.
const source = file => baseline && file === 'src/modules/social/server/social.ts' ? execFileSync('git', ['show', `${baseline}:${file}`], {encoding: 'utf8'}) : fs.readFileSync(file, 'utf8')
const mocks = {
 '@/platform/database/prisma': {db},
 '@/platform/observability/logger': {logEvent: () => {}},
 '@/extensions/server/modules': {isModuleEnabled: async () => true},
 '@/modules/settings/server': {readJsonSetting: async () => null, writeJsonSetting: async () => {}},
 '@/modules/providers/server/panel-credentials': {decryptPanelCredential: value => value, encryptPanelCredential: value => value},
 '@/modules/notifications/server/telegram': {bot: async () => ({ok: false}), telegramConfig: async () => ({})},
 '@/modules/site/server/seo': {siteBase: async () => 'http://localhost'},
 '@/modules/content/server/registry': {itemCard: async ref => {
  if (state.throwFor.has(ref.id)) throw new Error('item cannot be read')
  if (state.missing.has(ref.id)) return null
  return {type: 'post', id: ref.id, title: `post ${ref.id}`, subtitle: '', summary: '', url: `/blog/${ref.id}`, image: ''}
 }},
 '@/modules/push/server/push': {broadcast: async message => {pushed.push(message.url); return {sent: 1, failed: 0}}},
}
function load(file, cache = new Map()) {
 if (cache.has(file)) return cache.get(file).exports
 const mod = {exports: {}}; cache.set(file, mod)
 new Function('require', 'module', 'exports', ts.transpileModule(source(file), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}}).outputText)(name => {
  if (Object.hasOwn(mocks, name)) return mocks[name]
  if (name.startsWith('@/')) {const path = `src/${name.slice(2)}`; return load(fs.existsSync(path + '.ts') ? path + '.ts' : path + '/index.ts', cache)}
  return require(name)
 }, mod, mod.exports)
 return mod.exports
}
let count = 0
const post = (data = {}) => prisma.socialPost.create({data: {channel: 'PUSH', itemType: 'post', itemId: base + count, nextAttemptAt: new Date(Date.now() - 60_000 + count++ * 1000), ...data}})
const read = row => prisma.socialPost.findUniqueOrThrow({where: {id: row.id}})
const longAgo = () => new Date(Date.now() - 16 * 60_000)
async function main() {
 const service = load('src/modules/social/server/social.ts'), {MAX_ATTEMPTS} = load('src/modules/social/domain/social.ts')
 // The first announcement's item cannot be read; the one behind it is fine.
 const broken = await post(), behind = await post()
 state.throwFor.add(broken.itemId)
 const run = await service.processSocialQueue(50).catch(error => error)
 // A row interrupted on its last attempt, and one interrupted earlier.
 const exhausted = await post({status: 'SENDING', attempts: MAX_ATTEMPTS, updatedAt: longAgo()}), interrupted = await post({status: 'SENDING', attempts: 2, updatedAt: longAgo()})
 const released = await service.releaseStuckSocialPosts()
 if (baseline) {
  assert.ok(run instanceof Error); assert.equal((await read(broken)).status, 'SENDING'); assert.equal((await read(behind)).status, 'PENDING'); assert.deepEqual(pushed, [])
  console.log(`Reproduced at ${baseline}: an announcement whose item could not be read aborted the run, stayed claimed, and the announcement behind it was not sent`)
  assert.equal(released, 2); assert.equal((await read(exhausted)).status, 'PENDING')
  console.log(`Reproduced at ${baseline}: an announcement interrupted on all ${MAX_ATTEMPTS} attempts was queued again`)
  return
 }
 assert.equal(run, 2)
 let row = await read(broken)
 assert.equal(row.status, 'PENDING'); assert.equal(row.attempts, 1); assert.equal(row.error, 'item cannot be read'); assert.ok(row.nextAttemptAt.getTime() > Date.now() + 60_000, 'the failed read backs off')
 row = await read(behind)
 assert.equal(row.status, 'SENT'); assert.ok(row.sentAt)
 assert.equal(pushed.length, 1); assert.ok(pushed[0].startsWith(`/blog/${behind.itemId}`))
 assert.equal(released, 1)
 row = await read(exhausted)
 assert.equal(row.status, 'FAILED'); assert.equal(row.attempts, MAX_ATTEMPTS); assert.ok(row.error)
 assert.equal((await read(interrupted)).status, 'PENDING')
 // The interrupted announcement is sent on the next run; the broken one waits for its backoff.
 assert.equal(await service.processSocialQueue(50), 1)
 assert.equal((await read(interrupted)).status, 'SENT'); assert.equal((await read(interrupted)).attempts, 3); assert.equal(pushed.length, 2)
 // The last attempt of an unreadable item fails it for good; an unpublished item is skipped.
 const last = await post({attempts: MAX_ATTEMPTS - 1}), gone = await post()
 state.throwFor.add(last.itemId); state.missing.add(gone.itemId)
 assert.equal(await service.processSocialQueue(50), 2)
 row = await read(last)
 assert.equal(row.status, 'FAILED'); assert.equal(row.attempts, MAX_ATTEMPTS); assert.equal(row.error, 'item cannot be read')
 assert.equal((await read(gone)).status, 'SKIPPED'); assert.equal(pushed.length, 2)
 // A row still inside its 15 minutes is left alone.
 const busy = await post({status: 'SENDING', attempts: 1})
 assert.equal(await service.releaseStuckSocialPosts(), 0); assert.equal((await read(busy)).status, 'SENDING')
 console.log('PostgreSQL unreadable item retried with backoff, next announcement sent, exhausted interrupted row failed, interrupted row resent, final failure, skipped item, live claim kept passed')
}
main().catch(error => {console.error(error); process.exitCode = 1}).finally(async () => {
 try {await prisma.socialPost.deleteMany({where: {itemType: 'post', itemId: {gte: base, lt: base + 100}}})} finally {await prisma.$disconnect()}
})
