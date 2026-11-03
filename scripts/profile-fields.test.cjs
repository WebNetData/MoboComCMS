const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const ts = require('typescript-api')

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
  assert.equal(f.normalizeFieldsConfig({}).fields.filter((x) => x.required).map((x) => x.key).join(), 'firstName,lastName')
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

test('a site that has not designed its own fields asks a new member for a name, not for a postal address', () => {
  const f = load('src/modules/identity/domain/profile-fields')
  const defaults = f.normalizeFieldsConfig(undefined)
  assert.equal(defaults.enforce, true)
  assert.deepEqual(defaults.fields.filter((field) => field.required).map((field) => field.key), ['firstName', 'lastName'])
  const address = defaults.fields.find((field) => field.key === 'address')
  assert.deepEqual([address.enabled, address.required], [true, false], 'the address stays on the form, optional; checkout asks for one when an order needs it')
  // An owner who made the address required keeps that.
  const strict = f.normalizeFieldsConfig({ fields: [{ builtin: 'firstName', required: true }, { builtin: 'address', required: true }] })
  assert.equal(strict.fields.find((field) => field.key === 'address').required, true)
})

test('sign-up, sign-in and the completion page speak about this site and agree with the server about passwords', () => {
  const read = (file) => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8')
  // The server refuses a password under 8 characters; no label may promise 6.
  assert.match(read('src/modules/identity/server/http/register/route.ts'), /password\.length < 8/)
  const dictionaries = read('src/i18n/dictionaries.ts')
  for (const line of dictionaries.split('\n').filter((item) => /passwordLabel|errPassShort|newPassword:/.test(item))) assert.ok(!/6|۶/.test(line), line.trim())
  const register = read('src/app/register/RegisterForm.tsx'), login = read('src/app/login/LoginForm.tsx')
  // The sign-up page takes the theme from the request; read from the cookie in the browser it broke hydration for returning visitors.
  assert.match(read('src/app/register/page.tsx'), /await (?:getServerTheme\(\)|Promise\.all\(\[[^\n]*getServerTheme\(\))/)
  assert.ok(!register.includes("getCookie('theme')"))
  assert.match(register, /minLength=\{8\}/)
  for (const source of [register, login]) assert.ok(!/اتصال تازه|اتصال‌های خود|اشتراک‌های شما|all your subscriptions|A NEW CONNECTION|connected world/.test(source), 'wording left from the VPN service')
  // Straight after sign-up the email form opens (it carries the confirmation), whatever the default tab is.
  assert.ok(login.includes('initialEntryMethod'))
  const entry = load('src/modules/identity/domain/account-security').initialEntryMethod
  assert.equal(entry({ sms: true, email: true, registered: false, passwordChanged: false }), 'phone')
  assert.equal(entry({ sms: false, email: true, registered: false, passwordChanged: false }), 'email')
  assert.equal(entry({ sms: true, email: true, registered: true, passwordChanged: false }), 'password')
  assert.equal(entry({ sms: true, email: true, registered: false, passwordChanged: true }), 'password')
  assert.equal(entry({ sms: false, email: false, registered: false, passwordChanged: false }), 'password')
  // The completion page can be left.
  assert.ok(read('src/app/welcome/page.tsx').includes("{status.needsCompletion && <button type=\"button\" className=\"btn btn-ghost\" onClick={() => void signOut({ callbackUrl: '/' })}>"))
})

test('changing the password in the profile ends every session, as a reset does', () => {
  const read = (file) => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8')
  const route = read('src/modules/identity/server/http/profile/route.ts')
  const change = route.slice(route.indexOf('if (b?.newPassword)'), route.indexOf('const updated ='))
  assert.ok(change.includes('data.passwordHash = await bcrypt.hash(next, 10)') && change.includes('data.passwordChangedAt = new Date()'))
  // The session check that reads that moment.
  const security = load('src/modules/identity/domain/account-security')
  const changedAt = new Date('2026-10-06T12:00:00Z')
  assert.equal(security.sessionRevoked(changedAt.getTime() - 60_000, changedAt), true, 'a session from before the change is void')
  assert.equal(security.sessionRevoked(changedAt.getTime() + 5_000, changedAt), false, 'signing in afterwards works')
  // The member is sent to sign in again and told why.
  assert.ok(read('src/app/dashboard/profile/page.tsx').includes("await signOut({ callbackUrl: '/login?changed=1' })"))
  assert.ok(read('src/app/login/LoginForm.tsx').includes("params.get('changed') === '1' && <p className=\"success-text mb-4\" role=\"status\">"))
})
