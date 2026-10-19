// Real PostgreSQL background queue; the handler module is a test double and the run only sees this script's jobs.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), {execFileSync} = require('node:child_process'), ts = require('typescript-api'), {PrismaClient} = require('@prisma/client')
const prisma = new PrismaClient(), seed = `queue-jobs-${Date.now()}`
const baseline = process.env.QUEUE_JOBS_BASELINE
const state = {fail: false, runs: 0}
const own = args => ({...args, where: {...args.where, dedupeKey: {startsWith: seed}}})
const jobs = new Proxy(prisma.backgroundJob, {get(target, key) {return ['findFirst', 'updateMany', 'deleteMany'].includes(key) ? args => target[key](own(args)) : typeof target[key] === 'function' ? target[key].bind(target) : target[key]}})
const db = new Proxy(prisma, {get(target, key) {return key === 'backgroundJob' ? jobs : typeof target[key] === 'function' ? target[key].bind(target) : target[key]}})
// QUEUE_JOBS_BASELINE=<git ref> runs the queue of that revision to reproduce the old behaviour.
const file = 'src/modules/operations/server/queue.ts'
const source = baseline ? execFileSync('git', ['show', `${baseline}:${file}`], {encoding: 'utf8'}) : fs.readFileSync(file, 'utf8')
const mocks = {
 '@/platform/database/prisma': {db},
 '@/platform/observability/logger': {logEvent: () => {}},
 '@/modules/site/server/images': {clearImageCache: async () => {state.runs++; if (state.fail) throw new Error('disk unavailable'); return {cleared: 3}}},
}
const modules = new Map()
function load(relative = file) {
 if (modules.has(relative)) return modules.get(relative).exports
 const mod = {exports: {}}
 modules.set(relative, mod)
 const code = relative === file ? source : fs.readFileSync(relative, 'utf8')
 new Function('require', 'module', 'exports', ts.transpileModule(code, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}}).outputText)(name => {
  if (Object.hasOwn(mocks, name)) return mocks[name]
  if (name.startsWith('@/')) return load('src/' + name.slice(2) + '.ts')
  if (name.startsWith('.')) return load(path.resolve(path.dirname(relative), name) + '.ts')
  return require(name)
 }, mod, mod.exports)
 return mod.exports
}
let count = 0
const job = data => prisma.backgroundJob.create({data: {kind: 'images.clear-cache', dedupeKey: `${seed}-${count++}`, ...data}})
const read = row => prisma.backgroundJob.findUniqueOrThrow({where: {id: row.id}})
const longAgo = () => new Date(Date.now() - 11 * 60_000)
async function main() {
 const queue = load()
 // A kind this version does not know must not be reported as done.
 const unknown = await job({kind: 'retired.kind'})
 // A job that was interrupted on each of its five attempts, and one interrupted once.
 const poison = await job({status: 'RUNNING', attempts: 5, lockedAt: longAgo()}), interrupted = await job({status: 'RUNNING', attempts: 1, lockedAt: longAgo()})
 let result = await queue.runQueue(20_000)
 if (baseline) {
  assert.equal((await read(unknown)).status, 'DONE')
  console.log(`Reproduced at ${baseline}: a job of an unknown kind was recorded as done although nothing ran`)
  const row = await read(poison)
  assert.equal(row.status, 'DONE'); assert.equal(row.attempts, 6); assert.equal(state.runs, 2)
  console.log(`Reproduced at ${baseline}: a job interrupted on all five attempts was started a sixth time`)
  return
 }
 let row = await read(unknown)
 assert.equal(row.status, 'FAILED'); assert.equal(row.lastError, 'unknown job kind: retired.kind'); assert.ok(row.finishedAt); assert.equal(row.lockedAt, null)
 row = await read(poison)
 assert.equal(row.status, 'FAILED'); assert.equal(row.attempts, 5); assert.equal(row.lastError, 'interrupted on every attempt'); assert.ok(row.finishedAt)
 row = await read(interrupted)
 assert.equal(row.status, 'DONE'); assert.equal(row.attempts, 2); assert.equal(row.result, '{"cleared":3}')
 assert.equal(state.runs, 1, 'only the retryable job ran'); assert.deepEqual(result, {ran: 2})
 // A failed job can be retried from Admin and then runs.
 assert.equal(await queue.retryJob(poison.id), true)
 await queue.runQueue(20_000)
 row = await read(poison)
 assert.equal(row.status, 'DONE'); assert.equal(row.attempts, 1)
 // A failing handler backs off, and stops after the fifth attempt.
 state.fail = true
 const failing = await job({}), last = await job({attempts: 4})
 await queue.runQueue(20_000)
 row = await read(failing)
 assert.equal(row.status, 'QUEUED'); assert.equal(row.attempts, 1); assert.equal(row.lastError, 'disk unavailable'); assert.ok(row.runAt.getTime() > Date.now() + 60_000)
 row = await read(last)
 assert.equal(row.status, 'FAILED'); assert.equal(row.attempts, 5); assert.ok(row.finishedAt)
 state.fail = false
 // A running job that is still within its lease is left alone.
 const busy = await job({status: 'RUNNING', attempts: 1, lockedAt: new Date()})
 assert.deepEqual(await queue.runQueue(20_000), {ran: 0}); assert.equal((await read(busy)).status, 'RUNNING')
 // The same key queued at once by several callers gives one job and no error.
 const key = `${seed}-same`
 const queued = await Promise.all(Array.from({length: 8}, () => queue.enqueue('images.clear-cache', {}, {dedupeKey: key})))
 assert.equal(new Set(queued.map(item => item.id)).size, 1); assert.equal(await prisma.backgroundJob.count({where: {dedupeKey: key}}), 1)
 const before = state.runs
 assert.deepEqual(await queue.runQueue(20_000), {ran: 1}); assert.equal(state.runs, before + 1)
 await assert.rejects(queue.enqueue('retired.kind'), /unknown job kind/)
 console.log('PostgreSQL unknown kind failed, five-times-interrupted job stopped, interrupted job retried, Admin retry, backoff and final failure, live lease kept, concurrent same-key enqueue passed')
}
main().catch(error => {console.error(error); process.exitCode = 1}).finally(async () => {
 try {await prisma.backgroundJob.deleteMany({where: {dedupeKey: {startsWith: seed}}})} finally {await prisma.$disconnect()}
})
