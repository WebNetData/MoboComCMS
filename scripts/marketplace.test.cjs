const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

function load(relative) {
  const file = path.resolve(__dirname, '..', `${relative}.ts`)
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', source)(require, mod, mod.exports)
  return mod.exports
}
const m = load('src/modules/marketplace/domain/marketplace')
const read = (file) => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8')

test('settings are clamped and category rates keep only numeric ids', () => {
  const s = m.normalizeMarketplaceSettings({ defaultCommission: 150, holdDays: -3, minPayoutToman: 'x', categoryCommission: { 3: 12.34, abc: 5, 7: '' }, signupOpen: false })
  assert.equal(s.defaultCommission, 90)
  assert.equal(s.holdDays, 0)
  assert.equal(s.minPayoutToman, 0)
  assert.deepEqual(s.categoryCommission, { 3: 12.3 })
  assert.equal(s.signupOpen, false)
  assert.equal(m.normalizeMarketplaceSettings(null).defaultCommission, 10)
})

test('commission: seller rate, then the nearest category, then the default', () => {
  const s = m.normalizeMarketplaceSettings({ defaultCommission: 10, categoryCommission: { 2: 6, 5: 15 } })
  assert.equal(m.commissionPercent(s, 4, [9, 5, 2]), 4)
  assert.equal(m.commissionPercent(s, null, [9, 5, 2]), 15)
  assert.equal(m.commissionPercent(s, null, [9, 2]), 6)
  assert.equal(m.commissionPercent(s, null, [9]), 10)
  assert.equal(m.commissionOf(1_000_000n, 10), 100_000n)
  assert.equal(m.commissionOf(999n, 12.5), 124n)
  assert.equal(m.commissionOf(100n, 0), 0n)
  assert.equal(m.commissionOf(0n, 10), 0n)
})

test('IBAN, national code and company id validation', () => {
  assert.equal(m.normalizeIban('IR06 2960 0000 0010 0324 2000 01'), 'IR062960000000100324200001')
  assert.equal(m.normalizeIban('062960000000100324200001'), 'IR062960000000100324200001')
  assert.equal(m.normalizeIban('IR062960000000100324200002'), '')
  assert.equal(m.normalizeIban('IR12'), '')
  assert.equal(m.validNationalCode('0499370899'), true)
  assert.equal(m.validNationalCode('۰۴۹۹۳۷۰۸۹۹'), true)
  assert.equal(m.validNationalCode('0499370898'), false)
  assert.equal(m.validNationalCode('1111111111'), false)
  assert.equal(m.validCompanyId('10101010101'), false)
  assert.equal(m.validCompanyId('123'), false)
})

test('seller application form validation', () => {
  const ok = m.validateSellerProfile({ shopName: ' دیجی لند ', slug: 'digi-land', kind: 'PERSON', legalName: 'علی رضایی', nationalId: '0499370899', phone: '09121234567', iban: 'IR062960000000100324200001', about: '<b>سلام</b>' })
  assert.equal(ok.shopName, 'دیجی لند')
  assert.equal(ok.about, 'سلام')
  assert.equal(ok.iban, 'IR062960000000100324200001')
  assert.throws(() => m.validateSellerProfile({ ...ok, slug: 'Bad Slug' }), /نشانی/)
  assert.throws(() => m.validateSellerProfile({ ...ok, nationalId: '123' }), /کد ملی/)
  assert.throws(() => m.validateSellerProfile({ ...ok, iban: 'IR00' }), /شبا/)
  assert.throws(() => m.validateSellerProfile({ ...ok, phone: '123' }), /تماس/)
  assert.doesNotThrow(() => m.validateSellerProfile({ shopName: 'فروشگاه', slug: 'shop-1' }, { requireLegal: false }))
  assert.equal(m.validateSellerProfile({ ...ok, logo: 'javascript:alert(1)' }).logo, '')
})

test('ledger: held sales are not withdrawable; payouts and refunds reduce the balance', () => {
  const now = new Date('2026-09-29T12:00:00Z')
  const past = new Date('2026-09-01T00:00:00Z'), future = new Date('2026-10-05T00:00:00Z')
  const rows = [
    { kind: 'SALE', amountMinor: 1_000_000n, availableAt: past }, { kind: 'COMMISSION', amountMinor: -100_000n, availableAt: past },
    { kind: 'SALE', amountMinor: 500_000n, availableAt: future }, { kind: 'COMMISSION', amountMinor: -50_000n, availableAt: future },
    { kind: 'PAYOUT', amountMinor: -300_000n, availableAt: past }, { kind: 'REFUND', amountMinor: -100_000n, availableAt: now },
  ]
  const b = m.balanceOf(rows, now)
  assert.equal(b.balance, 950_000n)
  assert.equal(b.pending, 450_000n)
  assert.equal(b.available, 500_000n)
  assert.throws(() => m.checkPayout(100n, 500n, 50n, ''), /شبا/)
  assert.throws(() => m.checkPayout(10n, 500n, 50n, 'IR'), /حداقل/)
  assert.throws(() => m.checkPayout(600n, 500n, 50n, 'IR'), /بیشتر/)
  assert.doesNotThrow(() => m.checkPayout(500n, 500n, 50n, 'IR'))
  assert.equal(m.refundShare(300n, 1000n, 500n), 150n)
  assert.equal(m.refundShare(300n, 300n, 900n), 300n)
  assert.equal(m.refundShare(300n, 0n, 100n), 0n)
})

test('order line workflow and ratings', () => {
  assert.equal(m.canMoveLine('', 'ACCEPTED'), true)
  assert.equal(m.canMoveLine('', 'READY'), true)
  assert.equal(m.canMoveLine('ACCEPTED', 'SHIPPED'), false)
  assert.equal(m.canMoveLine('READY', 'SHIPPED'), true)
  assert.equal(m.canMoveLine('SHIPPED', 'READY'), false)
  const review = m.validateSellerReview({ rating: '5', criteria: { onTime: 4, packaging: 9, other: 3 }, body: '<i>عالی</i>' })
  assert.deepEqual(review, { rating: 5, criteria: { onTime: 4 }, body: 'عالی' })
  assert.throws(() => m.validateSellerReview({ rating: 0 }), /امتیاز/)
  assert.deepEqual(m.ratingSummary(23, 5), { average: 4.6, count: 5 })
  assert.equal(m.performanceLabel(5, 1).tone, 'new')
  assert.equal(m.performanceLabel(4.6, 5).tone, 'top')
  assert.equal(m.performanceLabel(3.8, 5).tone, 'good')
  assert.equal(m.performanceLabel(2, 5).tone, 'low')
})

test('marketplace hooks: checkout lines, paid orders, refunds and seller product rules', () => {
  assert.match(read('src/modules/checkout/server/checkout.ts'), /sellerId: product\.sellerId \?\? null/)
  assert.match(read('src/modules/fulfillment/server/jobs.ts'), /recordMarketplaceSale\(job\.orderId!\)/)
  assert.match(read('src/modules/store/server/returns.ts'), /reverseSellerShare\(row\.orderId, amount/)
  assert.match(read('src/modules/billing/server/http/admin/invoices/route.ts'), /reverseSellerShare\(invoice\.orderId!/)
  const server = read('src/modules/marketplace/server/marketplace.ts')
  // Sellers never set active/featured/VIP fields directly, and unapproved products stay offline.
  const fields = server.slice(server.indexOf('const SELLER_FIELDS'), server.indexOf('] as const', server.indexOf('const SELLER_FIELDS')))
  for (const forbidden of ["'active'", "'featured'", "'access'", "'memberPrice'", "'sellerId'"]) assert.ok(!fields.includes(forbidden), forbidden)
  assert.match(server, /product\.approval !== 'APPROVED'\) throw/)
  assert.match(server, /dedupeKey: `sale:line:\$\{line\.id\}`/)
})
