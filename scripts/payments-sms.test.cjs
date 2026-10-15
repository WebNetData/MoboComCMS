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
  // The owner's name is what a receipt must carry; the rest is optional and checked only when written.
  const plain = card.normalizeReceipt({ payerName: 'مریم احمدی' }, now)
  assert.deepEqual([plain.method, plain.payerBank, plain.payerCard, plain.trackingCode, plain.paidAt.getTime()], ['CARD', '', '', '', now.getTime()])
  assert.throws(() => card.normalizeReceipt({ payerName: ' م  ' }, now), /صاحب کارت/)
  assert.throws(() => card.normalizeReceipt({ payerName: 'مریم احمدی', trackingCode: '12' }, now), /پیگیری/)
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

// ------------------------------------------------------------------ the invoice as a PDF document

// Modules with a default import (pdfkit, bidi-js, qrcode, sharp) as the bundler hands them over.
function loadWithDefaults(relative) {
  const source = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '..', relative), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const mod = { exports: {} }
  const req = (name) => {
    if (name.startsWith('@/')) return loadWithDefaults(`src/${name.slice(2)}.ts`)
    const found = require(name)
    return found && found.__esModule ? found : Object.assign(Object.create(null), typeof found === 'object' ? found : {}, { default: found, __esModule: true })
  }
  new Function('require', 'module', 'exports', 'process', source)(req, mod, mod.exports, process)
  return mod.exports
}

test('mixed Persian and Latin text is ordered for a surface that draws from left to right', () => {
  const { visualPieces } = loadWithDefaults('src/shared/text/visual-order.ts')
  // A Persian sentence: last word first, each word left whole for the font engine.
  assert.deepEqual(visualPieces('صورتحساب فروش کالا').filter((piece) => piece.trim()), ['کالا', 'فروش', 'صورتحساب'])
  // A Latin code inside Persian text keeps its own order and sits between its neighbours.
  const mixed = visualPieces('فاکتور MB-2026-000241 صادر شد').filter((piece) => piece.trim())
  assert.deepEqual(mixed, ['شد', 'صادر', 'MB-2026-000241', 'فاکتور'])
  // Brackets around Persian words are mirrored, so they still open towards the words.
  assert.deepEqual(visualPieces('(مشکی)'), [')مشکی('])
  // With turnDigits a Persian number is one piece handed over turned; without it the text is untouched.
  assert.ok(visualPieces('مبلغ ۲٬۵۰۰ ریال', { turnDigits: true }).includes('۰۰۵٬۲'))
  assert.ok(visualPieces('مبلغ ۲٬۵۰۰ ریال').includes('۲٬۵۰۰'))
  assert.deepEqual(visualPieces(''), [])
  assert.deepEqual(visualPieces('support@example.com'), ['support@example.com'])
})

test('the invoice PDF is a real document: Persian font embedded, selectable text, pages added as rows grow', async () => {
  const { invoicePdf } = loadWithDefaults('src/modules/billing/server/invoice-pdf.ts')
  const seller = { sellerName: 'موبوکام', nationalId: '14001234567', economicCode: '411111111111', registrationNo: '12345', province: 'تهران', city: 'تهران', address: 'خیابان ولیعصر، پلاک ۱۲، واحد ۳', postalCode: '1234567890', phone: '02112345678', logo: '', stamp: '', vatBps: 1000, pricesIncludeVat: true, unit: 'toman', footerNote: 'کالای فروخته‌شده تا هفت روز قابل بازگشت است.' }
  const buyer = { name: 'سارا محمدی', nationalId: '0012345678', phone: '09121234567', province: 'فارس', city: 'شیراز', address: 'بلوار چمران، کوچهٔ ۴', postalCode: '7187654321', email: 'sara@example.com' }
  const row = (index) => ({ index, code: `SKU-${index}`, description: index % 3 ? `روتر وای‌فای 6 AX5400 موبوکام (مشکی) ردیف ${index}` : `شرح بلند برای آزمون شکستن خط در ستون شرح کالا یا خدمات که باید در چند خط نوشته شود و از ستون بیرون نزند، ردیف ${index}`, quantity: index, unit: '1250000', gross: '1250000', discount: index % 2 ? '50000' : '0', net: '1200000', vat: '109091', total: '1200000' })
  const doc = (rows, status) => ({ number: 'MB-2026-000777', status, issuedAt: new Date('2026-10-13T08:00:00Z'), paidAt: status === 'PAID' ? new Date('2026-10-13T09:00:00Z') : null, orderId: 4821, payment: 'کارت به کارت / انتقال بانکی', walletApplied: status === 'PAID' ? '200000' : '', seller, buyer, unitLabel: 'تومان', vatPercent: 10, pricesIncludeVat: true, rows: Array.from({ length: rows }, (_, i) => row(i + 1)), totals: { gross: '75000000', discount: '1500000', net: '73500000', vat: '6681818', total: '73500000' }, totalWords: 'هفتاد و سه میلیون و پانصد هزار تومان' })
  const pages = (bytes) => (bytes.toString('latin1').match(/\/Type \/Page\b/g) || []).length
  const one = await invoicePdf({ doc: doc(3, 'PAID'), link: 'https://example.com/invoice/MB-2026-000777', siteUrl: 'https://example.com', supportEmail: 'support@example.com' })
  const many = await invoicePdf({ doc: doc(60, 'UNPAID'), link: 'https://example.com/invoice/MB-2026-000777', siteUrl: 'https://example.com', supportEmail: 'support@example.com' })
  if (process.env.INVOICE_PDF_OUT) { fs.writeFileSync(path.join(process.env.INVOICE_PDF_OUT, 'one.pdf'), one); fs.writeFileSync(path.join(process.env.INVOICE_PDF_OUT, 'many.pdf'), many) }
  assert.equal(one.subarray(0, 5).toString(), '%PDF-')
  assert.equal(pages(one), 1)
  const text = one.toString('latin1')
  assert.match(text, /\/FontFile2/, 'the font is embedded')
  assert.match(text, /\/ToUnicode/, 'the text can be selected and searched')
  assert.doesNotMatch(text, /\/Subtype \/Image/, 'nothing on the page is a picture of the page')
  assert.ok(pages(many) >= 3, `sixty rows take several pages (got ${pages(many)})`)
  // The route answers its owner or staff only, never a draft, and never from a cache.
  const route = fs.readFileSync(path.resolve(__dirname, '..', 'src/modules/billing/server/http/invoice-pdf.ts'), 'utf8')
  assert.match(route, /officialInvoice\(number, \{ id: user\.id, admin: user\.role === 'ADMIN' \}\)/)
  assert.match(route, /doc\.status === 'DRAFT'/)
  assert.match(route, /'cache-control': 'private, no-store'/)
  // The invoice page offers the document, not a print of the screen.
  const page = fs.readFileSync(path.resolve(__dirname, '..', 'src/modules/billing/server/pages/invoice/[number]/page.tsx'), 'utf8')
  assert.doesNotMatch(page, /PrintButton/)
  assert.match(page, /\/pdf\?download=1/)
  // The logo is an embedded asset, not a flattened image of invoice text; no owner storage is touched.
  const originalCwd = process.cwd(), temp = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'owned-invoice-logo-'))
  try {
    fs.mkdirSync(path.join(temp, 'public', 'fonts'), { recursive: true }); fs.mkdirSync(path.join(temp, 'storage', 'covers'), { recursive: true })
    for (const name of ['Regular', 'Bold']) fs.copyFileSync(path.join(originalCwd, 'public', 'fonts', `Vazirmatn-${name}.ttf`), path.join(temp, 'public', 'fonts', `Vazirmatn-${name}.ttf`))
    await require('sharp')({ create: { width: 300, height: 100, channels: 4, background: '#4f46e5' } }).png().toFile(path.join(temp, 'storage', 'covers', 'owned-logo.png'))
    process.chdir(temp)
    const branded = doc(3, 'PAID'); branded.seller = { ...seller, logo: '/api/media/covers/owned-logo.png' }
    const bytes = await invoicePdf({ doc: branded, link: 'https://example.com/invoice/owned', siteUrl: 'https://example.com', supportEmail: '' })
    assert.match(bytes.toString('latin1'), /\/Subtype \/Image/)
    assert.match(bytes.toString('latin1'), /\/Width 300/); assert.match(bytes.toString('latin1'), /\/Height 100/)
    branded.seller.logo = '/api/media/covers/missing.png'
    const missing = await invoicePdf({ doc: branded, link: 'https://example.com/invoice/owned', siteUrl: '', supportEmail: '' })
    assert.doesNotMatch(missing.toString('latin1'), /\/Subtype \/Image/)
  } finally { process.chdir(originalCwd); fs.rmSync(temp, { recursive: true, force: true }) }
})

test('the wallet page leads to the plans only while the VPN section is on', () => {
  const page = fs.readFileSync(path.resolve(__dirname, '..', 'src/app/dashboard/wallet/page.tsx'), 'utf8')
  assert.equal((page.match(/href="\/plans"/g) || []).length, 1)
  assert.match(page, /\{vpnOn \? <Link href="\/plans"/)
  assert.match(page, /\{vpnOn \? t\.walletSub : /)
})
