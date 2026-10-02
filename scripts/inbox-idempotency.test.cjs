const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const { Prisma } = require('@prisma/client')

test('concurrent duplicate inbox events atomically queue one job per external channel', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/modules/notifications/server/inbox.ts'), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const rows = new Map()
  const jobs = new Map()
  const deliveries = { sms: 0, mail: 0, push: 0 }
  let failQueueWrite = false, failMail = true, pushFailure = 'none'
  const db = {
    async $transaction(fn) {
      let inserted = null
      try {
        return await fn({
          userNotification: { async create({ data }) {
            if (rows.has(data.dedupeKey)) throw new Prisma.PrismaClientKnownRequestError('Duplicate', { code: 'P2002', clientVersion: '5.22.0' })
            inserted = { ...data, id: rows.size + 1 }
            rows.set(data.dedupeKey, inserted)
            return inserted
          } },
          backgroundJob: { async createMany({ data }) {
            if (failQueueWrite) throw new Error('queue unavailable')
            for (const job of data) jobs.set(job.dedupeKey, job)
          } },
        })
      } catch (error) {
        if (inserted) {
          rows.delete(inserted.dedupeKey)
          for (const channel of ['sms', 'email', 'push']) jobs.delete(`notification:${inserted.id}:${channel}`)
        }
        throw error
      }
    },
    userNotification: { async findUnique({ where }) { return where.id ? [...rows.values()].find((row) => row.id === where.id) || null : rows.get(where.dedupeKey) || null } },
  }
  const mocks = {
    '@/platform/database/prisma': { db },
    '@/platform/observability/logger': { logEvent: () => undefined },
    '@/modules/sms/server/sms': { notifyUserEvent: async () => { deliveries.sms++; return true } },
    '@/modules/mail/server/mailer': { notifyUserEmail: async () => { deliveries.mail++; return failMail ? false : true } },
    '@/modules/push/server/push': { pushToUser: async () => { deliveries.push++; return { sent: pushFailure === 'none' ? 1 : 0, failed: pushFailure === 'none' ? 0 : 1, retryable: pushFailure === 'transient' ? 1 : 0 } } },
  }
  const module = { exports: {} }
  new Function('require', 'module', 'exports', compiled)((name) => mocks[name] || require(name), module, module.exports)
  const createInboxEvent = module.exports.createInboxEvent
  const event = { userId: 1, kind: 'TEST', dedupeKey: 'one', titleEn: 'One', titleFa: 'یک', href: '/dashboard/notifications' }
  const created = await Promise.all(Array.from({ length: 20 }, () => createInboxEvent(event)))
  assert.equal(rows.size, 1)
  assert.ok(created.every((row) => row.id === created[0].id))
  assert.equal(jobs.size, 3)
  assert.deepEqual(deliveries, { sms: 0, mail: 0, push: 0 }, 'providers are not called in the event transaction')
  await module.exports.deliverInboxCopy(created[0].id, 'sms')
  await assert.rejects(module.exports.deliverInboxCopy(created[0].id, 'email'), /Email provider/)
  failMail = false
  await module.exports.deliverInboxCopy(created[0].id, 'email')
  await module.exports.deliverInboxCopy(created[0].id, 'push')
  pushFailure = 'permanent'
  await module.exports.deliverInboxCopy(created[0].id, 'push')
  pushFailure = 'transient'
  await assert.rejects(module.exports.deliverInboxCopy(created[0].id, 'push'), /Push provider/)
  pushFailure = 'none'
  await module.exports.deliverInboxCopy(created[0].id, 'push')
  assert.deepEqual(deliveries, { sms: 1, mail: 2, push: 4 })
  await assert.rejects(createInboxEvent({ ...event, userId: 2 }), /dedupe key collision/)
  assert.equal(jobs.size, 3)
  failQueueWrite = true
  await assert.rejects(createInboxEvent({ ...event, dedupeKey: 'two' }), /queue unavailable/)
  assert.equal(rows.size, 1, 'a failed queue insert rolls back the inbox event')
  failQueueWrite = false
  await createInboxEvent({ ...event, dedupeKey: 'two' })
  assert.equal(rows.size, 2)
  assert.equal(jobs.size, 6)
})
