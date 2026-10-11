const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript')
function load(relative, mocks = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', relative), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, mod = { exports: {} }
  new Function('require', 'module', 'exports', code)(name => {
    if (Object.hasOwn(mocks, name)) return mocks[name]
    if (name.startsWith('@/')) for (const suffix of ['.ts', '/index.ts']) { const file = `src/${name.slice(2)}${suffix}`; if (fs.existsSync(path.join(__dirname, '..', file))) return load(file, mocks) }
    return require(name)
  }, mod, mod.exports)
  return mod.exports
}

test('transactional capture queues only a same-currency public base-price drop and propagates queue failure', async () => {
  const product = { active: true, approval: 'APPROVED', currency: 'IRT', price: 100, priceMinor: 100n }, records = [], jobs = []
  let fail = false
  const tx = {
    product: { findUnique: async () => product }, productVariant: { findMany: async () => [] }, $queryRaw: async () => [],
    productPricePoint: { findFirst: async () => records.at(-1) || null, create: async ({ data }) => { const row = { ...data, id: records.length + 1 }; records.push(row); return row } },
    backgroundJob: { create: async ({ data }) => { if (fail) throw Error('queue unavailable'); jobs.push(data) } },
  }
  const { prepareProductPriceCapture: prepare, capturePublicProductPrices: capture } = load('src/modules/catalog/server/price-history.ts')
  await capture(tx, 1, new Map()); assert.equal(jobs.length, 0, 'baseline does not notify')
  let before = await prepare(tx, 1); product.priceMinor = 90n
  assert.equal(await capture(tx, 1, before), 1); assert.equal(jobs.length, 1)
  assert.deepEqual(JSON.parse(jobs[0].payload), { pointId: 2, previousMinor: '100', currency: 'IRT', cursor: 0 }); assert.equal(jobs[0].dedupeKey, 'product-price-drop:2')
  await capture(tx, 1, before); assert.equal(jobs.length, 1, 'retry with unchanged last observation does not queue again')
  before = await prepare(tx, 1); product.priceMinor = 95n; await capture(tx, 1, before); assert.equal(jobs.length, 1)
  before = await prepare(tx, 1); product.currency = 'USD'; product.priceMinor = 10n; await capture(tx, 1, before); assert.equal(jobs.length, 1, 'currency conversion is not a drop')
  product.active = false; before = await prepare(tx, 1); product.active = true; product.priceMinor = 5n; await capture(tx, 1, before); assert.equal(jobs.length, 1, 'private-to-public baseline is not a drop')
  before = await prepare(tx, 1); product.priceMinor = 4n; fail = true
  await assert.rejects(capture(tx, 1, before), /queue unavailable/, 'caller transaction must roll back if durable enqueue fails')
})

test('drop delivery validates current offer and module/settings/publication before reading followers', async () => {
  let enabled = false, notices = true, active = true, currency = 'IRT', amount = 80n, queries = 0
  const point = { id: 1, productId: 2, variantId: 0, amountMinor: 90n, currency: 'IRT', recordedAt: new Date(), product: { id: 2, slug: 'test', name: 'Test', nameEn: '', active: true, approval: 'APPROVED', currency: 'IRT', price: 80, priceMinor: 80n } }
  const service = load('src/modules/catalog/server/price-drop-notifications.ts', {
    '@/platform/database/prisma': { db: { productPricePoint: { findUnique: async () => ({ ...point, product: { ...point.product, active, currency, priceMinor: amount } }) }, itemFavorite: { findMany: async () => { queries++; return [] } } } },
    '@/modules/catalog/server/storefront': { isStoreEnabled: async () => enabled },
    '@/modules/store/server/catalog': { getStoreSettings: async () => ({ priceDropNotifications: notices }) },
    '@/modules/notifications/server/inbox': { createInboxEvent: async () => { throw Error('No followers') } },
  })
  const job = { pointId: 1, previousMinor: '100', currency: 'IRT', cursor: 0 }
  assert.equal((await service.deliverProductPriceDrop(job)).skipped, 'store-disabled')
  enabled = true; notices = false; assert.equal((await service.deliverProductPriceDrop(job)).skipped, 'notices-disabled')
  notices = true; active = false; assert.equal((await service.deliverProductPriceDrop(job)).skipped, 'offer-unavailable')
  active = true; currency = 'USD'; assert.equal((await service.deliverProductPriceDrop(job)).skipped, 'offer-unavailable')
  currency = 'IRT'; amount = 91n; assert.equal((await service.deliverProductPriceDrop(job)).skipped, 'offer-unavailable')
  assert.equal(queries, 0)
  assert.equal((await service.deliverProductPriceDrop({ ...job, previousMinor: '90' })).skipped, 'invalid-observation')
  amount = 80n; assert.deepEqual(await service.deliverProductPriceDrop(job), { done: true, cursor: 0, sent: 0 })
  for (const bad of [{ pointId: 0 }, { cursor: -1 }, { previousMinor: '1.5' }]) await assert.rejects(service.deliverProductPriceDrop({ ...job, ...bad }), /Invalid/)
})

test('followers beyond 5000 use bounded checkpoints, point-specific dedupe and current opt-out rechecks; failures propagate', async () => {
  const total = 5001, createdAt = new Date('2026-10-04T01:00:00Z'), events = new Map(); let failUser = null, rechecks = 0
  const service = load('src/modules/catalog/server/price-drop-notifications.ts', {
    '@/modules/catalog/server/storefront': { isStoreEnabled: async () => true },
    '@/modules/store/server/catalog': { getStoreSettings: async () => ({ priceDropNotifications: true }) },
    '@/platform/database/prisma': { db: {
      productPricePoint: { findUnique: async () => ({ id: 7, productId: 2, variantId: 0, currency: 'IRT', amountMinor: 90n, recordedAt: createdAt, product: { slug: 'test', name: 'کالا', nameEn: 'Product', active: true, approval: 'APPROVED', currency: 'IRT', priceMinor: 90n, price: 90 } }) },
      itemFavorite: {
        findMany: async ({ where, take, orderBy }) => {
          assert.equal(take, 100); assert.equal(where.notify, true); assert.equal(where.user.status, 'ACTIVE'); assert.equal(where.createdAt.lte, createdAt); assert.deepEqual(orderBy, { userId: 'asc' })
          return Array.from({ length: Math.min(100, total - where.userId.gt) }, (_, i) => ({ userId: where.userId.gt + i + 1 }))
        },
        findFirst: async ({ where }) => { rechecks++; return where.userId === 2 ? null : { userId: where.userId } },
      },
    } },
    '@/modules/notifications/server/inbox': { createInboxEvent: async event => {
      if (event.userId === failUser) throw Error('inbox unavailable')
      assert.equal(event.kind, 'FOLLOWED_UPDATE'); assert.ok(event.titleEn.includes('Product')); assert.equal(event.href, '/products/test')
      events.set(event.dedupeKey, event)
    } },
  })
  const job = { pointId: 7, previousMinor: '100', currency: 'IRT', cursor: 0 }
  failUser = 3; await assert.rejects(service.deliverProductPriceDrop(job), /inbox unavailable/); assert.equal(events.size, 1)
  failUser = null; let cursor = 0, pages = 0
  for (;;) { const result = await service.deliverProductPriceDrop({ ...job, cursor }); pages++; cursor = result.cursor; if (result.done) break }
  assert.equal(pages, 51); assert.equal(cursor, 5001); assert.equal(events.size, 5000); assert.ok(rechecks > 5001)
  await service.deliverProductPriceDrop(job); assert.equal(events.size, 5000, 'same page retry uses the same dedupe keys')
  assert.ok([...events.keys()].every(key => key.includes('price-point-7:')))
})

test('Store price-drop toggle preserves old-client omissions and existing enabled default', () => {
  const { DEFAULT_STORE_SETTINGS, normalizeStoreSettings } = load('src/modules/store/domain/store.ts')
  assert.equal(DEFAULT_STORE_SETTINGS.priceDropNotifications, true)
  const off = normalizeStoreSettings({ priceDropNotifications: false })
  assert.equal(normalizeStoreSettings({ offerTitle: 'Legacy client' }, off).priceDropNotifications, false)
  assert.equal(normalizeStoreSettings({ priceDropNotifications: true }, off).priceDropNotifications, true)
})

test('CDN queue delegates to its provider owner and retains failures for retry', async () => {
  for (const fail of [false, true]) {
    let selected = false, calls = 0; const updates = []
    const queue = load('src/modules/operations/server/queue.ts', {
      '@/platform/database/prisma': { db: { backgroundJob: {
        updateMany: async args => { updates.push(args); return { count: 1 } },
        findFirst: async () => { if (selected) return null; selected = true; return { id: 1, kind: 'cdn.purge', attempts: 0, payload: '{}' } },
        update: async args => updates.push(args), deleteMany: async () => ({ count: 0 }),
      } } },
      '@/platform/observability/logger': { logEvent: () => {} },
      '@/modules/server-panel/server/domains': { purgeCloudflareCache: async () => { calls++; if (fail) throw Error('provider unavailable'); return { purged: true } } },
    })
    assert.equal((await queue.runQueue(1000)).ran, 1)
    assert.equal(calls, 1)
    const terminal = updates.at(-1).data
    assert.equal(terminal.status, fail ? 'QUEUED' : 'DONE')
    if (fail) { assert.match(terminal.lastError, /provider unavailable/); assert.ok(terminal.runAt > new Date()) }
  }
})

test('existing queue dispatches bounded price-drop continuations and retries worker failures', async () => {
  for (const fail of [false, true]) {
    let selected = false; const updates = [], created = []
    const payload = { pointId: 7, previousMinor: '100', currency: 'IRT', cursor: 0 }
    const queue = load('src/modules/operations/server/queue.ts', {
      '@/platform/database/prisma': { db: { backgroundJob: {
        updateMany: async args => { updates.push(args); return { count: 1 } },
        findFirst: async () => { if (selected) return null; selected = true; return { id: 1, kind: 'store.price-drop', attempts: 0, payload: JSON.stringify(payload) } },
        update: async args => updates.push(args), findUnique: async () => null,
        create: async ({ data }) => { created.push(data); return { id: 2, ...data } }, deleteMany: async () => ({ count: 0 }),
      } } },
      '@/platform/observability/logger': { logEvent: () => {} },
      '@/modules/catalog/server/price-drop-notifications': { deliverProductPriceDrop: async actual => { assert.deepEqual(actual, payload); if (fail) throw Error('injected delivery failure'); return { done: false, cursor: 100, sent: 100 } } },
    })
    assert.equal(queue.isJobKind('store.price-drop'), true)
    assert.equal((await queue.runQueue(1000)).ran, 1)
    const terminal = updates.at(-1).data
    if (fail) { assert.equal(terminal.status, 'QUEUED'); assert.match(terminal.lastError, /delivery failure/); assert.ok(terminal.runAt > new Date()); assert.equal(created.length, 0) }
    else { assert.equal(terminal.status, 'DONE'); assert.equal(created.length, 1); assert.equal(created[0].dedupeKey, 'product-price-drop:7:after:100'); assert.deepEqual(JSON.parse(created[0].payload), { ...payload, cursor: 100 }) }
  }
})
