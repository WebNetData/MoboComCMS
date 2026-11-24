const { test } = require('node:test')
const assert = require('node:assert/strict')
const load = require('./connected-source-loader.cjs')()
const { parseRoutingRules, matchRoutingRule, parseRoutingSnapshot } = load('src/modules/billing/domain/pay-routing.ts')
const rule = (changes = {}) => ({ id: 'first', name: 'First', enabled: true, minAmountToman: '', maxAmountToman: '', types: [], minPayments: 0, minMembershipDays: 0, gateways: ['db:1'], ...changes })
const claims = (changes = {}) => ({ amountRial: '1000', type: 'purchase', ...changes })

test('USDT acquisition uses historical two-decimal denomination and explicit remainder', () => {
  const { acquisitionAmounts } = load('src/modules/billing/domain/pay-assets.ts')
  assert.deepEqual(acquisitionAmounts(12345678n, '1000000'), { creditMinor: 1234n, creditRoundingRial: 5678n })
  assert.throws(() => acquisitionAmounts(1n, '1000000'))
})

test('asset settlement caps exact fees, freezes conversion inputs and reconciles bank rounding', () => {
  const { assetSettlementAmounts } = load('src/modules/billing/domain/pay-assets.ts')
  const { defaults, normalizePaySettings } = load('src/modules/billing/domain/pay-policy.ts')
  const d = defaults(), bank = { ...d.rails[0], fees: { currency: 'USDT', bps: 0, flat: '0.000001', cap: '0' } }
  const q = assetSettlementAmounts(99n, 'USDT', bank, '1000001')
  assert.equal(q.amountMinor, 990000n); assert.equal(q.feeMinor, 2n); assert.equal(q.payoutAtoms, 989998n)
  const fromRial = assetSettlementAmounts(10000000n, 'IRR', bank, '1000001')
  assert.equal(JSON.parse(fromRial.feePolicySnapshot).usdtRateRial, '1000001')
  const old = normalizePaySettings({ ...d, rails: d.rails.slice(0, 3) })
  assert.equal(old.rails.length, 5); assert.equal(old.rails.find(r => r.id === 'USDT_BSC').enabled, false)
})

test('validates rule bounds, refs, fields and uniqueness', () => {
  assert.equal(parseRoutingRules([rule({ maxAmountToman: '900000000000000', gateways: ['env:CARD_TRANSFER'] })]).length, 1)
  for (const value of [
    [rule({ maxAmountToman: '900000000000001' })], [rule({ minAmountToman: '2', maxAmountToman: '1' })],
    [rule({ minAmountToman: '1.5' })], [rule({ gateways: ['https://example.com'] })],
    [rule({ gateways: ['db:0'] })], [rule({ types: ['purchase', 'purchase'] })],
    [rule({ extra: true })], [rule(), rule()], Array.from({ length: 13 }, (_, i) => rule({ id: String(i) }))
  ]) assert.throws(() => parseRoutingRules(value))
})

test('matches the first enabled rule with exact inclusive rial boundaries', () => {
  const rules = parseRoutingRules([rule({ enabled: false }), rule({ id: 'bounded', minAmountToman: '100', maxAmountToman: '100' }), rule({ id: 'fallback' })])
  assert.equal(matchRoutingRule(rules, claims()).id, 'bounded')
  assert.equal(matchRoutingRule(rules, claims({ amountRial: '999' })).id, 'fallback')
  assert.equal(matchRoutingRule(rules, claims({ amountRial: '1001' })).id, 'fallback')
  assert.throws(() => matchRoutingRule(rules, claims({ amountRial: '9000000000000001' })))
})

test('missing history and unknown membership cannot meet positive thresholds', () => {
  const rules = parseRoutingRules([rule({ minPayments: 1, minMembershipDays: 1, types: ['renewal'] })])
  assert.equal(matchRoutingRule(rules, claims({ type: 'renewal' })), null)
  assert.equal(matchRoutingRule(rules, claims({ type: 'renewal', paymentCount: 1, membershipDays: -1 })), null)
  assert.equal(matchRoutingRule(rules, claims({ type: 'renewal', paymentCount: 1, membershipDays: 1 })).id, 'first')
  assert.equal(matchRoutingRule(rules, claims({ paymentCount: 1, membershipDays: 1 })), null)
  assert.equal(matchRoutingRule(parseRoutingRules([rule()]), claims({ membershipDays: -1 })).id, 'first')
})

test('snapshots accept only bounded strict state and preserve legacy empty state', () => {
  const snapshot = { version: 1, ruleId: 'first', ruleName: 'First', gateways: [{ ref: 'db:1', name: 'Gateway' }] }
  assert.equal(parseRoutingSnapshot(''), null)
  assert.deepEqual(parseRoutingSnapshot(JSON.stringify(snapshot)), snapshot)
  for (const bad of ['{', '{}', ' '.repeat(5000), JSON.stringify({ ...snapshot, extra: 1 }), JSON.stringify({ ...snapshot, gateways: [] }), JSON.stringify({ ...snapshot, gateways: [{ ref: 'env:BAD/path', name: 'Bad' }] }), JSON.stringify({ ...snapshot, gateways: [snapshot.gateways[0], snapshot.gateways[0]] })]) assert.throws(() => parseRoutingSnapshot(bad))
})
