const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript-api')

function load(relative, mocks = {}) {
  const source = fs.readFileSync(path.join(__dirname, '..', relative), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText
  const loaded = { exports: {} }
  new Function('require', 'module', 'exports', compiled)((name) => Object.hasOwn(mocks, name) ? mocks[name] : name.startsWith('@/modules/store/server/marketing/') ? load('src/' + name.slice(2) + '.ts', mocks) : require(name), loaded, loaded.exports)
  return loaded.exports
}

test('stock alert retries until the deduplicated inbox event and alert marker persist', async () => {
  const alert = { id: 11, userId: 7, productId: 3, variantId: 2, createdAt: new Date('2026-09-01'), notifiedAt: null }
  const product = { id: 3, slug: 'retry-product', name: 'Retry product', active: true, approval: 'PENDING', stock: 5, variants: [{ id: 2, name: 'Red', stock: 2 }], _count: { variants: 1 } }
  let inboxFailures = 1, markerFailures = 1, inboxCalls = 0
  const inboxKeys = new Set()
  const db = {
    product: { findUnique: async () => product },
    stockAlert: {
      findMany: async () => alert.notifiedAt ? [] : [alert],
      count: async () => 0,
      updateMany: async () => {
        if (markerFailures > 0) { markerFailures--; throw new Error('marker storage unavailable') }
        if (alert.notifiedAt) return { count: 0 }
        alert.notifiedAt = new Date()
        return { count: 1 }
      },
    },
  }
  const domain = load('src/modules/store/domain/marketing.ts')
  const service = load('src/modules/store/server/marketing.ts', {
    '@/platform/database/prisma': { db },
    '@/platform/config/env': {},
    '@/platform/observability/logger': { logEvent: () => undefined },
    '@/modules/settings/server': {},
    '@/modules/notifications/server/inbox': { createInboxEvent: async (event) => {
      inboxCalls++
      if (inboxFailures > 0) { inboxFailures--; throw new Error('inbox storage unavailable') }
      inboxKeys.add(event.dedupeKey)
      return event
    } },
    '@/modules/wallet/server/wallet': {},
    '@/modules/providers/server/panel-credentials': {},
    '@/modules/store/server/cart': {},
    '@/shared/money': {},
    '@/modules/store/domain/marketing': domain,
  })

  await assert.rejects(service.subscribeStockAlert(7, 3, 2), { status: 404 })
  assert.equal((await service.runStockAlerts()).sent, 0)
  assert.equal(inboxCalls, 0)
  product.approval = 'APPROVED'
  assert.equal((await service.runStockAlerts()).sent, 0)
  assert.equal(alert.notifiedAt, null)
  assert.equal((await service.runStockAlerts()).sent, 0)
  assert.equal(inboxKeys.size, 1)
  assert.equal(alert.notifiedAt, null)
  assert.equal((await service.runStockAlerts()).sent, 1)
  assert.equal(inboxKeys.size, 1)
  assert.ok(alert.notifiedAt)
  assert.equal((await service.runStockAlerts()).sent, 0)
  alert.createdAt = new Date('2026-09-02')
  alert.notifiedAt = null
  const concurrent = await Promise.all([service.runStockAlerts(), service.runStockAlerts()])
  assert.equal(concurrent.reduce((sum, result) => sum + result.sent, 0), 1)
  assert.equal(inboxKeys.size, 2)
})
