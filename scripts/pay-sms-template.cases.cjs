const { test } = require('node:test'), assert = require('node:assert/strict')
const { normalizeSmsTemplate, parseSmsTemplate, parseSmsAmount, smsBankPresets } = require('./connected-source-loader.cjs')()('src/modules/billing/domain/pay-sms-template.ts')
const { parseBaleAmount } = require('./connected-source-loader.cjs')()('src/modules/billing/domain/pay-bale-amount.ts')
const { melli } = require('./pay-bale.fixture.cjs')
const config = { bankCode: 'fixture_bank', sender: 'fixture', creditTemplate: 'CREDIT {amount}', debitTemplate: 'DEBIT {amount}', unit: 'IRT', calendar: 'GREGORIAN' }
test('synthetic bank shapes normalize digits, Arabic letters and whitespace without returning balance', () => {
  const samples = [
    ['bankmellat', 'حساب۰۰۰۱۲۳۴۵۶ واریز۱,۲۳۴ مانده۹۹۹ ۰۵/۰۹/۰۳-۱۲:۳۴'],
    ['bankmehriran', '۰۰۰۱۲۳۴۵۶   ۱,۲۳۴+ ۱۴۰۵/۹/۳-۱۲:۳۴ مانده:۹۹۹'],
    ['bankmeli', 'بانك ملي ايران\nانتقال:۱,۲۳۴+ حساب:۱۲۳۴۵ مانده:۹۹۹ ۰۷۱۹-۱۲:۳۴'],
  ]
  for (const [bank, text] of samples) {
    const preset = smsBankPresets.find(item => item.bankCode === bank), result = parseSmsTemplate(preset, text)
    assert.equal(result.ok, true); assert.equal(result.notice.amountRial, '1234'); assert.equal(result.notice.direction, 'CREDIT')
    assert.equal(JSON.stringify(result).includes('999'), false)
    assert.deepEqual(parseSmsAmount(preset, text), { ok: true, amountRial: '1234', direction: 'CREDIT' })
  }
})
test('full match and explicit direction fail closed on unknown withdrawals', () => {
  assert.deepEqual(parseSmsAmount(config, 'CREDIT 1,234'), { ok: true, amountRial: '12340', direction: 'CREDIT' })
  assert.equal(parseSmsAmount(config, 'DEBIT 10').direction, 'DEBIT')
  assert.equal(parseSmsAmount(config, 'prefix CREDIT 10').ok, false)
  assert.equal(parseSmsAmount({ ...config, debitTemplate: '' }, 'DEBIT 10').ok, false)
})
test('configuration restricts tokens, markers, and bounded ignored fields', () => {
  for (const patch of [{ bankCode: 'BAD' }, { sender: 'x\n' }, { creditTemplate: 'CREDIT {amount}{amount}' }, { creditTemplate: 'CREDIT {amount}{other}' }, { creditTemplate: '{amount}' }, { debitTemplate: config.creditTemplate }, { creditTemplate: 'CREDIT {amount}{ignore}{ignore}{ignore}{ignore}' }, { unit: 'USD' }]) assert.throws(() => normalizeSmsTemplate({ ...config, ...patch }))
})
test('adjacent numeric fields cannot shift digits between account and amount', () => {
  for (const creditTemplate of ['CREDIT {account}{amount}', 'CREDIT {account}123{amount}']) assert.throws(() => normalizeSmsTemplate({ ...config, creditTemplate }))
  assert.doesNotThrow(() => normalizeSmsTemplate({ ...config, creditTemplate: 'CREDIT {account} {amount}' }))
})
test('amount grouping and overflow fail without including message text in errors', () => {
  for (const amount of ['0', '01', '1,23', '1,234٬567', '922337203685477581']) {
    const result = parseSmsAmount(config, `CREDIT ${amount}`); assert.equal(result.ok, false); assert.equal(JSON.stringify(result).includes(amount), false)
  }
})
test('Bale amount parser recognizes transfers without using account, balance, or dates', () => {
  assert.deepEqual(parseBaleAmount(melli({ account: '1111111111111', amount: '1234' })), { ok: true, amountRial: '1234', direction: 'CREDIT', kind: 'TRANSFER' })
  assert.equal(parseBaleAmount(melli({ kind: 'سود_پرداخت_شده' })).kind, 'INTEREST')
  assert.equal(parseBaleAmount(melli({ sign: '-' })).kind, 'OTHER')
  assert.equal(parseBaleAmount(melli({ kind: 'نام_ناشناخته' })).kind, 'OTHER')
})
