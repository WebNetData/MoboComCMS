// Local PostgreSQL check: node --env-file=.env scripts/store-stock-alert.connected.cjs
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const { PrismaClient } = require('@prisma/client')

process.env.DATABASE_URL = 'postgresql://mobocom:mobocom-local@127.0.0.1:5435/mobocom?schema=public'
const database = new PrismaClient()
const seed = `codex-stock-alert-${Date.now()}`
let userId = 0, productId = 0, alertId = 0

function load(relative, mocks = {}) {
  const source = fs.readFileSync(path.join(__dirname, '..', relative), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText
  const loaded = { exports: {} }
  new Function('require', 'module', 'exports', compiled)((name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name), loaded, loaded.exports)
  return loaded.exports
}

async function main() {
  const user = await database.user.create({ data: { email: `${seed}@example.invalid`, passwordHash: 'test-only' } })
  userId = user.id
  const product = await database.product.create({ data: {
    slug: seed, name: 'Stock alert QA', active: true, approval: 'PENDING', stock: 5, currency: 'IRT', price: 1000, priceMinor: 1000n,
    variants: { create: [{ sku: `${seed}-variant`, name: 'QA variant', stock: 0, price: 1000, priceMinor: 1000n }] },
  }, include: { variants: true } })
  productId = product.id
  const variantId = product.variants[0].id
  const alert = await database.stockAlert.create({ data: { userId, productId, variantId } })
  alertId = alert.id
  let failInbox = true
  const facade = {
    product: database.product,
    stockAlert: {
      findMany: (...args) => database.stockAlert.findMany(...args),
      updateMany: (...args) => database.stockAlert.updateMany(...args),
    },
  }
  const domain = load('src/modules/store/domain/marketing.ts')
  const service = load('src/modules/store/server/marketing.ts', {
    '@/platform/database/prisma': { db: facade },
    '@/platform/config/env': {},
    '@/platform/observability/logger': { logEvent: () => undefined },
    '@/modules/settings/server': {},
    '@/modules/notifications/server/inbox': { createInboxEvent: async (event) => {
      if (failInbox) { failInbox = false; throw new Error('temporary inbox failure') }
      return database.userNotification.upsert({ where: { dedupeKey: event.dedupeKey }, create: event, update: {} })
    } },
    '@/modules/wallet/server/wallet': {},
    '@/modules/providers/server/panel-credentials': {},
    '@/modules/store/server/cart': {},
    '@/shared/money': {},
    '@/modules/store/domain/marketing': domain,
  })

  assert.equal((await service.runStockAlerts()).sent, 0)
  await database.product.update({ where: { id: productId }, data: { approval: 'APPROVED' } })
  assert.equal((await service.runStockAlerts()).sent, 0)
  await database.productVariant.update({ where: { id: variantId }, data: { stock: 2 } })
  assert.equal((await service.runStockAlerts()).sent, 0)
  assert.equal(await database.userNotification.count({ where: { userId, kind: 'STOCK_BACK' } }), 0)
  assert.equal((await service.runStockAlerts()).sent, 1)
  assert.equal((await service.runStockAlerts()).sent, 0)
  assert.equal(await database.userNotification.count({ where: { userId, kind: 'STOCK_BACK' } }), 1)
  assert.ok((await database.stockAlert.findUnique({ where: { id: alertId } })).notifiedAt)
  console.log('Store stock alert PostgreSQL: publication, failed inbox retry and idempotent marker OK')
}

main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(async () => {
  if (userId) await database.userNotification.deleteMany({ where: { userId } })
  if (alertId) await database.stockAlert.deleteMany({ where: { id: alertId } })
  if (productId) await database.product.delete({ where: { id: productId } })
  if (userId) await database.user.delete({ where: { id: userId } })
  await database.$disconnect()
})
