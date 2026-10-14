const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')
const read = (relative) => fs.readFileSync(path.resolve(root, relative), 'utf8')
function load(relative) {
  const source = ts.transpileModule(read(relative), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', source)(require, mod, mod.exports)
  return mod.exports
}
const r = load('src/modules/billing/domain/invoice-rules.ts')
const persian = (date) => new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn', { timeZone: 'Asia/Tehran', year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date)

test('recurring invoices count Persian months and keep the time of day', () => {
  const at = new Date('2026-10-14T09:22:00Z') // 22 Mehr 1405, 12:52 Tehran
  assert.equal(persian(r.nextRun(at, 'WEEK')), persian(new Date(at.getTime() + 7 * 86_400_000)))
  assert.match(persian(r.nextRun(at, 'MONTH')), /^8\/22\/1405.*12:52/)
  assert.match(persian(r.nextRun(at, 'QUARTER')), /^10\/22\/1405/)
  assert.match(persian(r.nextRun(at, 'HALF')), /^1\/22\/1406/)
  assert.match(persian(r.nextRun(at, 'YEAR')), /^7\/22\/1406/)
  assert.match(persian(r.nextRun(new Date('2026-09-22T08:00:00Z'), 'MONTH')), /^7\/30\/1405/, '31 Shahrivar → 30 Mehr')
  assert.match(persian(r.nextRun(new Date('2027-02-19T08:00:00Z'), 'MONTH')), /^12\/29\/1405/, '30 Bahman → 29 Esfand')
  assert.match(persian(r.nextRun(new Date('2026-10-14T21:00:00Z'), 'MONTH')), /^8\/23\/1405.*00:30/, 'just after midnight in Tehran stays on its own day')
  assert.equal(r.INTERVALS.map((item) => item.id).join(), 'WEEK,MONTH,QUARTER,HALF,YEAR')
})

test('closing rules: defaults, limits, and only known actions', () => {
  assert.deepEqual(r.normalizeInvoiceRules({}), r.DEFAULT_INVOICE_RULES)
  assert.equal(r.DEFAULT_INVOICE_RULES.fxHours, 2)
  assert.equal(r.DEFAULT_INVOICE_RULES.fxJumpToman, 3000)
  const odd = r.normalizeInvoiceRules({ fxHours: 999, fxJumpToman: -5, fxAction: 'drop table', overdueEnabled: 'yes', overdueHours: 0, overdueAction: 'delete' })
  assert.deepEqual(odd, { fxHours: 72, fxJumpToman: 0, fxAction: 'delete', overdueEnabled: false, overdueHours: 1, overdueAction: 'delete' })
  assert.equal(r.normalizeInvoiceRules({ fxHours: 1.3 }).fxHours, 1.25)
})

test('a rate that rose by the threshold closes; a fall or a smaller rise does not', () => {
  const at = { USD: 98000, EUR: 105000 }
  assert.equal(r.fxJump(at, { USD: 100999, EUR: 105000 }, 3000), null)
  assert.deepEqual(r.fxJump(at, { USD: 101000, EUR: 105000 }, 3000), { code: 'USD', from: 98000, to: 101000 })
  assert.deepEqual(r.fxJump(at, { USD: 98000, EUR: 109000 }, 3000), { code: 'EUR', from: 105000, to: 109000 })
  assert.equal(r.fxJump(at, { USD: 60000, EUR: 50000 }, 3000), null, 'a fall never closes an invoice')
  assert.equal(r.fxJump(at, { USD: 200000 }, 0), null, 'threshold 0 is off')
  assert.equal(r.fxJump(at, { USD: null, EUR: undefined }, 3000), null, 'an unknown rate never closes an invoice')
  assert.deepEqual(r.parseFxRates('{"USD":98000,"bad":1,"EUR":-1,"GBP":"x"}'), { USD: 98000 })
  assert.deepEqual(r.parseFxRates('not json'), {})
})

test('the customer is told why, in words', () => {
  const fx = r.closeMessage('FX_RATE', 'MB-1', { code: 'USD', from: 98000, to: 101500 })
  assert.match(fx.title, /به دلیل نوسان نرخ ارز بسته شد/)
  assert.match(fx.body, /نرخ دلار از ۹۸٬۰۰۰ به ۱۰۱٬۵۰۰ تومان رسید/)
  assert.match(fx.body, /دوباره ثبت کنید/)
  assert.match(r.closeMessage('EXPIRED', 'MB-2').body, /نرخ ارز/)
  assert.doesNotMatch(r.closeMessage('EXPIRED', 'MB-2', null, false).body, /نرخ ارز/, 'a deadline staff set says nothing of rates')
  assert.match(r.closeMessage('OVERDUE', 'MB-3').body, /سررسید/)
})

test('wiring: checkout stamps, the scheduler runs, a waiting receipt is safe, money goes back', () => {
  const checkout = read('src/modules/checkout/server/checkout.ts')
  assert.match(checkout, /if \(fxCodes\.length && !invoice\.fxRates\) await stampFxInvoice\(invoice\.id, fxCodes\)/)
  assert.match(checkout, /product\.pricingMode === 'FX' && product\.fxCurrency/)
  assert.match(read('src/modules/notifications/server/jobs-scheduler.ts'), /name: 'invoice-rules'[\s\S]*processInvoiceRules/)
  const engine = read('src/modules/billing/server/invoice-rules.ts')
  assert.match(engine, /paymentReceipt\.count\(\{ where: \{ invoiceId: invoice\.id, status: 'PENDING' \} \}\)/, 'a transfer waiting for staff keeps the invoice open')
  assert.match(engine, /voidOpenInvoice\(invoice\.id/, 'closing uses the same claim as a hand void (wallet credit goes back)')
  assert.match(engine, /where: \{ id: invoiceId, status: \{ in: \['UNPAID', 'DRAFT'\] \}, fxRates: '' \}/, 'a replayed checkout never moves the deadline')
  assert.match(engine, /where: \{ id, nextAt: due \}/, 'a recurring invoice is claimed once')
  assert.match(read('src/modules/billing/server/http/admin/invoice-automation.ts'), /'invoices\.manage'/)
})
