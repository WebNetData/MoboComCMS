// Local PostgreSQL check: node --env-file=.env scripts/notification-delivery.connected.cjs
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const { PrismaClient } = require('@prisma/client')

process.env.DATABASE_URL = 'postgresql://mobocom:mobocom-local@127.0.0.1:5435/mobocom?schema=public'
const db = new PrismaClient()
const seed = `codex-delivery-${Date.now()}`
let userId = 0, notificationId = 0

async function main() {
  const user = await db.user.create({ data: { email: `${seed}@example.invalid`, passwordHash: 'test-only' } })
  userId = user.id
  const source = fs.readFileSync(path.join(__dirname, '../src/modules/notifications/server/inbox.ts'), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const loaded = { exports: {} }
  new Function('require', 'module', 'exports', compiled)((name) => name === '@/platform/database/prisma' ? { db } : require(name), loaded, loaded.exports)
  const event = { userId, kind: 'STOCK_BACK', dedupeKey: seed, titleEn: 'Stock back', titleFa: 'موجود شد', href: '/products/test' }
  const results = await Promise.all(Array.from({ length: 20 }, () => loaded.exports.createInboxEvent(event)))
  notificationId = results[0].id
  assert.ok(results.every((row) => row.id === notificationId))
  assert.equal(await db.userNotification.count({ where: { dedupeKey: seed } }), 1)
  const jobs = await db.backgroundJob.findMany({ where: { dedupeKey: { startsWith: `notification:${notificationId}:` } }, orderBy: { dedupeKey: 'asc' } })
  assert.deepEqual(jobs.map((job) => job.kind), ['notification.deliver', 'notification.deliver', 'notification.deliver'])
  assert.deepEqual(jobs.map((job) => JSON.parse(job.payload).channel).sort(), ['email', 'push', 'sms'])
  assert.ok(jobs.every((job) => job.status === 'QUEUED'))
  const prefix = `notification:${notificationId}:`
  const jobDb = { backgroundJob: {
    findFirst: ({ where, ...rest }) => db.backgroundJob.findFirst({ where: { ...where, dedupeKey: { startsWith: prefix } }, ...rest }),
    updateMany: ({ where, ...rest }) => db.backgroundJob.updateMany({ where: { ...where, dedupeKey: { startsWith: prefix } }, ...rest }),
    update: (args) => db.backgroundJob.update(args),
    deleteMany: ({ where }) => db.backgroundJob.deleteMany({ where: { ...where, dedupeKey: { startsWith: prefix } } }),
  } }
  let failEmail = true
  const queueSource = fs.readFileSync(path.join(__dirname, '../src/modules/operations/server/queue.ts'), 'utf8')
  const queueCompiled = ts.transpileModule(queueSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const queue = { exports: {} }
  new Function('require', 'module', 'exports', queueCompiled)((name) => {
    if (name === '@/platform/database/prisma') return { db: jobDb }
    if (name === '@/platform/observability/logger') return { logEvent: () => undefined }
    if (name === '@/modules/notifications/server/inbox') return { deliverInboxCopy: async (_id, channel) => {
      if (channel === 'email' && failEmail) { failEmail = false; throw new Error('temporary mail provider failure') }
      return { sent: true }
    } }
    return require(name)
  }, queue, queue.exports)
  assert.equal((await queue.exports.runQueue(1000)).ran, 3)
  const delayed = await db.backgroundJob.findUnique({ where: { dedupeKey: `${prefix}email` } })
  assert.equal(delayed.status, 'QUEUED')
  assert.equal(delayed.attempts, 1)
  await db.backgroundJob.update({ where: { id: delayed.id }, data: { runAt: new Date(0) } })
  assert.equal((await queue.exports.runQueue(1000)).ran, 1)
  const finished = await db.backgroundJob.findMany({ where: { dedupeKey: { startsWith: prefix } } })
  assert.ok(finished.every((job) => job.status === 'DONE'))
  console.log('Notification delivery PostgreSQL: concurrent dedupe, durable channel jobs and independent retry state OK')
}

main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(async () => {
  if (notificationId) await db.backgroundJob.deleteMany({ where: { dedupeKey: { startsWith: `notification:${notificationId}:` } } })
  if (userId) await db.user.delete({ where: { id: userId } })
  await db.$disconnect()
})
