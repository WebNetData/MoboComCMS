const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const cache = {}
function load(relative) {
  if (cache[relative]) return cache[relative]
  const source = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '..', relative), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const mod = { exports: {} }
  const req = (name) => name.startsWith('@/') ? load(`src/${name.slice(2)}.ts`) : require(name)
  new Function('require', 'module', 'exports', source)(req, mod, mod.exports)
  return (cache[relative] = mod.exports)
}
const card = load('src/modules/billing/domain/card-transfer.ts')
const sms = load('src/modules/sms/domain/sms.ts')
const ippanel = load('src/modules/sms/server/ippanel.ts')

function luhnCard(prefix) {
  for (let d = 0; d < 10; d++) {
    const c = prefix.padEnd(15, '1') + d
    let s = 0
    for (let i = 0; i < 16; i++) { let x = +c[15 - i]; if (i % 2) { x *= 2; if (x > 9) x -= 9 } s += x }
    if (s % 10 === 0) return c
  }
}

test('Iranian cards and Sheba numbers are checksummed and mapped to banks', () => {
  const valid = luhnCard('610433')
  assert.equal(card.validCard(valid), true)
  assert.equal(card.validCard(valid.slice(0, 15) + ((+valid[15] + 1) % 10)), false)
  assert.equal(card.cleanCard('۶۱۰۴-۳۳' + valid.slice(6)), valid)
  assert.equal(card.bankFromCard(valid), 'ملت')
  assert.equal(card.formatCard(valid), valid.replace(/(\d{4})(?=\d)/g, '$1 '))
  assert.equal(card.validSheba('IR062960000000100324200001'), true)
  assert.equal(card.validSheba('ir06 2960 0000 0010 0324 2000 01'), true)
  assert.equal(card.validSheba('IR062960000000100324200002'), false)
  assert.equal(card.bankFromSheba('IR820170000000123456789012'), 'ملی')
})

test('bank accounts need a checksummed card or Sheba and a holder name', () => {
  assert.throws(() => card.normalizeBankAccount({ holderName: 'علی رضایی' }), /حداقل یکی/)
  assert.throws(() => card.normalizeBankAccount({ cardNumber: '6037991234567890', holderName: 'علی رضایی' }), /کارت معتبر/)
  const account = card.normalizeBankAccount({ cardNumber: luhnCard('603799'), holderName: '  علی <b>رضایی</b> ' })
  assert.equal(account.bankName, 'ملی')
  assert.doesNotMatch(account.holderName, /[<>]/)
})

test('receipts keep only the last four card digits and reject impossible dates', () => {
  const now = new Date('2026-09-27T10:00:00Z')
  const receipt = card.normalizeReceipt({ method: 'CARD', payerName: 'مریم احمدی', payerBank: 'ملت', payerCard: luhnCard('610433'), trackingCode: '۹۸۷۶۵۴', paidAt: '2026-09-27T09:00:00Z' }, now)
  assert.equal(receipt.payerCard.length, 4)
  assert.equal(receipt.trackingCode, '987654')
  assert.throws(() => card.normalizeReceipt({ payerName: 'مریم احمدی', payerBank: 'ملت', payerCard: '1234', trackingCode: '9876', paidAt: '2026-09-29T09:00:00Z' }, now), /تاریخ/)
  assert.throws(() => card.normalizeReceipt({ payerName: 'مریم احمدی', payerBank: 'ملت', payerCard: '12', trackingCode: '9876' }, now), /چهار رقم/)
  assert.deepEqual(card.transferAmounts(12500000n, 'IRR'), { rial: 12500000n, toman: 1250000n })
  assert.deepEqual(card.transferAmounts(1250000n, 'IRT'), { rial: 12500000n, toman: 1250000n })
  assert.equal(card.transferAmounts(10n, 'USD'), null)
})

test('mobiles normalize to E.164 and settings keep the stored key', () => {
  for (const input of ['09121234567', '9121234567', '+989121234567', '00989121234567', '۰۹۱۲ ۱۲۳ ۴۵۶۷']) assert.equal(sms.normalizeMobile(input), '+989121234567')
  assert.equal(sms.normalizeMobile('0212345678'), '')
  assert.equal(sms.displayMobile('+989121234567'), '0912 123 4567')
  assert.equal(sms.maskMobile('+989121234567'), '0912***4567')
  const previous = { ...sms.DEFAULT_SMS, apiKey: 'encv1:stored' }
  const next = sms.normalizeSmsConfig({ enabled: true, apiKey: '••••abcd', fromNumber: '3000505', adminPhones: '09121234567, bad, 09121234567', otpPattern: 'ab<script>' }, previous)
  assert.equal(next.apiKey, 'encv1:stored')
  assert.equal(next.fromNumber, '+983000505')
  assert.deepEqual(next.adminPhones, ['+989121234567'])
  assert.equal(next.otpPattern, 'abscript')
  assert.equal(sms.renderTemplate('{name} عزیز {unknown}\n\n\n\n{brand}', { name: 'علی', brand: 'موبوکام' }), 'علی عزیز \n\nموبوکام')
  assert.equal(sms.otpCode(() => 0), '100000')
  assert.equal(sms.otpCode(() => 899999), '999999')
  assert.equal(sms.validOtpFormat('۱۲۳۴۵۶'), true)
  assert.equal(sms.isPhonePlaceholderEmail(sms.phoneEmail('+989121234567')), true)
})

test('IPPanel requests follow the Edge API (webservice, pattern, credit)', async () => {
  const calls = []
  const original = global.fetch
  global.fetch = async (url, init) => {
    calls.push({ url, init })
    if (String(url).endsWith('/credit/mine')) return new Response(JSON.stringify({ data: { credit: 1234.5 }, meta: { status: true } }), { status: 200 })
    if (JSON.parse(init.body).code === 'bad') return new Response(JSON.stringify({ data: null, meta: { status: false, message: 'الگو یافت نشد' } }), { status: 422 })
    return new Response(JSON.stringify({ data: { message_outbox_ids: [1123544244] }, meta: { status: true, message: 'انجام شد' } }), { status: 200 })
  }
  try {
    const text = await ippanel.sendText('KEY', '+983000505', ['+989121234567'], 'سلام')
    assert.deepEqual(text, { ok: true, id: '1123544244', error: '' })
    assert.equal(calls[0].url, 'https://edge.ippanel.com/v1/api/send')
    assert.equal(calls[0].init.headers.Authorization, 'KEY')
    assert.deepEqual(JSON.parse(calls[0].init.body), { sending_type: 'webservice', from_number: '+983000505', message: 'سلام', params: { recipients: ['+989121234567'] } })
    const pattern = await ippanel.sendPattern('KEY', '+983000505', '+989121234567', 'otp-code', { code: '123456' })
    assert.equal(pattern.ok, true)
    assert.deepEqual(JSON.parse(calls[1].init.body), { sending_type: 'pattern', from_number: '+983000505', code: 'otp-code', recipients: ['+989121234567'], params: { code: '123456' } })
    const failed = await ippanel.sendPattern('KEY', '+983000505', '+989121234567', 'bad', {})
    assert.deepEqual(failed, { ok: false, id: '', error: 'الگو یافت نشد' })
    const balance = await ippanel.credit('KEY')
    assert.equal(calls[3].url, 'https://edge.ippanel.com/v1/api/payment/credit/mine')
    assert.equal(balance.credit, 1234.5)
  } finally {
    global.fetch = original
  }
})
