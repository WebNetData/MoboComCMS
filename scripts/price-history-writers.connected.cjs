// Real PostgreSQL and existing write owners. Deterministic FX/settings; outbound notifications/events are stubbed.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript')
const { PrismaClient } = require('@prisma/client'), db = new PrismaClient(), seed = `phw${Date.now().toString(36)}`
const products = []; let user, seller
const mocks = {
  '@/platform/database/prisma': { db },
  '@/modules/content/server/events': { contentChanged: () => {} },
  '@/modules/notifications/server/inbox': { createInboxEvent: async () => {} },
  '@/modules/settings/server': { readJsonSetting: async () => ({ autoApproveProducts: true, roundToman: 1000 }) },
  '@/platform/observability/logger': { logEvent: () => {} },
  '@/extensions/server/modules': { isModuleEnabled: async () => true },
}
const loaded = new Map()
function load(relative, overrides = {}) {
  if (!Object.keys(overrides).length && loaded.has(relative)) return loaded.get(relative)
  const mod = { exports: {} }, code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', relative), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  new Function('require', 'module', 'exports', code)(name => {
    if (Object.hasOwn(overrides, name)) return overrides[name]
    if (Object.hasOwn(mocks, name)) return mocks[name]
    if (name.startsWith('@/') && name.endsWith('.json')) return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', name.slice(2)), 'utf8'))
    if (name.startsWith('@/')) for (const suffix of ['.ts', '/index.ts']) { const file = `src/${name.slice(2)}${suffix}`; if (fs.existsSync(path.join(__dirname, '..', file))) return load(file) }
    return require(name)
  }, mod, mod.exports)
  if (!Object.keys(overrides).length) loaded.set(relative, mod.exports)
  return mod.exports
}
const latest = (productId, variantId = 0) => db.productPricePoint.findFirst({ where: { productId, variantId }, orderBy: { id: 'desc' } })
async function main() {
  user = await db.user.create({ data: { email: `${seed}@example.invalid`, passwordHash: 'test-only' } })
  seller = await db.seller.create({ data: { userId: user.id, slug: seed, shopName: seed, status: 'ACTIVE' } })
  const market = load('src/modules/marketplace/server/marketplace.ts')
  const created = await market.saveSellerProduct(seller, { name: seed, slug: seed, price: '100', currency: 'IRT', active: true, kind: 'PHYSICAL' }); products.push(created.id)
  assert.equal((await latest(created.id)).amountMinor, 100n)
  await market.saveSellerProduct(seller, { name: seed, price: '110' }, created.id); assert.equal((await latest(created.id)).amountMinor, 110n)
  await market.quickUpdate(seller, created.id, { price: '120' }); assert.equal((await latest(created.id)).amountMinor, 120n)
  let count = await db.productPricePoint.count({ where: { productId: created.id } })
  await market.quickUpdate(seller, created.id, { stock: 5 }); assert.equal(await db.productPricePoint.count({ where: { productId: created.id } }), count)
  await market.decideProduct({ id: created.id, action: 'reject' }); await market.quickUpdate(seller, created.id, { price: '130' })
  assert.equal(await db.productPricePoint.count({ where: { productId: created.id } }), count)
  await market.decideProduct({ id: created.id, action: 'approve' }); assert.equal((await latest(created.id)).amountMinor, 130n)
  const store = load('src/modules/store/server/admin.ts')
  await store.bulkProducts({ ids: [created.id], action: 'price', value: 10, round: 1 }); assert.equal((await latest(created.id)).amountMinor, 143n)
  // Concurrent percentage writes must calculate from the state under the lock, not their initial selection.
  await Promise.all([1, 2].map(() => store.bulkProducts({ ids: [created.id], action: 'price', value: 10, round: 1 })))
  assert.equal((await latest(created.id)).amountMinor, 172n)
  await store.bulkProducts({ ids: [created.id], action: 'deactivate' })
  await db.product.update({ where: { id: created.id }, data: { priceMinor: 200n, price: 200 } })
  await store.bulkProducts({ ids: [created.id], action: 'activate' }); assert.equal((await latest(created.id)).amountMinor, 200n)
  const importer = load('src/modules/imports/server/adapters/store.ts').storeImporter
  const ctx = { jobId: null, actor: { id: user.id, email: user.email }, dryRun: false, cache: new Map(), planned: new Set(), knownImages: new Set(), settings: { options: importer.normalizeOptions({ groupMode: 'none' }), existing: 'update', attributes: [], variants: { mode: 'none' }, policies: {} }, allow: values => values, allowVariant: values => values, previewLines: () => [], importImage: async () => { throw Error('No fixture images') } }
  const item = { index: 0, rows: [1], values: { price: '220' }, variants: [], specs: {}, variantAttributes: [], raw: {} }
  const planned = { action: 'UPDATE', title: seed, sourceKey: seed, messages: [], counters: {}, preview: {}, data: { existing: await db.product.findUnique({ where: { id: created.id } }), values: item.values, specs: {}, categoryPath: [], brandName: '', group: null, newFields: [], newOptions: [], kind: 'PHYSICAL', variants: [], missingVariantIds: [], images: { image: '', gallery: [] }, derivedPrice: null } }
  const applied = await importer.apply(item, planned, ctx); assert.equal((await latest(created.id)).amountMinor, 220n)
  assert.deepEqual((await importer.rollback(applied.changes)).conflicts, []); assert.equal((await latest(created.id)).amountMinor, 200n)
  const variant = await db.productVariant.create({ data: { productId: created.id, sku: `${seed}-variant`, name: seed, active: true, price: 50, priceMinor: 50n } })
  const capture = load('src/modules/catalog/server/price-history.ts')
  await db.$transaction(async tx => { const before = await capture.prepareProductPriceCapture(tx, created.id); await tx.productVariant.update({ where: { id: variant.id }, data: { price: 60, priceMinor: 60n } }); await capture.capturePublicProductPrices(tx, created.id, before) })
  assert.deepEqual((await importer.rollback([{ kind: 'updated', entity: 'productVariant', id: variant.id, before: { price: 50, priceMinor: '50' }, after: { price: 60, priceMinor: '60' } }])).conflicts, [])
  assert.equal((await latest(created.id, variant.id)).amountMinor, 50n)
  const foreign = await db.product.create({ data: { name: seed, slug: `${seed}-fx`, currency: 'USD', pricingMode: 'FIXED', active: true, approval: 'APPROVED', price: 10, priceMinor: 1000n } }); products.push(foreign.id)
  await db.productVariant.create({ data: { productId: foreign.id, sku: `${seed}-fxv`, name: seed, active: true, price: 15, priceMinor: 1500n } })
  const scoped = { $transaction: db.$transaction.bind(db), product: { findMany: () => db.product.findMany({ where: { id: foreign.id }, include: { variants: true } }) }, currencyRate: { findMany: async () => [{ code: 'USD', rate: 100000 }] } }
  const fx = load('src/modules/fx/server/fx.ts', { '@/platform/database/prisma': { db: scoped } })
  assert.equal((await fx.convertForeignProducts()).converted, 1); assert.equal((await latest(foreign.id)).currency, 'IRT'); assert.equal((await latest(foreign.id)).amountMinor, 1000000n)
  assert.equal((await fx.convertForeignProducts()).converted, 0)
  await db.product.update({ where: { id: foreign.id }, data: { fxAmountMinor: 1200n } })
  assert.equal((await fx.repriceProducts({ ids: [foreign.id] })).count, 1); assert.equal((await latest(foreign.id)).amountMinor, 1200000n)
  assert.equal((await fx.repriceProducts({ ids: [foreign.id] })).count, 0)
  console.log('PostgreSQL existing writers: Marketplace create/full/quick/approval, Store bulk/concurrent/activation, Import apply/product+variant undo, FX conversion/repricing passed; outbound events stubbed.')
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => {
  await db.product.deleteMany({ where: { id: { in: products } } })
  if (seller) await db.seller.delete({ where: { id: seller.id } })
  if (user) await db.user.delete({ where: { id: user.id } })
  await db.$disconnect()
})
