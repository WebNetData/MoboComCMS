const { test } = require('node:test'), assert = require('node:assert/strict')
const { normalizeBalePolicy, invoicePrincipalRial, nextBaleMinute, baleEffectiveStart } = require('./connected-source-loader.cjs')()('src/modules/billing/domain/pay-bale-collection.ts')
const { autoTransferConfig, transferDisplay } = require('./connected-source-loader.cjs')()('src/modules/billing/domain/auto-transfer.ts')

test('destination visibility defaults to card only, accepts explicit toggles and rejects unsafe or empty destinations', () => {
  assert.deepEqual(autoTransferConfig('{}').autoDisplay, { cardNumber: true, bankName: false, holderName: false, accountNumber: false, iban: false })
  assert.equal(transferDisplay({ bankName: true }).bankName, true)
  assert.deepEqual(autoTransferConfig({ autoSources: ['BALE','SMS'] }).autoSources, ['SMS'])
  assert.deepEqual(transferDisplay({ cardNumber: false, iban: true }), { cardNumber: false, bankName: false, holderName: false, accountNumber: false, iban: true })
  for (const value of [{ cardNumber: false }, { cardNumber: 'true' }, { secret: true }, { toString: true }, []]) assert.throws(() => transferDisplay(value))
})
test('collection policy accepts aligned bounds and rejects unsafe allocation windows', () => {
  assert.deepEqual(normalizeBalePolicy({ enabled: true, minAdjustmentRial: '10', maxAdjustmentRial: '10', minutes: 5 }), { enabled: true, minAdjustmentRial: '10', maxAdjustmentRial: '10', minutes: 5 })
  for (const input of [{ minAdjustmentRial: '11' }, { maxAdjustmentRial: '100000' }, { minAdjustmentRial: '20', maxAdjustmentRial: '10' }, { minutes: 4 }, { enabled: 'true' }]) assert.throws(() => normalizeBalePolicy(input))
})
test('principal conversion remains exact and excludes other currencies', () => {
  assert.equal(invoicePrincipalRial(123n, 'IRR'), 123n)
  assert.equal(invoicePrincipalRial(123n, 'IRT'), 1230n)
  assert.throws(() => invoicePrincipalRial(0n, 'IRT'))
  assert.throws(() => invoicePrincipalRial(1n, 'USD'))
})
test('effective start is the later of reservation and acceptance', () => {
  const validFrom = new Date('2026-11-24T10:02:00.000Z')
  assert.equal(nextBaleMinute(new Date('2026-11-24T10:02:00.000Z')).toISOString(), '2026-11-24T10:03:00.000Z')
  assert.equal(baleEffectiveStart({ validFrom, acceptedAt: new Date('2026-11-24T10:03:59.999Z') }).toISOString(), '2026-11-24T10:03:59.999Z')
  assert.equal(baleEffectiveStart({ validFrom, acceptedAt: null }).toISOString(), validFrom.toISOString())
})
