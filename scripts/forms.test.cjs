const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

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
