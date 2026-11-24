const { test } = require('node:test'), assert = require('node:assert/strict')
const equivalent = require('./connected-source-loader.cjs')()('src/modules/billing/domain/pay-usdt-equivalent.ts').usdtEquivalent
const now = new Date('2026-11-24T10:00:00Z'), rate = { rate: 100000, fetchedAt: now, source: 'fixture', locked: false }
test('USDT display uses approved Toman-per-unit with exact Rial conversion and four decimal rounding', () => {
  const result = equivalent(12345670n, rate, now)
  assert.equal(result.amount, '12.3457'); assert.equal(result.network, 'BSC'); assert.equal(result.standard, 'BEP20'); assert.equal(result.displayOnly, true)
  assert.equal(equivalent(2000000n, { ...rate, rate: 100000.5 }, now).amount, '2.0000')
  assert.equal(equivalent(10n, rate, now).lessThan, true)
  assert.equal(equivalent(9223372036854775807n, { ...rate, rate: 1 }, now).amount, '922337203685477580.7000')
})
test('unavailable, stale, invalid and future rates never invent a peg or payable crypto amount', () => {
  for (const value of [null, { ...rate, rate: 0 }, { ...rate, rate: NaN }, { ...rate, rate: Infinity }, { ...rate, fetchedAt: null }, { ...rate, fetchedAt: new Date('invalid') }, { ...rate, fetchedAt: new Date(now.getTime()+120000) }]) assert.equal(equivalent(1000000n, value, now).status, 'UNAVAILABLE')
  const stale = { ...rate, fetchedAt: new Date(now.getTime()-86400001) }
  assert.equal(equivalent(1000000n, stale, now).status, 'STALE'); assert.equal(equivalent(1000000n, stale, now).amount, null)
  assert.equal(equivalent(1000000n, { ...stale, source: 'MANUAL' }, now).status, 'AVAILABLE')
  assert.equal(equivalent(0n, rate, now).status, 'UNAVAILABLE')
})
