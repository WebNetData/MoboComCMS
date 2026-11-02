const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript-api')

const root = path.resolve(__dirname, '..')
const read = (relative) => fs.readFileSync(path.resolve(root, relative), 'utf8')
function load(relative) {
  const source = ts.transpileModule(read(relative), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', source)(require, mod, mod.exports)
  return mod.exports
}
const { invoiceSubject } = load('src/modules/billing/domain/invoice-subject.ts')
const { paymentResultState, paymentResultTarget } = load('src/modules/billing/domain/payment-result.ts')
const f = load('src/modules/forms/domain/forms.ts')
const base = { siteName: 'موبوکام', amountText: '۱٬۰۰۰٬۰۰۰ تومان' }

test('payment result reflects terminal refunds and persisted invoice payment instead of callback claims', () => {
  assert.equal(paymentResultState('REFUNDED', 'PAID', true), 'refunded')
  assert.equal(paymentResultState('PAID', 'REFUNDED'), 'refunded')
  assert.equal(paymentResultState('PAID', 'PAID', true), 'paid')
  assert.equal(paymentResultState('UNPAID', 'PAID'), 'pending', 'the order cannot turn an unpaid invoice into a paid result')
  assert.equal(paymentResultState('VOID', 'PAID'), 'failed')
  assert.equal(paymentResultState('UNPAID', 'FAILED'), 'failed')
  assert.equal(paymentResultState('UNPAID', 'PENDING', true), 'failed')
  assert.equal(paymentResultState('UNPAID', 'PENDING'), 'pending')
  assert.equal(paymentResultState('DRAFT'), 'pending')
})

test('payment result login returns to the same invoice or order without path/query injection', () => {
  assert.deepEqual(paymentResultTarget({ order: '23' }), { invoiceNumber: '', orderId: 23, href: '/payment/result?order=23' })
  const number = 'صورتحساب&order=99#details'
  const result = paymentResultTarget({ invoice: number, order: '23' })
  const query = new URL(result.href, 'https://example.invalid').searchParams
  assert.equal(query.get('invoice'), number)
  assert.equal(query.has('order'), false)
  for (const order of ['NaN', 'Infinity', '2147483648', '-1', '1.5', ['23'], {}, null]) assert.equal(paymentResultTarget({ order }).href, '/payment/result')
  assert.equal(paymentResultTarget({ invoice: ['one', 'two'] }).invoiceNumber, '')
  assert.equal(paymentResultTarget({ invoice: 'x'.repeat(256) }).invoiceNumber, '')
})

test('an order and its invoice close together, and staff credit is in the site currency', () => {
  const read = (file) => fs.readFileSync(path.join(process.cwd(), file), 'utf8')
  const invoices = read('src/modules/billing/server/http/admin/invoices/route.ts'), orders = read('src/modules/orders/server/http/admin/orders/route.ts')
  assert.match(invoices, /refundPaidInvoice\(invoice,/, 'the invoice route refunds through the shared closure')
  assert.doesNotMatch(invoices, /tx\.payment\.create/, 'and records no refund of its own')
  assert.match(orders, /cancelUnpaidOrder\(id,/)
  assert.doesNotMatch(orders, /data: \{ status: 'CANCELLED' \}/, 'a cancel never writes the order state alone')
  assert.match(read('src/modules/wallet/server/http/admin/wallet/route.ts'), /currency: normalizeCurrency\(b\?\.currency \|\| BASE_CURRENCY\)/, 'a toman amount is never credited as dollars')
  assert.match(read('src/modules/fulfillment/server/jobs.ts'), /\['REFUNDED', 'CANCELLED'\]\.includes\(order\.status\)/, 'a closed order is not delivered')
})

test('a wallet top-up says what it is and for how much', () => {
  assert.deepEqual(invoiceSubject({ ...base, kind: 'WALLET_TOPUP' }), { title: 'افزایش موجودی کیف پول موبوکام', detail: 'افزایش موجودی حساب کاربری پلتفرم موبوکام به مبلغ ۱٬۰۰۰٬۰۰۰ تومان' })
})

test('a form payment uses the form\'s invoice title and text, else the form and the request', () => {
  assert.deepEqual(invoiceSubject({ ...base, kind: 'BILLING', meta: { kind: 'form', formTitle: 'پرداخت سایت خارجی با ویزا کارت', invoiceTitle: 'پرداخت سایت خارجی', invoiceText: 'پرداخت در سایت x برای حساب y', submissionId: 48 } }), { title: 'پرداخت سایت خارجی', detail: 'پرداخت در سایت x برای حساب y' })
  assert.deepEqual(invoiceSubject({ ...base, kind: 'BILLING', meta: { kind: 'form', formTitle: 'تلگرام پرمیوم', submissionId: 7 } }), { title: 'تلگرام پرمیوم', detail: 'درخواست شمارهٔ ۷' })
})

test('other kinds name themselves; a bare invoice says "فاکتور" or its note', () => {
  assert.equal(invoiceSubject({ ...base, kind: 'BILLING', meta: { kind: 'membership', planName: 'طلایی', days: 30 } }).title, 'اشتراک ویژهٔ طلایی')
  assert.equal(invoiceSubject({ ...base, kind: 'BILLING', meta: { kind: 'content', contentTitle: 'آموزش' } }).title, 'دسترسی به «آموزش»')
  assert.equal(invoiceSubject({ ...base, kind: 'BILLING', planName: 'VPN ماهانه' }).title, 'VPN ماهانه')
  assert.deepEqual(invoiceSubject({ ...base, kind: 'BILLING', productName: 'کارت هدیه', meta: { variantName: '۵۰ دلار' } }), { title: 'کارت هدیه', detail: '۵۰ دلار' })
  assert.equal(invoiceSubject({ ...base, kind: 'BILLING' }).title, 'فاکتور')
  assert.equal(invoiceSubject({ ...base, kind: 'BILLING', notes: 'طراحی لوگو\nجزئیات' }).title, 'طراحی لوگو')
})

test('a form keeps its invoice texts; the public page never gets them', () => {
  const template = f.TEMPLATES.find((item) => item.id === 'foreign-payment').build()
  const form = f.normalizeForm(template)
  assert.equal(form.settings.payment.invoiceTitle, 'پرداخت سایت خارجی')
  assert.match(form.settings.payment.invoiceText, /\{field:site\}.*\{field:username\}/)
  const shown = f.publicForm(form)
  assert.equal(shown.settings.payment.invoiceTitle, '')
  assert.equal(shown.settings.payment.invoiceText, '')
  assert.equal(shown.settings.payment.enabled, true)
})

test('wiring: checkout stores the texts, the invoice views read the one subject', () => {
  assert.match(read('src/modules/checkout/server/checkout.ts'), /invoiceTitle: quote\.invoiceTitle, invoiceText: quote\.invoiceText/)
  assert.match(read('src/modules/forms/server/paid.ts'), /mergeTags\(form\.settings\.payment\.invoiceText/)
  for (const file of ['src/modules/billing/server/pages/invoice/[number]/page.tsx', 'src/modules/billing/server/http/my/invoices/route.ts', 'src/modules/billing/server/official-invoice.ts']) assert.match(read(file), /invoiceSubject\(/, file)
})
