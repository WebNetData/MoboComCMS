// Docker-local real PostgreSQL capture/queue/Inbox checks; every fixture job is deferred before commit.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript')
const { PrismaClient } = require('@prisma/client'), db = new PrismaClient(), seed = `pd${Date.now().toString(36)}`, future = new Date('2099-01-01')
let product; const users = [], jobs = [], pointIds = []
let store = true, notices = true, failDelivery = false
const inboxDb = {
  productPricePoint: db.productPricePoint, itemFavorite: db.itemFavorite, userNotification: db.userNotification,
  $transaction: write => db.$transaction(async tx => {
    const result = await write(tx)
    // Exercise central Inbox's actual atomic transaction without allowing external provider work.
    await tx.backgroundJob.updateMany({ where: { dedupeKey: { startsWith: `notification:${result.id}:` } }, data: { runAt: future } })
    return result
  }),
}
const mocks = {
  '@/platform/database/prisma': { db: inboxDb },
  '@/modules/catalog/server/storefront': { isStoreEnabled: async () => store },
  '@/modules/store/server/catalog': { getStoreSettings: async () => ({ priceDropNotifications: notices }) },
}
const loaded = new Map()
function load(relative, extra = {}) {
  if (!Object.keys(extra).length && loaded.has(relative)) return loaded.get(relative)
  const mod = { exports: {} }, code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', relative), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  new Function('require', 'module', 'exports', code)(name => {
    if (Object.hasOwn(extra, name)) return extra[name]
    if (Object.hasOwn(mocks, name)) return mocks[name]
    if (name.startsWith('@/')) for (const suffix of ['.ts', '/index.ts']) { const file = `src/${name.slice(2)}${suffix}`; if (fs.existsSync(path.join(__dirname, '..', file))) return load(file) }
    return require(name)
  }, mod, mod.exports)
  if (!Object.keys(extra).length) loaded.set(relative, mod.exports)
  return mod.exports
}
async function main() {
  const pricing = load('src/modules/catalog/server/price-history.ts'), inbox = load('src/modules/notifications/server/inbox.ts')
  const worker = load('src/modules/catalog/server/price-drop-notifications.ts', { '@/modules/notifications/server/inbox': { createInboxEvent: async event => { if (failDelivery) throw Error('injected Inbox failure'); return inbox.createInboxEvent(event) } } })
  product = await db.product.create({ data: { slug: seed, name: seed, currency: 'IRT', price: 100, priceMinor: 100n, active: true, approval: 'APPROVED' } })
  for (let i = 0; i < 4; i++) {
    const user = await db.user.create({ data: { email: `${seed}-${i}@example.invalid`, passwordHash: 'test-only', status: i === 2 ? 'BANNED' : 'ACTIVE' } }); users.push(user.id)
    await db.itemFavorite.create({ data: { userId: user.id, itemType: 'product', itemId: product.id, notify: i !== 1, createdAt: i === 3 ? future : new Date('2026-01-01') } })
  }
  await db.$transaction(async tx => { await pricing.prepareProductPriceCapture(tx, product.id); await pricing.capturePublicProductPrices(tx, product.id, new Map()) })
  const save = value => db.$transaction(async tx => {
    const before = await pricing.prepareProductPriceCapture(tx, product.id)
    await tx.product.update({ where: { id: product.id }, data: { priceMinor: BigInt(value), price: value } })
    await pricing.capturePublicProductPrices(tx, product.id, before)
    const points = await tx.productPricePoint.findMany({ where: { productId: product.id }, select: { id: true } })
    await tx.backgroundJob.updateMany({ where: { dedupeKey: { in: points.map(row => `product-price-drop:${row.id}`) } }, data: { runAt: future } })
  })
  await save(90)
  let rows = await db.backgroundJob.findMany({ where: { kind: 'store.price-drop', dedupeKey: { in: (await db.productPricePoint.findMany({ where: { productId: product.id } })).map(row => `product-price-drop:${row.id}`) } } })
  assert.equal(rows.length, 1); assert.equal(rows[0].status, 'QUEUED'); assert.equal(rows[0].runAt.toISOString(), future.toISOString())
  const payload = JSON.parse(rows[0].payload); assert.equal(payload.previousMinor, '100')
  const oldCount = await db.productPricePoint.count({ where: { productId: product.id } })
  await assert.rejects(db.$transaction(async tx => {
    const before = await pricing.prepareProductPriceCapture(tx, product.id)
    await tx.product.update({ where: { id: product.id }, data: { priceMinor: 80n, price: 80 } })
    const failing = new Proxy(tx, { get: (target, key) => key === 'backgroundJob' ? { create: async () => { throw Error('injected enqueue failure') } } : target[key] })
    await pricing.capturePublicProductPrices(failing, product.id, before)
  }), /enqueue failure/)
  assert.equal((await db.product.findUniqueOrThrow({ where: { id: product.id } })).priceMinor, 90n)
  assert.equal(await db.productPricePoint.count({ where: { productId: product.id } }), oldCount)
  failDelivery = true; await assert.rejects(worker.deliverProductPriceDrop(payload), /Inbox failure/)
  failDelivery = false
  assert.equal((await worker.deliverProductPriceDrop(payload)).sent, 1)
  await worker.deliverProductPriceDrop(payload)
  assert.equal(await db.userNotification.count({ where: { userId: { in: users } } }), 1)
  assert.equal(await db.backgroundJob.count({ where: { kind: 'notification.deliver', dedupeKey: { startsWith: `notification:${(await db.userNotification.findFirst({ where: { userId: users[0] } })).id}:` } } }), 3)
  notices = false; assert.equal((await worker.deliverProductPriceDrop(payload)).skipped, 'notices-disabled'); notices = true
  store = false; assert.equal((await worker.deliverProductPriceDrop(payload)).skipped, 'store-disabled'); store = true
  await save(100); assert.equal((await worker.deliverProductPriceDrop(payload)).skipped, 'offer-unavailable')
  await save(90)
  const latestPoint = await db.productPricePoint.findFirst({ where: { productId: product.id }, orderBy: { id: 'desc' } })
  const repeated = await db.backgroundJob.findUniqueOrThrow({ where: { dedupeKey: `product-price-drop:${latestPoint.id}` } })
  assert.notEqual(repeated.id, rows[0].id); assert.equal((await worker.deliverProductPriceDrop(JSON.parse(repeated.payload))).sent, 1)
  assert.equal(await db.userNotification.count({ where: { userId: users[0] } }), 2, 'a later real drop to the same price is a new event')
  await db.itemFavorite.update({ where: { userId_itemType_itemId: { userId: users[0], itemType: 'product', itemId: product.id } }, data: { notify: false } })
  await save(80)
  const newest = await db.productPricePoint.findFirst({ where: { productId: product.id }, orderBy: { id: 'desc' } })
  const unsubscribedJob = await db.backgroundJob.findUniqueOrThrow({ where: { dedupeKey: `product-price-drop:${newest.id}` } })
  assert.equal((await worker.deliverProductPriceDrop(JSON.parse(unsubscribedJob.payload))).sent, 0)
  console.log('Price-drop PostgreSQL: atomic price/history/job enqueue rollback; existing opt-in/status/time filters; failure/retry; central Inbox and three deferred channel jobs; repeated real drop and unsubscribe passed. No provider sends.')
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => {
  const notifications = await db.userNotification.findMany({ where: { userId: { in: users } }, select: { id: true } })
  const dedupes = notifications.flatMap(row => ['sms', 'email', 'push'].map(channel => `notification:${row.id}:${channel}`))
  if (product) dedupes.push(...(await db.productPricePoint.findMany({ where: { productId: product.id }, select: { id: true } })).map(row => `product-price-drop:${row.id}`))
  await db.backgroundJob.deleteMany({ where: { dedupeKey: { in: dedupes } } })
  if (product) { await db.itemFavorite.deleteMany({ where: { itemType: 'product', itemId: product.id } }); await db.product.delete({ where: { id: product.id } }) }
  await db.user.deleteMany({ where: { id: { in: users } } }); await db.$disconnect()
})
