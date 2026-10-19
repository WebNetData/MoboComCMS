const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript-api')

const cache = new Map()
function load(relative) {
  const file = path.resolve(__dirname, '..', relative.endsWith('.ts') ? relative : `${relative}.ts`)
  if (cache.has(file)) return cache.get(file).exports
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText
  const mod = { exports: {} }
  cache.set(file, mod)
  const localRequire = (specifier) => (specifier.startsWith('@/') ? load(`src/${specifier.slice(2)}`) : require(specifier))
  new Function('require', 'module', 'exports', source)(localRequire, mod, mod.exports)
  return mod.exports
}
const c = load('src/modules/shipping/domain/carriers')
const settings = (patch = {}) => c.normalizeCarrierSettings({ enabled: true, originProvince: 'تهران', originCity: 'تهران', ...patch })
const byId = (list, id) => list.find((item) => item.carrierId === id)

test('zones: same city, same province, other province (Persian spelling variants match)', () => {
  const origin = { province: 'تهران', city: 'تهران' }
  assert.equal(c.zoneOf(origin, { province: 'تهران', city: 'تهران' }), 'city')
  assert.equal(c.zoneOf(origin, { province: 'تهران', city: 'اسلامشهر' }), 'province')
  assert.equal(c.zoneOf(origin, { province: 'اصفهان', city: 'اصفهان' }), 'country')
  assert.equal(c.zoneOf({ province: 'کرمان', city: 'کرمان' }, { province: 'كرمان', city: 'شهر كرمان' }), 'city', 'Arabic kaf and a "شهر" prefix')
})

test('parcel weight uses product weights, a default for unknown ones and packaging; billing rounds kg up', () => {
  assert.equal(c.parcelWeight([{ weightGrams: 400, quantity: 2 }, { weightGrams: 0, quantity: 1 }], { packagingGrams: 200, defaultWeightGrams: 500 }), 1500)
  assert.equal(c.chargeableKg(1), 1)
  assert.equal(c.chargeableKg(1000), 1)
  assert.equal(c.chargeableKg(1001), 2)
})

test('rates: base covers the first kilo, each further kilo adds; cheapest first', () => {
  const list = c.quotes(settings(), { dest: { province: 'اصفهان', city: 'اصفهان' }, weightGrams: 2500, itemRial: 5_000_000 })
  const pishtaz = byId(list, 'post-pishtaz')
  assert.equal(pishtaz.ok, true)
  assert.equal(pishtaz.zone, 'country')
  assert.equal(pishtaz.feeRial, 700_000 + 2 * 180_000)
  assert.equal(byId(list, 'tipax').feeRial, 1_500_000 + 2 * 300_000)
  const fees = list.filter((item) => item.ok).map((item) => item.feeRial)
  assert.deepEqual(fees, [...fees].sort((a, b) => a - b))
})

test('local couriers only inside their cities; weight limits; free-shipping threshold', () => {
  const s = settings({ carriers: [
    { id: 'alopeyk', enabled: true, kind: 'local', cities: ['تهران', 'کرج'] },
    { id: 'courier', enabled: true, kind: 'local', cities: [] },
    { id: 'tipax', enabled: true, freeOverRial: 10_000_000 },
    { id: 'post-pishtaz', enabled: true, maxWeightGrams: 1000 },
  ] })
  const tehran = c.quotes(s, { dest: { province: 'تهران', city: 'تهران' }, weightGrams: 800, itemRial: 1 })
  assert.equal(byId(tehran, 'alopeyk').ok, true)
  assert.equal(byId(tehran, 'courier').ok, true)
  assert.equal(byId(tehran, 'courier').scheduled, true)
  const shiraz = c.quotes(s, { dest: { province: 'فارس', city: 'شیراز' }, weightGrams: 800, itemRial: 1 })
  assert.equal(byId(shiraz, 'alopeyk').ok, false)
  assert.equal(byId(shiraz, 'courier').ok, false)
  const heavy = c.quotes(s, { dest: { province: 'فارس', city: 'شیراز' }, weightGrams: 5000, itemRial: 20_000_000 })
  assert.equal(byId(heavy, 'post-pishtaz').ok, false, 'over the weight limit')
  assert.equal(byId(heavy, 'tipax').feeRial, 0)
  assert.equal(byId(heavy, 'tipax').free, true)
  assert.equal(heavy[0].carrierId, 'tipax', 'available and cheapest first')
})

test('fees convert to the order currency; Toman rounds up', () => {
  assert.equal(c.rialToMinor(700_005, 'IRT'), 70_001n)
  assert.equal(c.rialToMinor(700_000, 'IRR'), 700_000n)
  assert.equal(c.rialToMinor(700_000, 'USD'), null)
})

test('settings are sanitised (tracking URLs need https and {code})', () => {
  const s = c.normalizeCarrierSettings({ carriers: [{ id: 'X<b>', name: '<i>ok</i>', enabled: true, trackingUrl: 'javascript:alert(1)//{code}' }, { id: 'tipax', trackingUrl: 'https://t.example/{code}', rates: { city: { baseRial: -5 } } }] })
  assert.equal(s.enabled, false, 'off unless switched on')
  assert.equal(s.carriers[0].id, 'xb')
  assert.doesNotMatch(s.carriers[0].name, /[<>]/)
  assert.equal(s.carriers[0].trackingUrl, '')
  assert.equal(s.carriers[1].trackingUrl, 'https://t.example/{code}')
  assert.equal(s.carriers[1].rates.city.baseRial, 0)
  assert.equal(c.trackingLink('https://t.example/{code}', 'A B'), 'https://t.example/A%20B')
})

test('waybill numbers carry a check digit', () => {
  const code = c.waybillNumber(123, new Date('2026-10-05T10:00:00Z'))
  assert.match(code, /^MC261005000123\d$/)
  assert.equal(c.validWaybill(code), true)
  assert.equal(c.validWaybill(code.slice(0, -1) + ((Number(code.slice(-1)) + 1) % 10)), false)
  assert.deepEqual(c.nextShipmentStatuses('READY'), ['PICKED_UP', 'CANCELLED'])
  assert.deepEqual(c.nextShipmentStatuses('DELIVERED'), ['RETURNED'])
})

test('Code 128-B barcode: start, data, checksum and stop symbols', () => {
  const bars = c.code128('MC1')
  // (start + 3 data + checksum) × 11 modules + stop (13 modules)
  assert.equal(bars.reduce((sum, width) => sum + width, 0), 5 * 11 + 13)
  assert.deepEqual(bars.slice(0, 6), [2, 1, 1, 2, 1, 4], 'start B')
  assert.deepEqual(bars.slice(-7), [2, 3, 3, 1, 1, 1, 2], 'stop')
})

test('checkout re-prices the carrier on the server', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'src/modules/checkout/server/checkout.ts'), 'utf8')
  assert.match(source, /shippingMinor = carrier\.feeMinor/)
  assert.match(source, /checkoutCarrier\(\{ carrierId: carrier\.carrierId/)
})
