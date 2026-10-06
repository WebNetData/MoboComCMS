const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const cache = new Map()
function load(relative) {
  const file = path.resolve(__dirname, '..', relative.endsWith('.ts') ? relative : `${relative}.ts`)
  if (cache.has(file)) return cache.get(file).exports
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText
  const mod = { exports: {} }
  cache.set(file, mod)
  const localRequire = (specifier) => (specifier.startsWith('@/') ? load(`src/${specifier.slice(2)}`) : require(specifier))
  new Function('require', 'module', 'exports', source)(localRequire, mod, mod.exports)
  return mod.exports
}
const read = (relative) => fs.readFileSync(path.resolve(__dirname, '..', relative), 'utf8')
const r = load('src/modules/store/domain/returns')
const oi = load('src/modules/billing/domain/official-invoice')

const base = { paid: true, fulfilment: 'PENDING', deliveredAt: null, open: false, fullyRefunded: false, physical: true }
const settings = r.normalizeReturnSettings({})

test('cancel before shipping, return within the window after delivery', () => {
  assert.deepEqual(r.eligibility(base, settings).cancel, true)
  assert.equal(r.eligibility({ ...base, fulfilment: 'PACKED' }, settings).cancel, true)
  const shipped = r.eligibility({ ...base, fulfilment: 'SHIPPED' }, settings)
  assert.equal(shipped.cancel || shipped.return, false)
  assert.match(shipped.reason, /در راه/)
  assert.equal(r.eligibility({ ...base, fulfilment: 'PACKED' }, { ...settings, cancelBefore: 'PACKED' }).cancel, false)
  const now = new Date('2026-10-10T10:00:00Z')
  const delivered = { ...base, fulfilment: 'DELIVERED', deliveredAt: new Date('2026-10-05T10:00:00Z') }
  assert.equal(r.eligibility(delivered, settings, now).return, true)
  assert.equal(r.eligibility({ ...delivered, deliveredAt: new Date('2026-09-20T10:00:00Z') }, settings, now).return, false)
  assert.equal(r.eligibility({ ...delivered, physical: false }, settings, now).return, false)
})

test('a delivered code goes back only when the owner allows it, within its own window', () => {
  const now = new Date('2026-10-10T10:00:00Z')
  const codeOrder = { ...base, physical: false, codes: true, fulfilment: 'DELIVERED', deliveredAt: new Date('2026-10-08T10:00:00Z') }
  const off = r.eligibility(codeOrder, settings, now)
  assert.deepEqual([settings.codeReturnDays, off.return, off.goods], [0, false, { physical: false, codes: false }]); assert.match(off.reason, /کد تحویل‌شده/)
  const on = { ...settings, codeReturnDays: 3 }
  assert.deepEqual([r.eligibility(codeOrder, on, now).return, r.eligibility(codeOrder, on, now).goods], [true, { physical: false, codes: true }])
  assert.equal(r.eligibility({ ...codeOrder, deliveredAt: new Date('2026-10-06T10:00:00Z') }, on, now).return, false)
  // goods and codes in one order: each by its own window
  const both = r.eligibility({ ...codeOrder, physical: true, deliveredAt: new Date('2026-10-05T10:00:00Z') }, on, now)
  assert.deepEqual([both.return, both.goods], [true, { physical: true, codes: false }])
  assert.deepEqual(r.eligibility({ ...codeOrder, physical: true }, { ...on, windowDays: 1 }, now).goods, { physical: false, codes: true })
  assert.equal(r.eligibility({ ...codeOrder, codes: false }, on, now).return, false, 'a virtual order without pool codes is as before')
  assert.deepEqual(r.reasonsForGoods('RETURN', { physical: false, codes: true }).map((reason) => reason.key), ['code_invalid', 'code_used', 'other'])
  assert.ok(!r.reasonsForGoods('RETURN', { physical: true, codes: false }).some((reason) => reason.key.startsWith('code_')))
  assert.ok(r.reasonsForGoods('RETURN', { physical: true, codes: true }).length > r.reasonsForGoods('RETURN', { physical: true, codes: false }).length)
  assert.deepEqual([r.normalizeReturnSettings({ codeReturnDays: 7 }).codeReturnDays, r.normalizeReturnSettings({ codeReturnDays: 999 }).codeReturnDays, r.normalizeReturnSettings({ codeReturnDays: -1 }).codeReturnDays], [7, 0, 0])
})

test('no request when unpaid, already open, refunded or switched off', () => {
  for (const patch of [{ paid: false }, { open: true }, { fullyRefunded: true }, { fulfilment: 'CANCELLED' }]) {
    const e = r.eligibility({ ...base, ...patch }, settings)
    assert.equal(e.cancel || e.return, false, JSON.stringify(patch))
    assert.ok(e.reason)
  }
  assert.equal(r.eligibility(base, { ...settings, enabled: false }).cancel, false)
})

test('settings are clamped to safe values', () => {
  const s = r.normalizeReturnSettings({ windowDays: 9999, cancelBefore: 'DELIVERED', enabled: 'yes', policy: '<b>x</b>' })
  assert.equal(s.windowDays, 7)
  assert.equal(s.cancelBefore, 'SHIPPED')
  assert.equal(s.enabled, true)
  assert.doesNotMatch(s.policy, /[<>]/)
})

test('line choices stay within what is still returnable', () => {
  const lines = [
    { line: 0, quantity: 3, unitPriceMinor: 100n, totalMinor: 300n, returnedQuantity: 1 },
    { line: 1, quantity: 1, unitPriceMinor: 500n, totalMinor: 500n, returnedQuantity: 1 },
  ]
  assert.deepEqual(r.normalizeChoices([{ line: 0, quantity: 5 }, { line: 1, quantity: 1 }, { line: 9, quantity: 1 }, { line: 0, quantity: -1 }], lines), [{ line: 0, quantity: 2 }])
  assert.deepEqual(r.normalizeChoices('nope', lines), [])
})

test('return refunds the paid share of the lines, with the coupon spread over items', () => {
  const lines = [
    { line: 0, quantity: 2, unitPriceMinor: 1000n, totalMinor: 2000n, returnedQuantity: 0 },
    { line: 1, quantity: 1, unitPriceMinor: 2000n, totalMinor: 2000n, returnedQuantity: 0 },
  ]
  assert.equal(r.returnRefundMinor([{ line: 0, quantity: 1 }], lines, { itemsMinor: 4000n, discountMinor: 0n }), 1000n)
  // 400 coupon on 4000 of items: returning a 1000 item gives back 900.
  assert.equal(r.returnRefundMinor([{ line: 0, quantity: 1 }], lines, { itemsMinor: 4000n, discountMinor: 400n }), 900n)
  assert.equal(r.returnRefundMinor([], lines, { itemsMinor: 4000n, discountMinor: 0n }), 0n)
  assert.equal(r.clampRefund(5000n, 3000n), 3000n)
  assert.equal(r.clampRefund(-1n, 3000n), 0n)
  assert.equal(r.clampRefund(100n, 0n), 0n)
  assert.equal(r.returnNumber(42), 'RMA-000042')
  assert.ok(r.reasonsFor('CANCEL').every((reason) => !reason.photos))
})

test('refunds are claimed once and credited idempotently', () => {
  const source = read('src/modules/store/server/returns.ts')
  assert.match(source, /idempotencyKey: `return-refund:\$\{row\.id\}`/)
  assert.match(source, /updateMany\(\{ where: \{ id: row\.id, status: row\.status \}/, 'status compare-and-set before the wallet credit')
  assert.match(source, /count\(\{ where: \{ orderId, status: \{ in: OPEN \} \} \}\)/, 'one open request per order')
  assert.match(source, /sniffImage\(bytes\)/, 'photos are checked by their bytes')
})

test('official invoice rows: VAT carved out of inclusive prices, coupon split exactly', () => {
  const { rows, totals } = oi.buildInvoiceRows({
    lines: [
      { name: 'گوشی', quantity: 1, unitPriceMinor: 90000n, listPriceMinor: 100000n, totalMinor: 90000n },
      { name: 'قاب', quantity: 3, unitPriceMinor: 10000n, listPriceMinor: 10000n, totalMinor: 30000n },
    ],
    couponMinor: 12001n, shippingMinor: 5000n, vatBps: 1000, pricesIncludeVat: true,
  })
  assert.equal(rows.length, 3)
  assert.equal(rows[2].description, 'هزینهٔ ارسال')
  assert.equal(rows[0].grossMinor, 100000n)
  assert.equal(rows[0].discountMinor - 10000n + rows[1].discountMinor, 12001n, 'coupon shares add up')
  for (const row of rows) assert.equal(row.netMinor + row.vatMinor, row.totalMinor)
  assert.equal(totals.totalMinor, 90000n + 30000n + 5000n - 12001n, 'inclusive VAT keeps what the customer paid')
  assert.equal(totals.grossMinor - totals.discountMinor, totals.totalMinor)
})

test('official invoice rows: VAT added on top when prices exclude it', () => {
  const { totals } = oi.buildInvoiceRows({ lines: [{ name: 'x', quantity: 2, unitPriceMinor: 50000n, listPriceMinor: 50000n, totalMinor: 100000n }], couponMinor: 0n, shippingMinor: 0n, vatBps: 1000, pricesIncludeVat: false })
  assert.equal(totals.netMinor, 100000n)
  assert.equal(totals.vatMinor, 10000n)
  assert.equal(totals.totalMinor, 110000n)
})

test('amounts in Persian words and invoice units', () => {
  assert.equal(oi.persianWords(0), 'صفر')
  assert.equal(oi.persianWords(15), 'پانزده')
  assert.equal(oi.persianWords(121), 'یکصد و بیست و یک')
  assert.equal(oi.persianWords(1250000n), 'یک میلیون و دویست و پنجاه هزار')
  assert.equal(oi.persianWords(2005000300n), 'دو میلیارد و پنج میلیون و سیصد')
  assert.equal(oi.invoiceUnitAmount(1500n, 'IRT', 'rial'), 15000n)
  assert.equal(oi.invoiceUnitAmount(15000n, 'IRR', 'toman'), 1500n)
  assert.equal(oi.invoiceUnitAmount(1500n, 'USD', 'rial'), 1500n)
})

test('seller profile is sanitised', () => {
  const p = oi.normalizeInvoiceProfile({ nationalId: '۱۰۱۰-۲۲۳۳۴۴۵', vatBps: 99999, logo: 'javascript:alert(1)', stamp: '/uploads/stamp.png', sellerName: '<b>شرکت</b>' })
  assert.equal(p.nationalId, '10102233445')
  assert.equal(p.vatBps, 1000)
  assert.equal(p.logo, '')
  assert.equal(p.stamp, '/uploads/stamp.png')
  assert.doesNotMatch(p.sellerName, /[<>]/)
})
