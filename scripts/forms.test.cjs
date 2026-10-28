const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript-api')

const root = path.resolve(__dirname, '..')
function load(relative) {
  const source = ts.transpileModule(fs.readFileSync(path.resolve(root, relative), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', source)(require, mod, mod.exports)
  return mod.exports
}
const f = load('src/modules/forms/domain/forms.ts')
// Results are null-prototype objects on purpose (an answer named "__proto__" cannot pollute anything).
const plain = (value) => JSON.parse(JSON.stringify(value))

const field = (id, type, extra = {}) => ({ id, label: `L ${id}`, type, required: false, options: [], ...extra })
const form = (fields, extra = {}) => ({ slug: 'test-form', title: 'Test', description: '', published: true, successText: 'ok', fields, ...extra })

test('every ready-made template is a valid form', () => {
  assert.ok(f.TEMPLATES.length >= 4)
  for (const t of f.TEMPLATES) assert.doesNotThrow(() => f.normalizeForm(t.build()), t.id)
})

test('form definitions: safe ids, unique fields, choices need options, limits', () => {
  assert.equal(f.validForm(form([field('a', 'text')])), true)
  assert.equal(f.validForm(form([field('a', 'text'), field('a', 'text')])), false, 'duplicate id')
  for (const id of ['__proto__', 'constructor', 'website', 'A', '1a', 'a-b']) assert.equal(f.validForm(form([field(id, 'text')])), false, id)
  assert.equal(f.validForm(form([field('a', 'select', { options: [] })])), false)
  assert.equal(f.validForm(form([field('a', 'radio', { options: ['x', 'x'] })])), false, 'duplicate options')
  assert.equal(f.validForm(form([field('h', 'heading')])), false, 'content only')
  assert.equal(f.validForm(form([field('a', 'weird')])), false)
  assert.equal(f.validForm(form(Array.from({ length: 61 }, (_, i) => field(`f${i}`, 'text')))), false)
  assert.equal(f.validForm({ ...form([field('a', 'text')]), slug: 'Bad Slug' }), false)
  assert.throws(() => f.normalizeForm(form([field('a', 'number', { min: 10, max: 5 })])), /کمینه/)
})

test('steps: fields belong to a step and stay in step order', () => {
  const settings = { steps: [{ id: 's1', title: 'One' }, { id: 's2', title: 'Two' }] }
  const ok = f.normalizeForm(form([field('a', 'text', { step: 's1' }), field('b', 'text', { step: 's2' }), field('c', 'text', { step: 'nope' })].slice(0, 2), { settings }))
  assert.equal(ok.fields[1].step, 's2')
  assert.equal(f.normalizeForm(form([field('a', 'text', { step: 'unknown' })], { settings })).fields[0].step, 's1', 'an unknown step falls back to the first')
  assert.throws(() => f.normalizeForm(form([field('a', 'text', { step: 's2' }), field('b', 'text', { step: 's1' })], { settings })), /ترتیب/)
  assert.throws(() => f.normalizeSettings({ steps: [{ id: 's1', title: 'a' }, { id: 's1', title: 'b' }] }), /یکتا/)
})

test('conditions may only look at earlier fields and are evaluated per rule', () => {
  assert.throws(() => f.normalizeForm(form([field('a', 'text', { showIf: [{ field: 'b', op: 'filled' }] }), field('b', 'text')])), /قبلی/)
  assert.throws(() => f.normalizeForm(form([field('a', 'text', { showIf: [{ field: 'a', op: 'filled' }] })])), /قبلی/)
  assert.throws(() => f.normalizeForm(form([field('a', 'text'), field('b', 'text', { showIf: [{ field: 'a', op: 'eq' }] })])), /مقدار/)
  const fields = [field('kind', 'radio', { options: ['x', 'y'] }), field('why', 'text', { showIf: [{ field: 'kind', op: 'eq', value: 'x' }] }), field('more', 'text', { showIf: [{ field: 'why', op: 'filled' }] })]
  assert.deepEqual(f.visibleFields(fields, {}).map((x) => x.id), ['kind'])
  assert.deepEqual(f.visibleFields(fields, { kind: 'y', why: 'stale' }).map((x) => x.id), ['kind'], 'a hidden field never reveals others')
  assert.deepEqual(f.visibleFields(fields, { kind: 'x', why: 'because' }).map((x) => x.id), ['kind', 'why', 'more'])
  const any = [field('a', 'text'), field('b', 'text'), field('c', 'text', { logic: 'any', showIf: [{ field: 'a', op: 'filled' }, { field: 'b', op: 'contains', value: 'z' }] })]
  assert.equal(f.visibleFields(any, { b: 'xyz' }).length, 3)
  assert.equal(f.visibleFields(any, {}).length, 2)
  assert.equal(f.conditionHolds({ field: 'l', op: 'contains', value: 'b' }, { l: ['a', 'b'] }), true)
  assert.equal(f.conditionHolds({ field: 'c', op: 'eq', value: 'true' }, { c: true }), true)
})

test('answers are validated per type and cleaned', () => {
  const fields = [
    field('name', 'text', { required: true, min: 2 }), field('mail', 'email'), field('mobile', 'tel'), field('age', 'number', { min: 18, max: 99 }), field('site', 'url'),
    field('day', 'date'), field('stars', 'rating', { max: 5 }), field('pick', 'select', { options: ['a', 'b'] }), field('multi', 'checkboxes', { options: ['x', 'y', 'z'], max: 2 }), field('ok', 'checkbox'),
  ]
  const good = f.checkSubmission(fields, { name: ' Ali ', mail: 'A@B.org', mobile: '۰۹۱۲ ۳۴۵-۶۷۸۹', age: '۲۵', site: 'https://x.com/a', day: '2026-02-28', stars: 4, pick: 'a', multi: ['x', 'y'], ok: true })
  assert.deepEqual(plain(good.errors), {})
  assert.equal(good.values.name, 'Ali'); assert.equal(good.values.mail, 'a@b.org'); assert.equal(good.values.mobile, '09123456789'); assert.equal(good.values.age, '25'); assert.equal(good.values.stars, '4')
  const bad = (patch) => Object.keys(f.checkSubmission(fields, { name: 'Ali', ...patch }).errors)
  assert.deepEqual(bad({ name: 'A' }), ['name']); assert.deepEqual(bad({ mail: 'nope' }), ['mail']); assert.deepEqual(bad({ mobile: 'abc' }), ['mobile'])
  assert.deepEqual(bad({ age: '17' }), ['age']); assert.deepEqual(bad({ age: 'x' }), ['age']); assert.deepEqual(bad({ site: 'javascript:alert(1)' }), ['site'])
  assert.deepEqual(bad({ day: '2026-02-30' }), ['day']); assert.deepEqual(bad({ stars: 6 }), ['stars']); assert.deepEqual(bad({ pick: 'c' }), ['pick'])
  assert.deepEqual(bad({ multi: ['x', 'y', 'z'] }), ['multi'], 'over the choice limit'); assert.deepEqual(bad({ multi: ['q'] }), ['multi']); assert.deepEqual(bad({ ok: 'yes' }), ['ok'])
  assert.deepEqual(bad({ name: { a: 1 } }), ['name'], 'objects are refused')
  assert.throws(() => f.checkSubmission(fields, []), /معتبر/)
  assert.equal(Object.hasOwn(f.checkSubmission(fields, { name: 'Ali', injected: 1 }).values, 'injected'), false, 'only declared fields are kept')
})

test('hidden fields are neither required nor stored', () => {
  const fields = [field('kind', 'radio', { options: ['x', 'y'], required: true }), field('why', 'text', { required: true, showIf: [{ field: 'kind', op: 'eq', value: 'x' }] })]
  assert.deepEqual(plain(f.checkSubmission(fields, { kind: 'y', why: 'ignored' })), { values: { kind: 'y' }, errors: {} })
  assert.deepEqual(Object.keys(f.checkSubmission(fields, { kind: 'x' }).errors), ['why'])
})

test('file answers accept only stored upload names', () => {
  const fields = [field('cv', 'file', { required: true, max: 1 })]
  const id = '3f2b1c6e-1a2b-4c3d-8e9f-0123456789ab.pdf'
  assert.deepEqual(plain(f.checkSubmission(fields, { cv: [id] }).errors), {})
  assert.deepEqual(Object.keys(f.checkSubmission(fields, { cv: ['../../etc/passwd'] }).errors), ['cv'])
  assert.deepEqual(Object.keys(f.checkSubmission(fields, { cv: [] }).errors), ['cv'], 'required')
  assert.deepEqual(Object.keys(f.checkSubmission(fields, { cv: [id, id.replace('3f2b', '4f2b')] }).errors), ['cv'], 'over the limit')
})

test('legacy submissions keep working (first problem is thrown)', () => {
  const fields = [field('mail', 'email', { required: true })]
  assert.throws(() => f.validateSubmission(fields, {}), /الزامی/)
  assert.throws(() => f.validateSubmission(fields, { mail: 'bad' }), /ایمیل/)
  assert.deepEqual({ ...f.validateSubmission(fields, { mail: 'a@b.org' }) }, { mail: 'a@b.org' })
})

test('spam heuristic, schedule and public projection', () => {
  assert.equal(f.looksSpam({ m: 'see https://a.com https://b.com http://c.com' }, 3), true)
  assert.equal(f.looksSpam({ m: 'one https://a.com link' }, 3), false)
  assert.equal(f.looksSpam({ m: 'https://a.com https://b.com https://c.com' }, 0), false, 'off')
  const now = new Date('2026-06-01T12:00:00Z')
  const base = { opensAt: '', closesAt: '', maxSubmissions: 0 }
  assert.equal(f.formState(base, 5, now), 'open')
  assert.equal(f.formState({ ...base, opensAt: '2026-07-01T00:00:00Z' }, 0, now), 'soon')
  assert.equal(f.formState({ ...base, closesAt: '2026-05-01T00:00:00Z' }, 0, now), 'closed')
  assert.equal(f.formState({ ...base, maxSubmissions: 10 }, 10, now), 'full')
  assert.throws(() => f.normalizeSettings({ opensAt: '2026-02-01', closesAt: '2026-01-01' }), /پایان/)
  const pub = f.publicForm(f.normalizeForm(form([field('a', 'text')], { settings: { notifyEmails: ['boss@x.com'], autoReply: { enabled: true, body: 'secret text' }, spamLinks: 2, submitLabel: 'Go' } })))
  assert.deepEqual(pub.settings.notifyEmails, []); assert.equal(pub.settings.autoReply.body, ''); assert.equal(pub.settings.submitLabel, 'Go')
  assert.equal(JSON.stringify(pub).includes('boss@x.com'), false)
})

test('redirect addresses are limited to this site or http(s)', () => {
  assert.equal(f.safeRedirect('/thanks'), '/thanks')
  assert.equal(f.safeRedirect('https://example.com/done'), 'https://example.com/done')
  assert.equal(f.safeRedirect(''), '')
  for (const bad of ['//evil.com', 'javascript:alert(1)', 'data:text/html,x', 'ftp://x', '/a b']) assert.throws(() => f.safeRedirect(bad), bad)
})

test('CSV export escapes quotes, breaks and spreadsheet formulas', () => {
  const csv = f.toCsv([{ id: 'a', label: 'Name' }, { id: 'b', label: 'Tags' }], [{ id: 1, createdAt: '2026-01-01', status: 'NEW', user: '', answers: [{ id: 'a', label: 'Name', value: '=HYPERLINK("x")' }, { id: 'b', label: 'Tags', value: ['p', 'q, r'] }] }])
  assert.ok(csv.startsWith('﻿'))
  const lines = csv.trim().split('\r\n')
  assert.equal(lines.length, 2)
  assert.ok(lines[1].includes(`"'=HYPERLINK(""x"")"`), lines[1])
  assert.ok(lines[1].includes('"p، q, r"'), lines[1])
})

test('wiring: routes, pages, schema, migration and privacy of attachments', () => {
  const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
  for (const route of ['src/app/api/forms/[slug]/route.ts', 'src/app/api/forms/[slug]/upload/route.ts', 'src/app/api/admin/forms/route.ts', 'src/app/api/admin/forms/submissions/route.ts', 'src/app/api/admin/forms/files/route.ts']) assert.ok(fs.existsSync(path.join(root, route)), route)
  for (const schema of ['prisma/schema.prisma', 'prisma/schema.postgresql.prisma']) { const s = read(schema); assert.match(s, /model FormUpload /); assert.match(s, /settings\s+String/); assert.match(s, /status\s+String\s+@default\("NEW"\)/) }
  assert.ok(fs.readdirSync(path.join(root, 'prisma/migrations')).some((dir) => dir.endsWith('_form_builder')))
  // Attachments are served only to administrators, never inline-executable, and stored outside the public folder.
  const files = read('src/modules/site/server/http/admin/forms/files/route.ts')
  assert.match(files, /requirePerm/); assert.match(files, /nosniff/); assert.match(files, /sandbox/)
  assert.match(read('src/modules/forms/server/service.ts'), /'storage', 'forms'/)
  // Visitors never receive notification addresses: every public entry point projects the form first.
  for (const file of ['src/modules/site/server/pages/forms/[slug]/page.tsx', 'src/modules/site/server/pages/p/[slug]/page.tsx', 'src/modules/site/server/homepage.ts']) assert.match(read(file), /publicForm\(/, file)
  assert.match(read('src/modules/notifications/server/jobs-scheduler.ts'), /name: 'forms'/)
})

const source = (relative) => fs.readFileSync(path.resolve(root, relative), 'utf8')

test('the newer kinds of field check what they are for', () => {
  const fields = f.normalizeForm(form([
    field('mobile', 'mobile', { required: true }), field('nid', 'national'), field('hour', 'time'), field('level', 'slider', { min: 1, max: 10 }),
    field('pass', 'secret'), field('src', 'hidden', { value: 'campaign-a' }),
  ])).fields
  const ok = f.checkSubmission(fields, { mobile: '۰۹۱۲ ۱۲۳ ۴۵۶۷', nid: '0499370899', hour: '09:05', level: '7', pass: ' a b ', src: 'tampered' })
  assert.deepEqual(plain(ok.errors), {})
  assert.deepEqual(plain(ok.values), { mobile: '09121234567', nid: '0499370899', hour: '09:05', level: '7', pass: ' a b ', src: 'campaign-a' })
  assert.equal(f.checkSubmission(fields, { mobile: '+989121234567' }).values.mobile, '09121234567')
  const bad = plain(f.checkSubmission(fields, { mobile: '0812345', nid: '1234567890', hour: '25:00', level: '11' }).errors)
  assert.deepEqual(Object.keys(bad).sort(), ['hour', 'level', 'mobile', 'nid'])
  assert.equal(f.validNationalId('1111111111'), false)
  assert.equal(f.validNationalId('0499370899'), true)
})

test('a typed foreign amount is read, limited and normalised', () => {
  const [fx] = f.normalizeForm(form([field('amount', 'fxamount', { required: true, currencies: ['usd', 'EUR', 'XXX'], markupPercent: 5, markupFixed: 150000, min: 5, max: 2000 })])).fields
  assert.deepEqual(fx.currencies, ['USD', 'EUR'])
  assert.deepEqual(f.parseFxAnswer('1,200.5 usd'), { cents: 120050, currency: 'USD' })
  assert.deepEqual(f.parseFxAnswer('۴۹٫۹۹ EUR'), { cents: 4999, currency: 'EUR' })
  assert.equal(f.parseFxAnswer('abc USD'), null)
  assert.equal(f.checkSubmission([fx], { amount: '100 USD' }).values.amount, '100.00 USD')
  for (const value of ['4 USD', '2001 USD', '50 GBP', '10', '-5 USD', '1e3 USD']) assert.ok(f.checkSubmission([fx], { amount: value }).errors.amount, value)
})

test('the bill counts fixed costs, priced options and foreign amounts — only for what is shown', () => {
  const def = f.normalizeForm(form([
    field('amount', 'fxamount', { required: true, currencies: ['USD'], markupPercent: 5, markupFixed: 150000 }),
    field('speed', 'radio', { options: ['عادی', 'فوری'], prices: [0, 50000] }),
    field('extras', 'checkboxes', { options: ['الف', 'ب'], prices: [1000, 2000] }),
    field('fee', 'price', { amount: 30000, showIf: [{ field: 'speed', op: 'eq', value: 'فوری' }] }),
    field('total', 'total'),
  ], { settings: { payment: { enabled: true, label: 'پرداخت' } } }))
  assert.equal(def.settings.requireLogin, true, 'a paid form belongs to an account')
  const fx = (fieldDef, cents) => ({ amount: Math.round(cents / 100 * 100000 * (1 + fieldDef.markupPercent / 100)) + fieldDef.markupFixed, rate: 100000 })
  const urgent = f.priceLines(def.fields, { amount: '10.00 USD', speed: 'فوری', extras: ['الف', 'ب'] }, fx)
  assert.equal(urgent.total, 1050000 + 150000 + 50000 + 1000 + 2000 + 30000)
  const normal = f.priceLines(def.fields, { amount: '10.00 USD', speed: 'عادی' }, fx)
  assert.equal(normal.total, 1200000, 'a free option and a hidden fixed cost add nothing')
  assert.throws(() => f.priceLines(def.fields, { amount: '10.00 USD' }, () => null), /نرخ/)
  // Payment without anything priced is refused; visitors never get the margin or a hidden value.
  assert.throws(() => f.normalizeForm(form([field('name', 'text')], { settings: { payment: { enabled: true } } })), /قیمت‌دار/)
  const shown = f.publicForm(f.normalizeForm(form([field('amount', 'fxamount', { markupPercent: 9, markupFixed: 777 }), field('src', 'hidden', { value: 'secret-campaign' })])))
  assert.doesNotMatch(JSON.stringify(shown), /markupPercent|markupFixed|777|secret-campaign/)
  assert.equal(shown.settings.style.theme, 'card')
})

test('a form keeps a chosen look, and an unknown one falls back', () => {
  assert.deepEqual(f.normalizeStyle({ theme: 'glass', accent: '#0EA5E9', radius: 'round', density: 'compact', width: 'wide', progress: 'dots' }), { layout: 'classic', theme: 'glass', accent: '#0ea5e9', radius: 'round', density: 'compact', width: 'wide', progress: 'dots' })
  assert.deepEqual(f.normalizeStyle({ theme: 'x', accent: 'red;}', radius: 1 }), f.DEFAULT_STYLE)
})

test('a paid form is charged by the site checkout and worked on by staff', () => {
  const paid = source('src/modules/forms/server/paid.ts'), service = source('src/modules/forms/server/service.ts')
  const checkout = source('src/modules/checkout/server/checkout.ts'), jobs = source('src/modules/fulfillment/server/jobs.ts'), route = source('src/modules/site/server/http/admin/forms/submissions/route.ts')
  // The bill is the server's: on the page, on submit, and again at checkout with the rate of that moment.
  assert.match(service, /const bill = paid \? await billFor\(form, values\) : null/)
  assert.match(service, /payStatus: 'UNPAID'/)
  assert.match(paid, /const bill = await billFor\(form, valuesOf\(parse<StoredAnswer\[\]>\(row\.data, \[\]\)\)\)/)
  assert.match(paid, /findFirst\(\{ where: \{ id: submissionId, userId \}/, 'only the sender pays their own request')
  assert.match(checkout, /if \(formSubmissionId\) \{\s+try \{\s+const quote = await formCheckoutQuote\(formSubmissionId, command\.userId\)/)
  assert.match(checkout, /\[planId, productId, membershipPlanId, content, formSubmissionId\]\.filter\(Boolean\)\.length !== 1/)
  assert.match(checkout, /if \(code && formSubmissionId\) return fail\(409, 'PROMOTION_NOT_APPLICABLE'/)
  assert.match(checkout, /const kind = formSubmissionId \? 'FORM_PAID' :/)
  assert.match(jobs, /if \(meta\.kind === 'form'\) \{\s+return enqueueFulfillment\(\{ kind: 'FORM_PAID'/)
  // Paid exactly once, and only then does it reach staff.
  assert.match(paid, /updateMany\(\{ where: \{ id: submissionId, userId: order\.userId, payStatus: 'UNPAID' \}, data: \{ payStatus: 'PAID'/)
  assert.match(paid, /if \(row\.payStatus === 'UNPAID'\) throw new FormsError\('این درخواست هنوز پرداخت نشده است', 409\)/)
  // A password is stored apart and encrypted; reading it is recorded; it goes by itself a week after the work ends.
  assert.match(paid, /secrets: encryptDigitalDelivery\(JSON\.stringify\(/)
  assert.match(route, /const secrets = await revealSecrets\(one\)\s+await auditAdmin\(\{ req, actor: admin, action: 'forms\.secrets_reveal'/)
  assert.match(paid, /export const SECRET_KEEP_DAYS = 7/)
  assert.match(source('src/modules/notifications/server/jobs-scheduler.ts'), /eraseFinishedSecrets\(\)/)
  // Answers can be handled without the right to build pages; deleting stays with the builders.
  assert.match(route, /const staff = async \(req: NextRequest\) => await requirePerm\(req, 'cms\.pages'\) \|\| await requirePerm\(req, 'forms\.handle'\)/)
  assert.match(route.slice(route.indexOf('export async function DELETE')), /requirePerm\(req, 'cms\.pages'\)/)
  assert.ok(source('src/modules/identity/rbac.ts').includes("'forms.handle',"))
  const sql = source('prisma/migrations/20261228120000_form_payment_workflow/migration.sql')
  assert.match(sql, /CHECK \("payStatus" IN \('', 'UNPAID', 'PAID'\) AND \("payStatus" = '' OR "amountMinor" > 0\)\)/)
  assert.match(source('prisma/release-manifest.json'), /"20261228120000_form_payment_workflow"/)
  // The forum's board and the form builder no longer share a layout rule.
  assert.match(source('src/app/admin/forms/page.tsx'), /className="fb-layout fb-forms-layout"/)
  assert.match(source('src/app/forms-pro.css'), /\.fb-layout\.fb-forms-layout \{ grid-template-columns: minmax\(0, 1fr\); \}/)
})

// The advanced rules import the field rules; load them with that one alias resolved.
const adv = (() => {
  const code = ts.transpileModule(source('src/modules/forms/domain/advanced.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', code)((name) => (name === '@/modules/forms/domain/forms' ? f : require(name)), mod, mod.exports)
  return mod.exports
})()

test('an appointment field offers its turns, and repeating rows keep only what was filled', () => {
  const rule = { days: [6, 0, 1], from: '09:00', to: '10:30', minutes: 30, capacity: 2, horizon: 7 }
  assert.deepEqual(f.slotTimes(rule), ['09:00', '09:30', '10:00'])
  assert.deepEqual(f.slotTimes({ ...rule, minutes: 45 }), ['09:00', '09:45'], 'a turn that would end after closing is not offered')
  // 2026-10-17 is a Saturday (day 6); the rule opens Saturday, Sunday and Monday.
  assert.deepEqual(adv.slotDays(rule, '2026-10-14'), ['2026-10-17', '2026-10-18', '2026-10-19'])
  const fields = f.normalizeForm(form([field('turn', 'slot', { required: true, slot: rule }), field('rows', 'repeater', { columns: ['نام', 'تعداد'], min: 1, max: 2 }), field('day', 'jdate')])).fields
  assert.equal(fields[0].slot.capacity, 2)
  const ok = f.checkSubmission(fields, { turn: '2026-10-17 09:30', rows: [['سیب | سرخ', '۲'], ['', '']], day: '2026-10-20' })
  assert.deepEqual(plain(ok.errors), {})
  assert.deepEqual(plain(ok.values), { turn: '2026-10-17 09:30', rows: ['سیب   سرخ | ۲'], day: '2026-10-20' })
  for (const turn of ['2026-10-16 09:30', '2026-10-17 09:15', '2026-10-17 10:30', '2026-13-40 09:00', 'tomorrow']) assert.ok(f.checkSubmission(fields, { turn }).errors.turn, turn)
  assert.ok(f.checkSubmission(fields, { turn: '2026-10-17 09:00', rows: [['a', 'b'], ['c', 'd'], ['e', 'f']] }).errors.rows, 'more rows than allowed')
  assert.throws(() => f.normalizeForm(form([field('rows', 'repeater')])), /ستون/)
  assert.throws(() => f.normalizeForm(form([field('turn', 'slot', { slot: { from: '10:00', to: '09:00' } })])), /ساعت پایان/)
})

test('merge tags, conditional confirmations and notification recipients', () => {
  const answers = [{ id: 'name', label: 'نام', type: 'text', value: 'سارا' }, { id: 'email', label: 'ایمیل', type: 'email', value: 'Sara@Example.com' }, { id: 'pass', label: 'رمز', type: 'secret', value: f.SECRET_MASK }, { id: 'cv', label: 'رزومه', type: 'file', value: ['x.pdf'] }]
  const context = { formTitle: 'همکاری', entryId: 12, answers, total: 250000, score: { score: 3, max: 5 } }
  assert.equal(adv.mergeTags('سلام {field:name}، شمارهٔ {entry_id} در «{form_title}» — {total} — {score}{unknown}{field:nothing}{field:cv}', context), 'سلام سارا، شمارهٔ 12 در «همکاری» — ۲۵۰٬۰۰۰ تومان — ۳ از ۵{unknown}')
  const all = adv.mergeTags('{all_fields}', context)
  assert.match(all, /نام: سارا\nایمیل: Sara@Example\.com\nرمز: ••••••••\nرزومه: پیوست شد/)
  const settings = f.normalizeSettings({
    redirectUrl: '/thanks',
    confirmations: [{ message: 'فروش با شما تماس می‌گیرد', when: [{ field: 'topic', op: 'eq', value: 'فروش' }] }, { redirectUrl: '/vip', when: [{ field: 'vip', op: 'filled' }] }],
    notifications: [{ to: 'sales@example.com, {field:email}', when: [{ field: 'topic', op: 'eq', value: 'فروش' }] }, { to: 'all@example.com' }],
    webhooks: [{ url: 'https://example.com/hook', secret: 's', events: ['paid', 'nope'] }], handlers: [3, 3, 'x', 9],
  })
  assert.deepEqual(adv.pickConfirmation(settings, 'ثبت شد', { topic: 'فروش' }), { message: 'فروش با شما تماس می‌گیرد', redirectUrl: '' })
  assert.deepEqual(adv.pickConfirmation(settings, 'ثبت شد', { vip: 'بله' }), { message: 'ثبت شد', redirectUrl: '/vip' })
  assert.deepEqual(adv.pickConfirmation(settings, 'ثبت شد', {}), { message: 'ثبت شد', redirectUrl: '/thanks' })
  assert.deepEqual(adv.dueNotifications(settings, { topic: 'فروش' }).map((n) => n.to), ['sales@example.com, {field:email}', 'all@example.com'])
  assert.deepEqual(adv.dueNotifications(settings, { topic: 'x' }).map((n) => n.to), ['all@example.com'])
  assert.deepEqual(adv.recipients('sales@example.com, {field:email} {field:name}', answers), ['sales@example.com', 'sara@example.com'], 'only an e-mail field can name a recipient')
  assert.deepEqual(settings.webhooks, [{ url: 'https://example.com/hook', secret: 's', events: ['paid'] }])
  assert.deepEqual(settings.handlers, [3, 9])
  for (const url of ['http://example.com/x', 'https://user:pw@example.com/x', 'javascript:alert(1)']) assert.throws(() => f.normalizeSettings({ webhooks: [{ url }] }), /https/, url)
  assert.throws(() => f.normalizeSettings({ notifications: [{ to: 'someone' }] }), /گیرنده/)
  // Visitors never get the recipients, the hooks, the handlers or the quiz points.
  const shown = f.publicForm(f.normalizeForm(form([field('q', 'radio', { options: ['a', 'b'], scores: [1, 0] })], { settings: { ...settings, quiz: { enabled: true, passScore: 1 }, saveDraft: true } })))
  assert.doesNotMatch(JSON.stringify(shown), /sales@example|example\.com\/hook|"scores"|"handlers":\[3/)
  assert.equal(shown.settings.saveDraft, true)
  assert.equal(shown.settings.quiz.enabled, true)
})

test('quiz points and field statistics', () => {
  const fields = f.normalizeForm(form([field('a', 'radio', { options: ['x', 'y'], scores: [2, 0] }), field('b', 'checkboxes', { options: ['p', 'q', 'r'], scores: [1, 1, -1] }), field('c', 'radio', { options: ['m', 'n'], scores: [5, 0], showIf: [{ field: 'a', op: 'eq', value: 'y' }] }), field('r', 'rating')])).fields
  assert.deepEqual(adv.scoreOf(fields, { a: 'x', b: ['p', 'r'] }), { score: 2, max: 4 }, 'a hidden question counts for nothing')
  assert.deepEqual(adv.scoreOf(fields, { a: 'y', b: ['p', 'q'], c: 'm' }), { score: 7, max: 9 })
  const rows = [[{ id: 'a', label: '', value: 'x' }, { id: 'b', label: '', value: ['p', 'q'] }, { id: 'r', label: '', value: '4' }], [{ id: 'a', label: '', value: 'y' }, { id: 'r', label: '', value: '2' }], [{ id: 'a', label: '', value: 'x' }]]
  const stats = adv.fieldStats(fields, rows)
  assert.deepEqual(stats.find((s) => s.id === 'a').options, [{ label: 'x', count: 2 }, { label: 'y', count: 1 }])
  assert.deepEqual(stats.find((s) => s.id === 'b').options.map((o) => o.count), [1, 1, 0])
  const rating = stats.find((s) => s.id === 'r')
  assert.deepEqual([rating.answered, rating.average, rating.min, rating.max], [2, 3, 2, 4])
})

test('appointments cannot be overbooked, hooks go only to public https addresses, and a form may be given to named staff', () => {
  const server = source('src/modules/forms/server/advanced.ts'), service = source('src/modules/forms/server/service.ts'), paid = source('src/modules/forms/server/paid.ts')
  const route = source('src/modules/site/server/http/admin/forms/submissions/route.ts'), list = source('src/modules/site/server/http/admin/forms/route.ts')
  // The seat is taken in the answer's own transaction; the unique key refuses a second holder and the answer is tried again.
  for (const schema of ['prisma/schema.prisma', 'prisma/schema.postgresql.prisma']) assert.match(source(schema), /model FormBooking \{[\s\S]{0,900}@@unique\(\[formId, fieldId, slot, seat\]\)/, schema)
  assert.match(source('prisma/migrations/20261229120000_form_bookings_quiz/migration.sql'), /CREATE UNIQUE INDEX "FormBooking_formId_fieldId_slot_seat_key"/)
  assert.match(service, /if \(!spam\) await bookSlots\(tx, form, shown, values, created\.id\)/)
  assert.match(service, /if \(\(error as \{ code\?: string \}\)\.code !== 'P2002' \|\| attempt >= 3\) throw error/)
  assert.match(server, /if \(!seat\) throw new FormsError\(/)
  assert.match(paid, /if \(data\.stage === 'REJECTED'\) await releaseSlots\(row\.id\)/)
  // A webhook: https, a public address, no redirects, a time limit, signed.
  assert.match(server, /if \(url\.protocol !== 'https:'\) throw new Error\('webhook must be https'\)/)
  assert.match(server, /addresses\.some\(isPrivateAddress\)/)
  assert.match(server, /redirect: 'error', signal: AbortSignal\.timeout\(6000\)/)
  assert.match(server, /createHmac\('sha256', hook\.secret\)\.update\(body\)\.digest\('hex'\)/)
  // Staff corrections are recorded and keep money, turns, passwords and files as the sender gave them.
  assert.equal(adv.staffEditable({ type: 'text', options: [] }), true)
  for (const type of ['secret', 'slot', 'fxamount', 'file', 'signature', 'hidden', 'repeater']) assert.equal(adv.staffEditable({ type, options: [] }), false, type)
  assert.equal(adv.staffEditable({ type: 'radio', options: ['a'], prices: [100] }), false, 'a priced choice is part of the bill')
  assert.match(route, /const edited = await editSubmission\(one, body\.answers\)\s+await auditAdmin\(\{ req, actor: admin, action: 'forms\.submission_edit'/)
  // A form with named handlers: only they (and builders) see and work on it.
  assert.match(server, /export const mayHandle = \(form: Pick<FormDefinition, 'settings'>, user: \{ id: number \}, builder: boolean\) => builder \|\| !form\.settings\?\.handlers\.length \|\| form\.settings\.handlers\.includes\(user\.id\)/)
  assert.match(list, /\.filter\(\(form\) => mayHandle\(form, reader, Boolean\(builder\)\)\)/)
  assert.match(route, /await assertMayHandleForm\(formId, reader, builder\)/)
  assert.match(route, /await assertMayHandleSubmission\(id, admin, builder\)/)
  assert.match(paid, /if \(allowed\.length && !allowed\.includes\(member\.id\)\) throw new FormsError\(/)
  assert.match(source('prisma/release-manifest.json'), /"20261229120000_form_bookings_quiz"/)
})

test('work somebody holds is theirs: a colleague of the same standing reads it and does not change it', () => {
  const paid = source('src/modules/forms/server/paid.ts'), route = source('src/modules/site/server/http/admin/forms/submissions/route.ts'), files = source('src/modules/site/server/http/admin/forms/files/route.ts')
  // Form answers: every change of an answer passes the holder check, unless the actor manages forms.
  assert.match(paid, /export async function assertOwnWork\(submissionId: number, actor: \{ id: number \}, manager: boolean\) \{\s+if \(manager\) return/)
  assert.match(paid, /if \(row\.assigneeId && row\.assigneeId !== actor\.id\) throw new FormsError\(OTHERS_WORK, 403\)/)
  assert.match(paid, /if \(!manager && row\.assigneeId && row\.assigneeId !== actor\.id\) throw new FormsError\(OTHERS_WORK, 403\)/)
  assert.match(paid, /if \(!manager && patch\.assignTo !== undefined && Number\(patch\.assignTo\) !== actor\.id\) throw new FormsError\(/)
  assert.match(route, /\{ await assertMayHandleSubmission\(id, admin, builder\); await assertOwnWork\(id, admin, builder\) \}/)
  assert.match(route, /return ok\(await workOnSubmission\(one, admin, body\.work, builder\)\)/)
  // The check comes before any of the actions it guards.
  const patchBody = route.slice(route.indexOf('export async function PATCH'), route.indexOf('export async function DELETE'))
  for (const action of ['editSubmission(', 'workOnSubmission(', 'revealSecrets(', 'eraseSecrets(', 'updateSubmissions(']) assert.ok(patchBody.indexOf('assertOwnWork(') < patchBody.indexOf(action), action)
  // An operator opens the attachments of the forms given to them, and of no other.
  assert.match(files, /const reader = builder \|\| await requirePerm\(req, 'forms\.handle'\)/)
  assert.match(files, /await assertMayHandleForm\(file\.formId, reader, Boolean\(builder\)\)/)
  // The queue across forms is built from the forms the member of staff may handle.
  assert.match(route, /const formIds = \(await listForms\(\)\)\.filter\(\(form\) => mayHandle\(form, reader, builder\)\)\.map\(\(form\) => form\.id!\)/)
  // New work is announced to the form's own handlers when it names them.
  assert.match(source('src/modules/forms/server/service.ts'), /\.\.\.\(handlers\.length \? \{ id: \{ in: handlers \} \} : \{\}\)/)
  assert.match(paid, /export async function releaseUnpaidSlots\(/)

  // Tickets follow the same rule; an internal note stays open to colleagues, and the first to answer becomes the holder.
  const access = source('src/modules/support/server/department-access.ts'), adminTickets = source('src/modules/support/server/http/admin/tickets/route.ts'), reply = source('src/modules/support/server/http/tickets/[id]/route.ts')
  assert.match(access, /export const heldByAnother = \(user: AuthedUser, assignedToId: number \| null \| undefined\) => Boolean\(assignedToId\) && assignedToId !== user\.id && !managesTickets\(user\)/)
  assert.match(adminTickets, /if \(heldByAnother\(admin, existing\.assignedToId\)\) return err\(HELD_BY_ANOTHER, 403\)/)
  assert.match(adminTickets, /if \(hasAssignment && !managesTickets\(admin\) && b\.assignedToId != null && Number\(b\.assignedToId\) !== admin\.id\) return err\(/)
  assert.match(reply, /if \(body\?\.internal !== true && heldByAnother\(agent, ticket\.assignedToId\)\) return err\(HELD_BY_ANOTHER, 403\)/)
  assert.match(reply, /assignedToId: ticket\.assignedToId \?\? user\.id/)
})

test('automatic text messages have a ceiling, and a sign-in guess meets a limit on the account itself', () => {
  const sms = source('src/modules/sms/server/sms.ts')
  assert.match(sms, /export const SMS_DAILY_PER_PHONE = 12/)
  assert.match(sms, /if \(kind !== 'OTP' && !\['MANUAL', 'TEST'\]\.includes\(input\.event\)\) \{/)
  assert.match(sms, /if \(same > 0\) \{ await log\('SKIPPED'/)
  assert.match(sms, /if \(today >= SMS_DAILY_PER_PHONE\) \{ await log\('SKIPPED'/)
  // Nothing leaves while the panel is not set up: the ceiling sits after that refusal, before the provider call.
  assert.ok(sms.indexOf("if (!isReady(settings)) {") < sms.indexOf('SMS_DAILY_PER_PHONE) {') && sms.indexOf('SMS_DAILY_PER_PHONE) {') < sms.indexOf('await sendPattern(key'))
  // Only verified, opted-in numbers get alerts (as before).
  assert.match(sms, /!user\.smsAlerts \|\| !user\.phoneVerifiedAt/)
  const auth = source('src/modules/identity/auth.ts')
  assert.ok(auth.includes('rateLimitStrict(`login:account:${email}`, 30, 15 * 60_000)'))
  assert.ok(auth.indexOf('login:account:') < auth.indexOf('db.user.findUnique'), 'the limit is met before the password is looked at')
})

test('services are one list: forms and virtual products marked as a service, each shown to those who work on it', () => {
  assert.equal(f.normalizeSettings({ service: true }).service, true)
  assert.equal(f.normalizeSettings({}).service, false)
  const route = source('src/modules/site/server/http/admin/services/route.ts')
  assert.match(route, /if \(!handler && !orders && !catalog\) return err\('دسترسی مجاز نیست', 403\)/)
  assert.match(route, /\.filter\(\(form\) => form\.settings\?\.service && mayHandle\(form, handler, Boolean\(builder\)\)\)/)
  assert.match(route, /const products = orders \|\| catalog \? await db\.product\.findMany\(\{ where: \{ isService: true \}/)
  assert.match(source('src/modules/catalog/server/product-input.ts'), /if \(b\?\.isService !== undefined\) out\.isService = /)
  assert.doesNotMatch(source('src/modules/marketplace/server/marketplace/products.ts').match(/const SELLER_FIELDS = \[[^\]]+\]/)[0], /isService/)
  for (const schema of ['prisma/schema.prisma', 'prisma/schema.postgresql.prisma']) assert.match(source(schema), /isService    Boolean @default\(false\)/, schema)
  assert.match(source('prisma/migrations/20261230120000_product_is_service/migration.sql'), /ADD COLUMN "isService" BOOLEAN NOT NULL DEFAULT false/)
  assert.match(source('prisma/release-manifest.json'), /"20261230120000_product_is_service"/)
  assert.match(source('src/app/admin/layout.tsx'), /href: '\/admin\/services'[^\n]+perm: \['cms\.pages', 'forms\.handle', 'orders\.manage', 'cms\.products'\]/)
})

test('a form is given only to staff who can open form answers', () => {
  const server = source('src/modules/forms/server/advanced.ts'), service = source('src/modules/forms/server/service.ts'), paid = source('src/modules/forms/server/paid.ts')
  // The list offered: active accounts of the admin area that hold forms.handle or cms.pages, or every right.
  assert.match(server, /const held = row\.roleId == null \? null : parsePermissions\(row\.roleRef\?\.permissions \|\| ''\)/)
  assert.match(server, /if \(!manager && !held!\.includes\('forms\.handle'\)\) return \[\]/)
  // Saving a form checks its handlers against that list, before anything is written.
  assert.match(server, /export async function assertHandlersCanWork\(ids: number\[\]\)/)
  assert.ok(service.indexOf('await assertHandlersCanWork(form.settings?.handlers || [])') > -1 && service.indexOf('await assertHandlersCanWork(') < service.indexOf('db.siteForm.update({ where: { id: form.id }, data })'))
  // Work is handed only to somebody on that list.
  assert.match(paid, /\(await formStaff\(\)\)\.find\(\(person\) => person\.id === to\) \|\| null/)
})

test('the wallet takes toman and rial at their own limits, and says why a top-up is refused', () => {
  const topup = source('src/modules/wallet/server/topup.ts'), page = source('src/app/dashboard/wallet/page.tsx')
  assert.match(topup, /if \(currency === 'IRT' \|\| currency === 'TMN'\) return \{ min: 10_000, max: 500_000_000 \}/)
  assert.match(topup, /if \(currency === 'IRR'\) return \{ min: 100_000, max: 5_000_000_000 \}/)
  assert.match(topup, /const defaults = defaultLimits\(currency\)/)
  assert.match(page, /setError\(topupError\(data,isFa\)\|\|t\.errGeneric\)/)
  // Currencies are named: IRR the Iranian rial, IRT the Iranian toman.
  const money = source('src/shared/money/format.ts')
  assert.match(money, /IRT: \{ fa: 'تومان ایران', en: 'Iranian toman' \}/)
  assert.match(money, /IRR: \{ fa: 'ریال ایران', en: 'Iranian rial' \}/)
})

// ---- a form placed anywhere in written content (owner, 2026-10-28)
test('form shortcodes become placeholders, never inside code, never for a bad address', () => {
  const embed = load('src/modules/forms/domain/embed.ts')
  const box = (slug) => `<div class="mc-form-embed" data-mc-form="${slug}"></div>`
  assert.equal(embed.formShortcodes('<p>[form slug="contact"]</p>'), box('contact'))
  assert.equal(embed.formShortcodes('<p>پیش از [form contact] پس از</p>'), `<p>پیش از ${box('contact')} پس از</p>`)
  assert.equal(embed.formShortcodes('[فرم foreign-payment]'), box('foreign-payment'))
  assert.equal(embed.formShortcodes('[form slug=“contact”]'), box('contact'))
  assert.equal(embed.formShortcodes('<pre>[form slug="contact"]</pre>'), '<pre>[form slug="contact"]</pre>')
  assert.equal(embed.formShortcodes('<code>[form contact]</code> و [form contact]'), `<code>[form contact]</code> و ${box('contact')}`)
  for (const bad of ['[form slug="Contact"]', '[form slug="x"]', '[form slug="a<b>"]', '[form]']) assert.equal(embed.formShortcodes(bad), bad, bad)
  assert.equal(embed.formShortcodes('بدون کد'), 'بدون کد')
  assert.equal(embed.formShortcode('contact'), '[form slug="contact"]')
  // The editor's «فرم» block renders the same placeholder; GET /api/forms/<slug> gives only a published form's public view.
  const render = fs.readFileSync(path.resolve(root, 'src/modules/editor/domain/render.ts'), 'utf8')
  // The editor keeps its own copy (its domain imports nothing): the same address rule and the same placeholder.
  assert.ok(render.includes("case 'content.form': { const slug = String(p.form || ''); return /^[a-z][a-z0-9-]{1,79}$/.test(slug) ? `<div class=\"mc-form-embed\" data-mc-form=\"${slug}\"></div>` : '' }"))
  assert.equal(String(embed.FORM_SLUG), '/^[a-z][a-z0-9-]{1,79}$/')
  assert.equal(embed.formPlaceholder('contact'), box('contact'))
  assert.match(fs.readFileSync(path.resolve(root, 'src/modules/editor/domain/core-blocks.ts'), 'utf8'), /type: 'content\.form', version: 1/)
  const route = fs.readFileSync(path.resolve(root, 'src/modules/site/server/http/forms/[slug]/route.ts'), 'utf8')
  assert.match(route, /const found = await publicFormBySlug\(slug\)\s+if \(!found\) return err\('فرم پیدا نشد', 404\)\s+return ok\(\{ form: publicForm\(found\.form\), state: found\.state \}\)/)
  for (const page of ['src/modules/site/server/pages/p/[slug]/page.tsx', 'src/modules/site/server/pages/blog/[slug]/page.tsx']) assert.match(fs.readFileSync(path.resolve(root, page), 'utf8'), /formShortcodes\(/, page)
  assert.match(fs.readFileSync(path.resolve(root, 'src/app/layout.tsx'), 'utf8'), /<FormEmbeds \/>/)
})
