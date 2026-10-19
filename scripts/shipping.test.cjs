const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript-api')

// Minimal TS loader with "@/" path mapping (domain modules only import each other).
const cache = new Map()
function load(relative) {
  const file = path.resolve(__dirname, '..', relative.endsWith('.ts') ? relative : `${relative}.ts`)
  if (cache.has(file)) return cache.get(file).exports
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const mod = { exports: {} }
  cache.set(file, mod)
  const localRequire = (specifier) => (specifier.startsWith('@/') ? load(`src/${specifier.slice(2)}`) : require(specifier))
  new Function('require', 'module', 'exports', source)(localRequire, mod, mod.exports)
  return mod.exports
}

const sh = load('src/modules/shipping/domain/shipping')
const valid = { title: 'خانه', recipient: 'علی رضایی', mobile: '۰۹۱۲ ۱۲۳ ۴۵۶۷', province: 'تهران', city: 'تهران', address: 'خیابان ولیعصر، کوچهٔ بهار', plaque: '۱۲', unit: '3', postalCode: '1345678901' }

test('mobile numbers normalize from common spellings', () => {
  for (const input of ['09121234567', '+989121234567', '00989121234567', '9121234567', '۰۹۱۲۱۲۳۴۵۶۷', '0912-123 4567']) assert.equal(sh.normalizeMobile(input), '09121234567', input)
  for (const input of ['0212345678', '0912123456', '08121234567', '']) assert.equal(sh.normalizeMobile(input), '', input)
})

test('postal codes need ten digits without 0 or 2 in the first five', () => {
  assert.equal(sh.normalizePostalCode('۱۳۴۵۶-۷۸۹۰۱'), '1345678901')
  assert.equal(sh.normalizePostalCode('1204567890'), '')
  assert.equal(sh.normalizePostalCode('123456789'), '')
  assert.equal(sh.normalizePostalCode('1111111111'), '')
})

test('addresses validate every courier field and strip markup', () => {
  const address = sh.validateAddress({ ...valid, recipient: '<b>علی</b> رضایی' })
  assert.equal(address.mobile, '09121234567')
  assert.equal(address.plaque, '12')
  assert.ok(!address.recipient.includes('<'))
  assert.throws(() => sh.validateAddress({ ...valid, province: 'کالیفرنیا' }), /استان/)
  assert.throws(() => sh.validateAddress({ ...valid, postalCode: '12' }), /کد پستی/)
  assert.throws(() => sh.validateAddress({ ...valid, mobile: '021' }), /موبایل/)
  assert.throws(() => sh.validateAddress({ ...valid, address: 'کوتاه' }), /نشانی/)
  assert.equal(sh.validateAddress({ ...valid, title: '' }).title, 'آدرس من')
  assert.equal(sh.formatAddress(address), 'تهران، خیابان ولیعصر، کوچهٔ بهار، پلاک 12، واحد 3')
})

// 2026-10-03 is a Saturday. 05:30 UTC = 09:00 Tehran; 12:30 UTC = 16:00 Tehran.
const morning = new Date('2026-10-03T05:30:00Z')
const afternoon = new Date('2026-10-03T12:30:00Z')

test('schedule skips lead time, the cutoff hour, closed weekdays and holidays', () => {
  const settings = sh.normalizeDeliverySettings({ leadDays: 1, daysAhead: 7, cutoffHour: 14, closedWeekdays: [5], holidays: ['2026-10-06'] })
  const days = sh.buildSchedule(settings, morning, new Map())
  assert.equal(days[0].date, '2026-10-04')
  assert.equal(days.length, 7)
  assert.ok(!days.some((d) => d.weekday === 5), 'no Fridays')
  assert.ok(!days.some((d) => d.date === '2026-10-06'), 'holiday skipped')
  assert.equal(sh.buildSchedule(settings, afternoon, new Map())[0].date, '2026-10-05', 'after cutoff ships a day later')
  assert.deepEqual(sh.buildSchedule({ ...settings, enabled: false }, morning, new Map()), [])
})

test('slot capacity counts bookings; zero capacity means unlimited', () => {
  const settings = sh.normalizeDeliverySettings({ slots: [{ id: '09-12', label: '۹ تا ۱۲', capacity: 2 }, { id: '18-21', label: '۱۸ تا ۲۱', capacity: 0 }] })
  const booked = new Map([['2026-10-04|09-12', 2], ['2026-10-04|18-21', 500]])
  const [first] = sh.buildSchedule(settings, morning, booked)
  assert.deepEqual(first.slots.map((s) => s.available), [false, true])
  assert.throws(() => sh.assertSlot([first], '2026-10-04', '09-12'), (e) => e.code === 'DELIVERY_SLOT_FULL')
  assert.throws(() => sh.assertSlot([first], '2026-10-04', 'nope'), (e) => e.code === 'DELIVERY_SLOT_INVALID')
  assert.throws(() => sh.assertSlot([first], '2026-12-30', '18-21'), (e) => e.code === 'DELIVERY_SLOT_INVALID')
  assert.equal(sh.assertSlot([first], '2026-10-04', '18-21').slot.label, '۱۸ تا ۲۱')
})

test('settings normalization clamps numbers and drops bad slots and dates', () => {
  const s = sh.normalizeDeliverySettings({ leadDays: 99, daysAhead: 0, cutoffHour: -3, closedWeekdays: [5, 5, 9, 'x'], holidays: ['2026-10-06', 'bad'], slots: [{ id: 'A B!', label: 'صبح', capacity: -4 }, { id: 'a-b', label: 'تکراری' }, { id: '', label: 'x' }], feeRial: '350000' })
  assert.equal(s.leadDays, 30)
  assert.equal(s.daysAhead, 1)
  assert.equal(s.cutoffHour, 0)
  assert.deepEqual(s.closedWeekdays, [5])
  assert.deepEqual(s.holidays, ['2026-10-06'])
  assert.deepEqual(s.slots, [{ id: 'ab', label: 'صبح', capacity: 0 }, { id: 'a-b', label: 'تکراری', capacity: 30 }])
  assert.equal(s.feeRial, 350000)
  assert.deepEqual(sh.normalizeDeliverySettings({ slots: [] }).slots, sh.DEFAULT_DELIVERY.slots, 'empty slot list keeps the previous slots')
})

test('shipping fee converts Rial to the order currency and honours the free threshold', () => {
  const s = sh.normalizeDeliverySettings({ feeRial: 500000, freeOverRial: 50000000 })
  assert.equal(sh.shippingFeeMinor(s, 'IRR', 1000000n), 500000n)
  assert.equal(sh.shippingFeeMinor(s, 'IRT', 100000n), 50000n)
  assert.equal(sh.shippingFeeMinor(s, 'IRT', 5000000n), 0n, '5,000,000 Toman = 50,000,000 Rial ships free')
  assert.equal(sh.shippingFeeMinor(s, 'USD', 1000n), 0n)
  assert.equal(sh.shippingFeeMinor(sh.normalizeDeliverySettings({ feeRial: 0 }), 'IRR', 1n), 0n)
})
