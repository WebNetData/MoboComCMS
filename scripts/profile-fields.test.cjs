const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const ts = require('typescript')

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

const f = load('src/modules/identity/domain/profile-fields')
const s = load('src/modules/shipping/domain/shipping')

test('default usernames continue after the highest taken number', () => {
  assert.equal(f.nextUsername('mobocomuser', []), 'mobocomuser')
  assert.equal(f.nextUsername('mobocomuser', ['mobocomuser']), 'mobocomuser2')
  assert.equal(f.nextUsername('mobocomuser', ['mobocomuser', 'mobocomuser2', 'mobocomuser7', 'mobocomuser_x', 'mobocomuser07']), 'mobocomuser8')
  assert.equal(f.nextUsername('mobocomuser', ['mobocomuser3']), 'mobocomuser4')
})

test('config: built-ins always present, username never required, broken custom fields dropped', () => {
  const c = f.normalizeFieldsConfig({ usernamePrefix: 'Shop-User!', fields: [
    { builtin: 'username', required: true },
    { key: 'nationalCode', label: 'کد ملی', type: 'nationalId', required: true },
    { key: 'gender', label: 'جنسیت', type: 'radio', options: ['زن'] },
    { key: 'firstName', label: 'hijack', type: 'text' },
    { key: 'job', label: 'شغل', type: 'select', options: ['برنامه‌نویس', 'طراح', 'طراح'] },
  ] })
  assert.equal(c.usernamePrefix, 'shopuser')
  assert.deepEqual(c.fields.map((x) => x.key), ['username', 'nationalCode', 'job', 'firstName', 'lastName', 'email', 'address'])
  assert.equal(c.fields[0].required, false)
  assert.deepEqual(c.fields[2].options, ['برنامه‌نویس', 'طراح'])
  assert.equal(c.fields.find((x) => x.key === 'firstName').enabled, false)
  assert.equal(f.normalizeFieldsConfig({}).fields.filter((x) => x.required).map((x) => x.key).join(), 'firstName,lastName,address')
  assert.equal(f.normalizeFieldsConfig({ usernamePrefix: '1a' }).usernamePrefix, 'mobocomuser')
})

test('custom values are validated by type', () => {
  const field = (type, extra = {}) => ({ key: 'x', label: 'فیلد', type, required: false, enabled: true, placeholder: '', help: '', options: [], ...extra })
  assert.deepEqual(f.cleanCustomValue(field('nationalId'), '۰۰۱۲۳۴۵۶۷۸'), ['', '«فیلد» کد ملی معتبر نیست'])
  assert.equal(f.cleanCustomValue(field('nationalId'), '0013542419')[0], '0013542419')
  assert.equal(f.cleanCustomValue(field('postalCode'), '۱۳۴۵۶-۷۸۹۰۱')[0], '1345678901')
  assert.equal(f.cleanCustomValue(field('number'), '۱٬۲۰۰')[0], '1200')
  assert.equal(f.cleanCustomValue(field('select', { options: ['الف', 'ب'] }), 'ج')[1] !== null, true)
  assert.equal(f.cleanCustomValue(field('checkbox'), true)[0], true)
  assert.equal(f.cleanCustomValue(field('date'), '۱۳۷۰/۵/۲۰')[0], '1370/5/20')
  assert.equal(f.cleanCustomValue(field('text'), '  ‮سلام  ')[0], 'سلام')
})

test('missing required fields per member', () => {
  const c = f.normalizeFieldsConfig({ fields: [
    { builtin: 'firstName', required: true }, { builtin: 'lastName', required: true }, { builtin: 'address', required: true },
    { builtin: 'email', required: true }, { key: 'agree', label: 'قوانین', type: 'checkbox', required: true }, { key: 'job', label: 'شغل', type: 'text', required: false },
  ] })
  const state = { firstName: 'علی', lastName: '', hasAddress: false, realEmail: false, data: { agree: false } }
  assert.deepEqual(f.missingRequired(c, state).map((x) => x.key), ['lastName', 'address', 'email', 'agree'])
  assert.deepEqual(f.missingRequired(c, { firstName: 'علی', lastName: 'رضایی', hasAddress: true, realEmail: true, data: { agree: true } }), [])
  assert.deepEqual(f.splitName('  علی   رضایی نژاد '), ['علی', 'رضایی نژاد'])
})

test('map pins must be inside Iran; every province has a centre', () => {
  assert.deepEqual(s.normalizeCoordinates('35.6997123', 51.3380456), { lat: 35.69971, lng: 51.33805 })
  assert.equal(s.normalizeCoordinates(48.85, 2.35), null)
  assert.equal(s.normalizeCoordinates('', ''), null)
  for (const province of s.PROVINCES) assert.ok(s.PROVINCE_CENTERS[province], province)
  const base = { recipient: 'علی رضایی', mobile: '09121234567', province: 'تهران', city: 'تهران', address: 'خیابان آزادی، کوچهٔ یک', postalCode: '1345678901' }
  assert.equal(s.validateAddress({ ...base, lat: 35.7, lng: 51.4 }).lat, 35.7)
  assert.equal(s.validateAddress(base).lat, null)
  assert.throws(() => s.validateAddress({ ...base, lat: 10, lng: 10 }), /داخل ایران/)
})
