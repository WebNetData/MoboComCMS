const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript-api')
function load(relative, mocks = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', relative), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, mod = { exports: {} }
  new Function('require', 'module', 'exports', code)(name => {
    if (Object.hasOwn(mocks, name)) return mocks[name]
    if (name.startsWith('@/')) {
      for (const suffix of ['.ts', '/index.ts']) {
        const candidate = `src/${name.slice(2)}${suffix}`
        if (fs.existsSync(path.join(__dirname, '..', candidate))) return load(candidate, mocks)
      }
    }
    return require(name)
  }, mod, mod.exports)
  return mod.exports
}
test('history settings preserve omitted values and reject invalid windows', () => {
  const { normalizeStoreSettings, DEFAULT_STORE_SETTINGS } = load('src/modules/store/domain/store.ts')
  assert.equal(DEFAULT_STORE_SETTINGS.showPriceHistory, false)
  const enabled = normalizeStoreSettings({ showPriceHistory: true, priceHistoryDays: 30 })
  assert.equal(enabled.showPriceHistory, true); assert.equal(enabled.priceHistoryDays, 30)
  assert.equal(normalizeStoreSettings({ offerTitle: 'Updated' }, enabled).showPriceHistory, true)
  for (const priceHistoryDays of [29, 731, 30.5, 'bad', null]) assert.equal(normalizeStoreSettings({ priceHistoryDays }, enabled).priceHistoryDays, 30)
  assert.equal(normalizeStoreSettings({ priceHistoryDays: 730 }, enabled).priceHistoryDays, 730)
})

test('baseline admin action keeps the existing Store permission and queue owner without changing settings', async () => {
  let denied = true, enqueued = 0, saved = 0, audited = 0
  const response = { status: 403 }
  const routes = load('src/modules/store/server/http/routes.ts', {
    '@/platform/http/response': { ok: body => body, err: () => ({ status: 500 }) },
    '@/platform/audit/server': { auditAdmin: async input => { assert.equal(input.action, 'store.price-history.baseline'); assert.equal(input.targetId, 7); audited++ } },
    '@/extensions/server/modules': {}, '@/modules/identity/server/access': {}, '@/modules/settings/server': {},
    '@/modules/checkout/server/checkout': {}, '@/modules/store/server/cart': {}, '@/modules/store/server/marketing': {}, '@/modules/store/server/bundles': {},
    '@/modules/store/server/orders': {}, '@/modules/store/server/admin': {}, '@/modules/store/server/digital-codes': {},
    '@/modules/identity/server/admin-guard': { adminGuard: async (_req, module, permissions) => {
      assert.equal(module, 'store'); assert.deepEqual(permissions, ['settings.manage', 'cms.products'])
      return denied ? { response } : { admin: { id: 1 } }
    } },
    '@/modules/store/server/catalog': { saveStoreSettings: async () => { saved++ } },
    '@/modules/operations/server/queue': { enqueue: async (kind, payload, options) => {
      enqueued++; assert.equal(kind, 'store.price-history-baseline'); assert.deepEqual(payload, {}); assert.equal(options.dedupeKey, 'price-history-baseline:0'); return { id: 7 }
    } },
  })
  const req = { json: async () => ({ op: 'price-history-baseline' }) }
  assert.equal(await routes.POST_storeSettings(req), response); assert.equal(enqueued, 0)
  denied = false; assert.deepEqual(await routes.POST_storeSettings(req), { jobId: 7 })
  assert.equal(enqueued, 1); assert.equal(saved, 0); assert.equal(audited, 1)
})

test('public history enforces module/settings/public/variant ownership gates and bounds exact current-currency observations', async () => {
  let enabled = false, visible = false, publicProduct = true, variantActive = true, reads = 0
  const now = new Date('2026-10-04T12:00:00Z')
  const service = load('src/modules/catalog/server/price-history-read.ts', {
    '@/modules/catalog/server/storefront': { isStoreEnabled: async () => enabled },
    '@/modules/store/server/catalog': { getStoreSettings: async () => ({ showPriceHistory: visible, priceHistoryDays: 30 }) },
    '@/platform/database/prisma': { db: {
      product: { findUnique: async () => ({ active: publicProduct, approval: 'APPROVED', currency: 'IRT' }) },
      productVariant: { findFirst: async ({ where }) => { assert.deepEqual(where, { id: 9, productId: 1, active: true }); return variantActive ? { id: 9 } : null } },
      productPricePoint: { findMany: async ({ where, orderBy, take, select }) => {
        reads++; assert.equal(take, 121); assert.equal(where.productId, 1); assert.equal(where.variantId, 9); assert.equal(where.currency, 'IRT')
        assert.deepEqual(orderBy, [{ recordedAt: 'desc' }, { id: 'desc' }]); assert.equal(select.amountMinor, true)
        assert.equal(where.recordedAt.lte, now); assert.equal(where.recordedAt.gte.toISOString(), '2026-09-04T12:00:00.000Z')
        return Array.from({ length: 121 }, (_, i) => ({ id: 121 - i, amountMinor: 1234567890123456789n, recordedAt: now }))
      } },
    } },
  })
  assert.equal(await service.readProductPriceHistory(1, 9, now), null)
  enabled = true; assert.equal(await service.readProductPriceHistory(1, 9, now), null)
  visible = true; publicProduct = false; assert.equal(await service.readProductPriceHistory(1, 9, now), null)
  publicProduct = true; variantActive = false; assert.equal(await service.readProductPriceHistory(1, 9, now), null)
  assert.equal(reads, 0)
  variantActive = true
  const history = await service.readProductPriceHistory(1, 9, now)
  assert.equal(history.truncated, true); assert.equal(history.items.length, 120)
  assert.equal(history.items[0].id, 2); assert.equal(history.items.at(-1).id, 121)
  assert.equal(history.items[0].amountMinor, '1234567890123456789'); assert.equal(history.items[0].recordedAt, now.toISOString())
  for (const invalid of [-1, 1.5, Infinity]) assert.equal(await service.readProductPriceHistory(1, invalid, now), null)
  assert.equal(reads, 1)
})
test('public price observations preserve exact regular money and exclude non-public/inactive offers', () => {
  const { publicPriceObservations, priceObservationChanged } = load('src/modules/catalog/domain/price-history.ts')
  const product = { active: true, approval: 'APPROVED', currency: 'IRT', price: 12, priceMinor: 1234567890123456789n, memberPriceMinor: 1n, compareAtMinor: 99n }
  const variants = [{ id: 1, active: true, price: 30, priceMinor: 35n }, { id: 2, active: false, price: 40, priceMinor: 40n }]
  assert.deepEqual(publicPriceObservations(product, variants), [{ variantId: 0, amountMinor: product.priceMinor, currency: 'IRT' }, { variantId: 1, amountMinor: 35n, currency: 'IRT' }])
  for (const override of [{ active: false }, { approval: 'PENDING' }, { approval: 'REJECTED' }]) assert.deepEqual(publicPriceObservations({ ...product, ...override }, variants), [])
  const legacy = publicPriceObservations({ ...product, priceMinor: 0n, currency: 'USD', price: 1.25 }, [])
  assert.equal(legacy[0].amountMinor, 125n)
  assert.equal(priceObservationChanged({ amountMinor: 125n, currency: 'USD' }, legacy[0]), false)
  assert.equal(priceObservationChanged({ amountMinor: 124n, currency: 'USD' }, legacy[0]), true)
  assert.equal(priceObservationChanged({ amountMinor: 125n, currency: 'IRT' }, legacy[0]), true)
})

test('capture ignores irrelevant writes and persists only changed public observations', async () => {
  const state = { active: true, approval: 'APPROVED', currency: 'IRT', price: 10, priceMinor: 10n }
  const variants = Array.from({ length: 201 }, (_, i) => ({ id: i + 1, active: true, price: 20, priceMinor: 20n }))
  const records = [], cursors = []
  const tx = {
    $queryRaw: async () => [],
    product: { findUnique: async () => state },
    productVariant: { findMany: async ({ where, take, orderBy }) => { assert.equal(take, 200); assert.deepEqual(orderBy, { id: 'asc' }); cursors.push(where.id.gt); return variants.filter(row => row.active && row.id > where.id.gt).slice(0, take) } },
    productPricePoint: { findFirst: async ({ where }) => records.findLast(row => row.variantId === where.variantId) || null, create: async ({ data }) => { records.push(data); return { id: records.length } } },
  }
  const service = load('src/modules/catalog/server/price-history.ts')
  const before = await service.prepareProductPriceCapture(tx, 1)
  assert.equal(before.size, 202); assert.deepEqual(cursors, [0, 200])
  assert.equal(await service.capturePublicProductPrices(tx, 1, before), 0, 'no initial record on an unrelated update')
  assert.equal(await service.capturePublicProductPrices(tx, 1, new Map()), 202, 'explicit baseline')
  assert.equal(await service.capturePublicProductPrices(tx, 1, new Map()), 0, 'baseline retry is idempotent')
  state.priceMinor = 11n
  assert.equal(await service.capturePublicProductPrices(tx, 1, before), 1)
  const published = await service.prepareProductPriceCapture(tx, 1)
  state.approval = 'PENDING'; state.priceMinor = 12n
  assert.equal(await service.capturePublicProductPrices(tx, 1, published), 0)
  const privateState = await service.prepareProductPriceCapture(tx, 1)
  state.priceMinor = 13n; state.approval = 'APPROVED'
  assert.equal(await service.capturePublicProductPrices(tx, 1, privateState), 1)
  assert.ok(!records.some(row => row.amountMinor === 12n), 'private intermediate price never persisted')
  await assert.rejects(service.prepareProductPriceCapture(tx, 0), /Invalid/)
})

test('baseline uses the existing public/module policy and returns a bounded continuation', async () => {
  let enabled = false, queries = 0, captures = 0
  const { baselineProductPrices } = load('src/modules/catalog/server/price-history-baseline.ts', {
    '@/modules/catalog/server/storefront': { isStoreEnabled: async () => enabled },
    '@/modules/catalog/server/price-history': { lockProductPricing: async () => {}, capturePublicProductPrices: async (_tx, _id, before) => { assert.equal(before.size, 0); captures++; return 1 } },
    '@/platform/database/prisma': { db: { product: { findMany: async ({ where, take, orderBy }) => {
      queries++; assert.equal(where.active, true); assert.equal(where.approval, 'APPROVED'); assert.equal(take, 20); assert.deepEqual(orderBy, { id: 'asc' })
      return Array.from({ length: where.id.gt ? 0 : 20 }, (_, i) => ({ id: i + 1 }))
    } }, $transaction: async fn => fn({}) } },
  })
  assert.deepEqual(await baselineProductPrices(), { cursor: 0, scanned: 0, points: 0, done: true, skipped: true }); assert.equal(queries, 0)
  enabled = true
  assert.deepEqual(await baselineProductPrices(), { cursor: 20, scanned: 20, points: 20, done: false }); assert.equal(captures, 20)
  assert.deepEqual(await baselineProductPrices(20), { cursor: 20, scanned: 0, points: 0, done: true })
  await assert.rejects(baselineProductPrices(-1), /Invalid/)
})
