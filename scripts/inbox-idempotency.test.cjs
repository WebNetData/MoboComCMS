const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const { Prisma } = require('@prisma/client')

test('concurrent duplicate inbox events dispatch external copies only once', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/modules/notifications/server/inbox.ts'), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const rows = new Map()
  const deliveries = { sms: 0, mail: 0, push: 0 }
  const db = { userNotification: {
    async create({ data }) {
      if (rows.has(data.dedupeKey)) throw new Prisma.PrismaClientKnownRequestError('Duplicate', { code: 'P2002', clientVersion: '5.22.0' })
      const row = { ...data, id: rows.size + 1 }
      rows.set(data.dedupeKey, row)
      return row
    },
    async findUnique({ where }) { return rows.get(where.dedupeKey) || null },
  } }
  const mocks = {
    '@/platform/database/prisma': { db },
    '@/platform/observability/logger': { logEvent: () => undefined },
    '@/modules/sms/server/sms': { notifyUserEvent: async () => { deliveries.sms++ } },
    '@/modules/mail/server/mailer': { notifyUserEmail: async () => { deliveries.mail++ } },
    '@/modules/push/server/push': { pushToUser: async () => { deliveries.push++ } },
  }
  const module = { exports: {} }
  new Function('require', 'module', 'exports', compiled)((name) => mocks[name] || require(name), module, module.exports)
  const createInboxEvent = module.exports.createInboxEvent
  const event = { userId: 1, kind: 'TEST', dedupeKey: 'one', titleEn: 'One', titleFa: 'یک', href: '/dashboard/notifications' }
  const created = await Promise.all(Array.from({ length: 20 }, () => createInboxEvent(event)))
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(rows.size, 1)
  assert.ok(created.every((row) => row.id === created[0].id))
  assert.deepEqual(deliveries, { sms: 1, mail: 1, push: 1 })
  await assert.rejects(createInboxEvent({ ...event, userId: 2 }), /dedupe key collision/)
  assert.deepEqual(deliveries, { sms: 1, mail: 1, push: 1 })
})
