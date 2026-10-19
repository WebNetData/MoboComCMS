const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript-api')

const root = path.resolve(__dirname, '..')
function load(relative, mocks = {}, cache = new Map()) {
  const absolute = path.resolve(root, relative)
  if (cache.has(absolute)) return cache.get(absolute).exports
  const code = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const mod = { exports: {} }
  cache.set(absolute, mod)
  const localRequire = (name) => {
    if (Object.hasOwn(mocks, name)) return mocks[name]
    if (name.startsWith('@/') || name.startsWith('.')) {
      const base = name.startsWith('@/') ? path.resolve(root, 'src', name.slice(2)) : path.resolve(path.dirname(absolute), name)
      for (const suffix of ['.ts', '.tsx', '/index.ts']) if (fs.existsSync(base + suffix)) return load(path.relative(root, base + suffix), mocks, cache)
    }
    return require(name)
  }
  new Function('require', 'module', 'exports', code)(localRequire, mod, mod.exports)
  return mod.exports
}
const read = (file) => fs.readFileSync(path.resolve(root, file), 'utf8')
const fx = load('src/modules/fx/domain/fx.ts')
const rates = { USD: 100_000, EUR: 110_000, AED: 27_250 }
const input = (extra = {}) => ({ baseMinor: 2000n, baseCurrency: 'USD', sellCurrency: 'IRT', markupBps: 0, fixedMinor: 0n, roundTo: 1, ...extra })

test('price = cost × rate × (1 + markup%) + fixed, rounded up to the step', () => {
  // $20 at 100,000 toman
  assert.equal(fx.fxPrice(input(), rates), 2_000_000n)
  // 12.5% profit and 30,000 toman fixed
  assert.equal(fx.fxPrice(input({ markupBps: 1250, fixedMinor: 30_000n }), rates), 2_280_000n)
  // Rounded up to 1,000 toman; an exact multiple stays as it is
  assert.equal(fx.fxPrice(input({ baseMinor: 1999n, roundTo: 1000 }), rates), 1_999_000n)
  assert.equal(fx.fxPrice(input({ baseMinor: 1999n, markupBps: 3, roundTo: 1000 }), rates), 2_000_000n)
  assert.equal(fx.fxPrice(input({ baseMinor: 1n, roundTo: 5000 }), rates), 5000n)
  // Zero percent and zero fixed are allowed
  assert.equal(fx.fxPrice(input({ markupBps: 0, fixedMinor: 0n }), rates), 2_000_000n)
  // Selling in rial is ×10; euro cost uses the euro rate
  assert.equal(fx.fxPrice(input({ sellCurrency: 'IRR' }), rates), 20_000_000n)
  assert.equal(fx.fxPrice(input({ baseCurrency: 'EUR', baseMinor: 1050n }), rates), 1_155_000n)
  // A missing rate is an error, never a zero price
  assert.throws(() => fx.fxPrice(input({ baseCurrency: 'GBP' }), rates), /GBP|پوند/)
  assert.equal(fx.fxPrice(input({ baseMinor: 0n }), rates), 0n)
})

test('breakdown adds up to the total', () => {
  const parts = fx.fxBreakdown(input({ baseMinor: 1999n, markupBps: 1000, fixedMinor: 15_000n, roundTo: 10_000 }), rates)
  assert.equal(parts.conversion, 1_999_000n)
  assert.equal(parts.markup, 199_900n)
  assert.equal(parts.fixed, 15_000n)
  assert.equal(parts.conversion + parts.markup + parts.fixed + parts.rounding, parts.total)
  assert.equal(parts.total % 10_000n, 0n)
  assert.equal(parts.rate, 100_000)
})

test('markup percent input: decimals, Persian separator, bounds', () => {
  assert.equal(fx.percentToBps('12.5'), 1250)
  assert.equal(fx.percentToBps('12٫5'), 1250)
  assert.equal(fx.percentToBps(''), 0)
  assert.equal(fx.percentToBps(0), 0)
  assert.throws(() => fx.percentToBps('-5'), /درصد/)
  assert.throws(() => fx.percentToBps('1.234'), /درصد/)
  assert.throws(() => fx.percentToBps('2000'), /۱۰۰۰/)
  assert.equal(fx.bpsToPercent(1250), '12.5')
})

test('rate numbers: Persian digits, separators and rial units', () => {
  assert.equal(fx.parseRateNumber('۹۵٬۴۰۰'), 95400)
  assert.equal(fx.parseRateNumber('95,400.5'), 95400.5)
  assert.equal(fx.parseRateNumber(0), null)
  assert.equal(fx.parseRateNumber('abc'), null)
  assert.equal(fx.jsonPath({ data: { items: [{ price: 7 }] } }, 'data.items[0].price'), 7)
  assert.equal(fx.jsonPath({ a: 1 }, 'a.b.c'), undefined)
})

test('provider responses: navasan, BrsApi and custom JSON', () => {
  const navasan = fx.parseProviderRates('navasan', { usd_sell: { value: '95400' }, eur: { value: '104,200' }, aed_sell: { value: 'bad' }, aed: { value: '26000' }, usdt: { value: 94000 } }, fx.DEFAULT_FX)
  assert.deepEqual(navasan, { USD: 95400, EUR: 104200, AED: 26000, USDT: 94000 })
  const brs = fx.parseProviderRates('brsapi', { currency: [{ symbol: 'USD', price: 954000, unit: 'ریال' }, { symbol: 'EUR', price: 104200, unit: 'تومان' }, { symbol: 'XYZ', price: 1 }], cryptocurrency: [{ symbol: 'USDT', price: '94,500' }] }, fx.DEFAULT_FX)
  assert.deepEqual(brs, { USD: 95400, EUR: 104200, USDT: 94500 })
  const custom = fx.parseProviderRates('custom', { data: { usd: { sell: '1,020,000' } } }, { customMap: { USD: 'data.usd.sell', EUR: 'data.eur' }, customUnit: 'IRR' })
  assert.deepEqual(custom, { USD: 102000 })
  assert.deepEqual(fx.parseProviderRates('navasan', null, fx.DEFAULT_FX), {})
})

test('cross rates fill only what the source lacks; USDT follows the dollar', () => {
  const filled = fx.fillCrossRates({ USD: 100_000, EUR: 111_000 }, { EUR: 0.9, AED: 3.6725, GBP: 'x' }, ['USD', 'EUR', 'AED', 'GBP', 'USDT'])
  assert.equal(filled.EUR, 111_000)
  assert.equal(Math.round(filled.AED), 27_229)
  assert.equal(filled.GBP, undefined)
  assert.equal(filled.USDT, 100_000)
  assert.deepEqual(fx.fillCrossRates({ EUR: 1 }, { AED: 3 }, ['AED']), { EUR: 1 })
})

test('screening: big jumps wait for approval, locked rates are skipped, precision is kept sane', () => {
  const { apply, hold } = fx.screenRates({ USD: 100_000, EUR: 110_000, AED: 27_000 }, { USD: 104_000.4, EUR: 150_000, AED: 27_000, TRY: 2500.456, GBP: 130_000 }, 15, ['GBP'])
  assert.deepEqual(apply, { USD: 104_000, TRY: 2500 })
  assert.deepEqual(hold, { EUR: 150_000 })
  assert.deepEqual(fx.screenRates({ CNY: 12 }, { CNY: 12.3456 }, 50).apply, { CNY: 12.35 })
  // 0 = never hold
  assert.deepEqual(fx.screenRates({ USD: 100 }, { USD: 500 }, 0).hold, {})
})

test('config: clamps, custom map validation, key kept', () => {
  const config = fx.normalizeFxConfig({ provider: 'custom', customUrl: 'https://x.test/r', customMap: { USD: 'data.usd', BAD: 'x', EUR: '' }, intervalMinutes: 1, maxJumpPercent: 9999, roundToman: 0, currencies: ['USD', 'ZZZ'] })
  assert.equal(config.provider, 'custom')
  assert.deepEqual(config.customMap, { USD: 'data.usd' })
  assert.equal(config.intervalMinutes, 5)
  assert.equal(config.maxJumpPercent, 500)
  assert.equal(config.roundToman, 1)
  assert.deepEqual(config.currencies, ['USD'])
  assert.throws(() => fx.normalizeFxConfig({ customUrl: 'javascript:alert(1)' }), /نشانی/)
  assert.throws(() => fx.normalizeFxConfig({ customMap: { USD: 'a b;c' } }), /مسیر/)
  assert.equal(fx.normalizeFxConfig({ provider: 'nope' }).provider, 'manual')
  assert.equal(fx.normalizeFxConfig({}, { ...fx.DEFAULT_FX, apiKey: 'enc' }).apiKey, 'enc')
})

test('list and VIP prices follow a moved price proportionally', () => {
  assert.equal(fx.scaleAlong(1_200_000n, 1_000_000n, 1_100_000n), 1_320_000n)
  assert.equal(fx.scaleAlong(0n, 1_000_000n, 1_100_000n), 0n)
  assert.equal(fx.scaleAlong(5n, 0n, 10n), 0n)
})

test('server: FX product prices follow the product fields and repricing skips unchanged rows', async () => {
  const updates = []
  const products = [
    { id: 1, currency: 'IRT', priceMinor: 0n, compareAtMinor: 0n, memberPriceMinor: 0n, pricingMode: 'FX', fxCurrency: 'USD', fxAmountMinor: 2000n, fxCompareAtMinor: 2500n, fxMemberMinor: 1800n, markupBps: 1000, markupFixedMinor: 20_000n, variants: [{ id: 10, priceMinor: 1n, compareAtMinor: 0n, memberPriceMinor: 0n, fxAmountMinor: 3000n }] },
    { id: 2, currency: 'IRT', priceMinor: 2_000_000n, compareAtMinor: 0n, memberPriceMinor: 0n, pricingMode: 'FX', fxCurrency: 'USD', fxAmountMinor: 2000n, fxCompareAtMinor: 0n, fxMemberMinor: 0n, markupBps: 0, markupFixedMinor: 0n, variants: [] },
  ]
  const db = {
    currencyRate: { findMany: async () => [{ code: 'USD', rate: 100_000 }] },
    setting: { findUnique: async () => null },
    product: { findMany: async () => products, findUnique: async ({ where }) => products.find(row => row.id === where.id), update: (args) => { updates.push(['product', args]); return args } },
    productVariant: { update: (args) => { updates.push(['variant', args]); return args } },
    $transaction: async (write) => write(db),
  }
  const server = load('src/modules/fx/server/fx.ts', {
    '@/modules/catalog/server/price-history': { prepareProductPriceCapture: async () => new Map(), capturePublicProductPrices: async () => 0 },
    '@/platform/database/prisma': { db },
    '@/platform/observability/logger': { logEvent: () => {} },
    '@/modules/settings/server': { readJsonSetting: async () => ({ roundToman: 1000 }), setSetting: async () => {}, writeJsonSetting: async () => {} },
    '@/modules/providers/server/panel-credentials': { decryptPanelCredential: (v) => v, encryptPanelCredential: (v) => v },
    '@/modules/server-panel/domain/downloads': { isPrivateAddress: () => false },
    '@/modules/notifications/server/inbox': { createInboxEvent: async () => {} },
  })
  const result = await server.repriceProducts()
  assert.equal(result.count, 1)
  assert.deepEqual(result.byCurrency, { USD: 1 })
  const product = updates.find(([kind]) => kind === 'product')[1]
  // 20 × 100,000 × 1.1 + 20,000 = 2,220,000
  assert.equal(product.data.priceMinor, 2_220_000n)
  assert.equal(product.data.compareAtMinor, 2_770_000n)
  assert.equal(product.data.memberPriceMinor, 2_000_000n)
  const variant = updates.find(([kind]) => kind === 'variant')[1]
  assert.equal(variant.data.priceMinor, 3_320_000n)

  // Product form in FX mode: prices come from the cost, typed prices are ignored
  const applied = await server.applyFxToBody({ pricingMode: 'FX', fxCurrency: 'USD', fxAmount: '9.99', markupPercent: '20', markupFixed: '0', price: '1', variants: [{ sku: 'a', fxAmount: '' }, { sku: 'b', fxAmount: '19.99' }] }, undefined, 'IRT')
  assert.equal(applied.body.price, '1199000')
  assert.equal(applied.body.variants[0].price, '1199000')
  assert.equal(applied.body.variants[1].price, '2399000')
  assert.equal(applied.body.variants[1].fxAmountMinor, 1999n)
  assert.equal(applied.fields.pricingMode, 'FX')
  assert.equal(applied.fields.markupBps, 2000)
  await assert.rejects(server.applyFxToBody({ pricingMode: 'FX', fxCurrency: 'USD', fxAmount: '' }, undefined, 'IRT'), /قیمت ارزی/)
  await assert.rejects(server.applyFxToBody({ pricingMode: 'FX', fxCurrency: 'USD', fxAmount: '10', fxCompareAt: '9' }, undefined, 'IRT'), /قبل از تخفیف/)
  await assert.rejects(server.applyFxToBody({ pricingMode: 'FX', fxCurrency: 'GBP', fxAmount: '10' }, undefined, 'IRT'), /پوند/)
  // Fixed-price products pass through untouched; switching back to fixed is recorded
  const fixed = await server.applyFxToBody({ price: '5000' }, undefined, 'IRT')
  assert.equal(fixed.body.price, '5000')
  assert.deepEqual(fixed.fields, {})
  assert.deepEqual((await server.applyFxToBody({ pricingMode: 'FIXED', price: '5000' }, { pricingMode: 'FX' }, 'IRT')).fields, { pricingMode: 'FIXED' })
})

test('wiring: scheduler job, admin page, product editor, inbox kind', () => {
  assert.match(read('src/modules/notifications/server/jobs-scheduler.ts'), /name: 'fx'[\s\S]*runFxJob/)
  assert.match(read('src/plugins/store/manifest.json'), /\/admin\/store\/currency/)
  assert.match(read('src/app/admin/store/products/[id]/page.tsx'), /FxPricing/)
  assert.match(read('src/modules/catalog/server/product-input.ts'), /applyFxToBody/)
  assert.match(read('src/modules/mail/domain/mail.ts'), /FX_RATE/)
  assert.match(read('src/modules/sms/domain/sms.ts'), /FX_RATE/)
  // The custom source is fetched without following redirects and never from the private network
  const server = read('src/modules/fx/server/fx.ts')
  assert.match(server, /redirect: 'error'/)
  assert.match(server, /isPrivateAddress/)
})

test('switching a variant product to FX keeps the price differences between variants', () => {
  const { proportionalCost } = load('src/modules/fx/server/fx.ts', {
    '@/platform/database/prisma': { db: {} },
    '@/modules/settings/server': {},
  })
  assert.equal(proportionalCost(1000n, 1_500_000, 1_000_000), 1500n, 'a white shirt 50% dearer costs 15 USD when the product costs 10')
  assert.equal(proportionalCost(1000n, 1_000_000, 1_000_000), 0n, 'same price → follows the product')
  assert.equal(proportionalCost(1000n, 0, 1_000_000), 0n)
  assert.equal(proportionalCost(0n, 5, 10), 0n)
  const fx = read('src/modules/fx/server/fx.ts')
  assert.match(fx, /existing\?\.pricingMode !== 'FX'/, 'only when switching from a fixed price')
  assert.match(fx, /export async function convertForeignProducts/)
  assert.match(read('src/modules/store/server/admin.ts'), /pricingMode !== 'FX'/, 'bulk price edits leave FX products alone')
})

test('foreign conversion commits currency/prices/observations together and rolls back capture failures', async () => {
  for (const fail of [false, true]) {
    let state = { id: 1, name: 'Fixture', currency: 'USD', pricingMode: 'FIXED', priceMinor: 1000n, compareAtMinor: 0n, memberPriceMinor: 0n, variants: [{ id: 2, priceMinor: 1500n }] }
    let captures = 0
    const db = {
      currencyRate: { findMany: async () => [{ code: 'USD', rate: 100000 }] },
      product: { findMany: async () => [structuredClone(state)] },
      $transaction: async write => {
        const pending = structuredClone(state)
        const tx = { pending, product: { findUnique: async () => pending, update: async ({ data }) => Object.assign(pending, data) }, productVariant: { update: async ({ data }) => Object.assign(pending.variants[0], data) } }
        const result = await write(tx); state = pending; return result
      },
    }
    const server = load('src/modules/fx/server/fx.ts', {
      '@/platform/database/prisma': { db },
      '@/modules/catalog/server/price-history': { prepareProductPriceCapture: async () => new Map(), capturePublicProductPrices: async tx => {
        captures++; assert.equal(tx.pending.currency, 'IRT'); assert.equal(tx.pending.priceMinor, 1000000n); assert.equal(tx.pending.variants[0].priceMinor, 1500000n)
        if (fail) throw new Error('capture failed')
      } },
      '@/modules/settings/server': { readJsonSetting: async () => ({ roundToman: 1000 }) },
      '@/platform/observability/logger': {}, '@/modules/providers/server/panel-credentials': {}, '@/modules/server-panel/domain/downloads': {}, '@/modules/notifications/server/inbox': {},
    })
    if (fail) { await assert.rejects(server.convertForeignProducts(), /capture failed/); assert.equal(state.currency, 'USD'); assert.equal(state.priceMinor, 1000n) }
    else { assert.equal((await server.convertForeignProducts()).converted, 1); assert.equal(state.currency, 'IRT'); assert.equal(state.variants[0].fxAmountMinor, 1500n) }
    assert.equal(captures, 1)
  }
})
