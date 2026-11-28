const { test } = require('node:test'), assert = require('node:assert/strict')
const { normalizeSmsTemplate, parseSmsTemplate, parseSmsAmount, smsBankPresets } = require('./connected-source-loader.cjs')()('src/modules/billing/domain/pay-sms-template.ts')
const { smsSourceConfig, smsSourceStorage, forwardedSmsIdentity } = require('./connected-source-loader.cjs')()('src/modules/billing/domain/pay-sms-source.ts')
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
test('Bank Melli preset accepts the multiline transfer format and preserves the older spelling', () => {
  const preset = smsBankPresets.find(item => item.bankCode === 'bankmeli')
  const message = 'بانك ملي ايران\nانتقالي:9,966,381,380+\nحساب:59001\nمانده:10,100,512,660\n0828-18:40'
  const expected = {
    ok: true, notice: { amountRial: '9966381380', accountNumber: '59001', date: '0828', time: '18:40', kind: 'SMS_TRANSFER', direction: 'CREDIT' },
  }
  const legacy = { ...preset, creditTemplate: preset.creditTemplate.replace('انتقالی:', 'انتقال:') }
  for (const config of [preset, legacy]) {
    assert.deepEqual(parseSmsTemplate(config, message), expected)
    assert.deepEqual(parseSmsTemplate(config, message.replace('انتقالي:', 'انتقال:')), expected)
    assert.deepEqual(parseSmsAmount(config, message.replace('381,380+', '381,380-')), { ok: false, code: 'NO_UNIQUE_MATCH' })
    assert.deepEqual(parseSmsAmount(config, message.replace('381,380+', '381,380')), { ok: false, code: 'NO_UNIQUE_MATCH' })
  }
  const custom = { ...preset, creditTemplate: preset.creditTemplate.replace('انتقالی:', 'واریز:') }
  assert.deepEqual(parseSmsAmount(custom, message), { ok: false, code: 'NO_UNIQUE_MATCH' })
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
test('SMS source storage round trips legacy templates and versioned forwarder templates', () => {
  const template = normalizeSmsTemplate(config)
  const legacy = smsSourceStorage(template, 'EXTENDED_V1')
  assert.deepEqual(JSON.parse(legacy), template)
  assert.deepEqual(smsSourceConfig(JSON.parse(legacy)), { template, format: 'EXTENDED_V1' })
  const forwarder = smsSourceStorage(template, 'FORWARDER_V1')
  assert.deepEqual(JSON.parse(forwarder), { version: 2, format: 'FORWARDER_V1', template })
  assert.deepEqual(smsSourceConfig(JSON.parse(forwarder)), { template, format: 'FORWARDER_V1' })
  for (const stored of [legacy, forwarder]) assert.deepEqual(parseSmsAmount(smsSourceConfig(JSON.parse(stored)).template, 'CREDIT 1,234'), { ok: true, amountRial: '12340', direction: 'CREDIT' })
})
test('SMS source configuration rejects malformed and unknown wrappers', () => {
  const valid = { version: 2, format: 'FORWARDER_V1', template: config }
  for (const input of [null, [], { ...valid, version: 1 }, { ...valid, version: '2' }, { ...valid, format: 'EXTENDED_V1' }, { ...valid, format: 'UNKNOWN' }, { ...valid, extra: true }, { version: 2, template: config }, { version: 2, format: 'FORWARDER_V1' }, { ...valid, template: { ...config, extra: true } }, { ...config, extra: true }, { format: 'FORWARDER_V1', template: config }]) assert.throws(() => smsSourceConfig(input))
})
test('forwarded SMS identity normalizes text while isolating sources, banks and distinct messages', () => {
  const identity = forwardedSmsIdentity('source-a', 'bank-a', '  \u0628\u0627\u0646\u0643 \u0645\u0644\u064a\n\u06f1\u066c\u06f2\u06f3\u06f4  ')
  assert.equal(identity, forwardedSmsIdentity('source-a', 'bank-a', '\u0628\u0627\u0646\u06a9 \u0645\u0644\u06cc 1,234'))
  assert.notEqual(identity, forwardedSmsIdentity('source-b', 'bank-a', '\u0628\u0627\u0646\u06a9 \u0645\u0644\u06cc 1,234'))
  assert.notEqual(identity, forwardedSmsIdentity('source-a', 'bank-b', '\u0628\u0627\u0646\u06a9 \u0645\u0644\u06cc 1,234'))
  assert.notEqual(identity, forwardedSmsIdentity('source-a', 'bank-a', '\u0628\u0627\u0646\u06a9 \u0645\u0644\u06cc 1,235'))
  const fromEnvelope = ({ sourceId, bank, message }) => forwardedSmsIdentity(sourceId, bank, message)
  const envelope = { sourceId: 'source-a', bank: 'bank-a', message: 'CREDIT 123', token: 'first', time: 'old', version: 1 }
  assert.equal(fromEnvelope(envelope), fromEnvelope({ ...envelope, token: 'second', time: 'new', version: 2 }))
  assert.deepEqual(JSON.parse(identity).slice(0, 3), ['SMS_FORWARDER_V1', 'source-a', 'bank-a'])
})
