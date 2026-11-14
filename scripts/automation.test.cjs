const { test } = require('node:test')
require('./crm-engagement.cases.cjs')
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
const a = load('src/modules/automation/domain/automation.ts')
const rule = (extra = {}) => ({ name: 'R', trigger: 'form.submitted', actions: [{ type: 'notify_user', params: { title: 'سلام {user_name}' } }], ...extra })
const refuses = (input, pattern) => assert.throws(() => a.normalizeRule(input), (error) => error instanceof a.AutomationError && pattern.test(error.message))

test('every ready-made rule is valid as it is', () => {
  assert.ok(a.RECIPES.length >= 10)
  for (const recipe of a.RECIPES) assert.doesNotThrow(() => a.normalizeRule(recipe.rule), recipe.id)
  for (const trigger of a.TRIGGERS) assert.ok(['event', 'scan', 'schedule'].includes(trigger.kind), trigger.id)
})

test('a rule needs a name, a known trigger and at least one action', () => {
  refuses(rule({ name: ' ' }), /نام قانون/)
  refuses(rule({ trigger: 'nope' }), /رویداد شروع/)
  refuses(rule({ actions: [] }), /دست‌کم یک اقدام/)
  refuses(rule({ actions: [{ type: 'rm_rf', params: {} }] }), /ناشناخته/)
})

test('conditions only use what the trigger knows; numbers only compare numbers', () => {
  refuses(rule({ conditions: [{ field: 'password', op: 'eq', value: 'x' }] }), /ندارد/)
  refuses(rule({ conditions: [{ field: 'form_slug', op: 'gte', value: '3' }] }), /عدد نیست/)
  const ok = a.normalizeRule(rule({ conditions: [{ field: 'amount', op: 'gte', value: '100' }, { field: 'form_slug', op: 'bogus', value: 'x' }] }))
  assert.equal(ok.conditions[1].op, 'eq', 'an unknown operator falls back to equals')
})

test('actions must fit the trigger and carry what they need', () => {
  refuses(rule({ trigger: 'stock.low', actions: [{ type: 'notify_user', params: { title: 't' } }] }), /کاربری می‌خواهد/)
  refuses(rule({ trigger: 'ticket.opened', actions: [{ type: 'assign_form', params: {} }] }), /جور نیست/)
  refuses(rule({ actions: [{ type: 'webhook', params: { url: 'http://example.com/x' } }] }), /https/)
  refuses(rule({ actions: [{ type: 'webhook', params: { url: 'https://u:p@example.com/x' } }] }), /https/)
  refuses(rule({ actions: [{ type: 'discount_user', params: { percent: '95', days: '7', text: '{code}' } }] }), /۱ تا ۹۰/)
  refuses(rule({ actions: [{ type: 'discount_user', params: { percent: '10', days: '7', text: 'بدون کد' } }] }), /\{code\}/)
  refuses(rule({ actions: [{ type: 'email_staff', params: { to: 'not-mail', subject: 's', text: 't' } }] }), /ایمیل/)
  refuses(rule({ actions: [{ type: 'notify_user', params: { title: 't', href: 'https://evil.example' } }] }), /مسیر سایت/)
  refuses(rule({ actions: [{ type: 'notify_user', params: { title: 't', href: '//evil.example' } }] }), /مسیر سایت/)
  refuses(rule({ actions: [{ type: 'notify_staff', params: { to: 'managers' } }] }), /عنوان/)
  const staff = a.normalizeRule(rule({ actions: [{ type: 'notify_staff', params: { to: 'everyone', title: 't' } }] }))
  assert.equal(staff.actions[0].params.to, 'managers', 'an unknown audience falls back to the managers')
})

test('limits: waits are clamped, lists are capped, control characters are dropped', () => {
  const scan = a.normalizeRule({ name: 'x\u0000y', trigger: 'ticket.waiting', wait: 100000, actions: [{ type: 'notify_staff', params: { to: 'support', title: 't' } }] })
  assert.equal(scan.name, 'xy')
  assert.equal(scan.wait, a.triggerOf('ticket.waiting').wait.max)
  const many = a.normalizeRule(rule({ actions: Array.from({ length: 20 }, () => ({ type: 'notify_user', params: { title: 't' } })) }))
  assert.equal(many.actions.length, 8)
})

test('conditions: all or any, case-insensitive text, numbers as numbers', () => {
  const facts = { form_slug: 'Visa-Pay', amount: 250 }
  assert.equal(a.conditionsHold([], 'all', facts), true)
  assert.equal(a.conditionsHold([{ field: 'form_slug', op: 'eq', value: 'visa-pay' }], 'all', facts), true)
  assert.equal(a.conditionsHold([{ field: 'amount', op: 'gte', value: '300' }, { field: 'form_slug', op: 'contains', value: 'visa' }], 'all', facts), false)
  assert.equal(a.conditionsHold([{ field: 'amount', op: 'gte', value: '300' }, { field: 'form_slug', op: 'contains', value: 'visa' }], 'any', facts), true)
  assert.equal(a.conditionsHold([{ field: 'missing', op: 'lte', value: '5' }], 'all', facts), false, 'a missing number never passes')
})

test('messages fill tags and never show a raw or unknown tag', () => {
  assert.equal(a.renderMessage('سلام {user_name}، {nope}کد {code}', { user_name: 'علی', code: 'MC1' }), 'سلام علی، کد MC1')
  assert.equal(a.renderMessage('{__proto__}{constructor}', {}), '')
})

test('a rule runs once per event, once per subject for a scan, again only after its cooldown', () => {
  const now = new Date('2026-10-14T10:00:00Z'), hourAgo = new Date(now.getTime() - 3_600_000)
  assert.equal(a.mayRunAgain(null, 0, 'scan', now), true)
  assert.equal(a.mayRunAgain(hourAgo, 0, 'scan', now), false)
  assert.equal(a.mayRunAgain(hourAgo, 2, 'scan', now), false)
  assert.equal(a.mayRunAgain(hourAgo, 1, 'scan', now), true)
  assert.equal(a.mayRunAgain(hourAgo, 0, 'event', now), true)
})

test('run subjects read as words', () => {
  assert.equal(a.subjectLabel('ticket:10:1791952394362'), 'تیکت #10')
  assert.equal(a.subjectLabel('form:44'), 'درخواست #44')
  assert.equal(a.subjectLabel('site:report.daily:2026-10-14'), 'گزارش سایت')
  assert.equal(a.subjectLabel('odd'), 'odd')
})

test('the engine is wired: permission, scheduler, events, safeguards', () => {
  assert.match(read('src/modules/identity/rbac.ts'), /CORE_ADDED_LATER[^\n]*'automation\.manage'/)
  assert.match(read('src/modules/notifications/server/jobs-scheduler.ts'), /processAutomation/)
  const engine = read('src/modules/automation/server/engine.ts')
  assert.match(engine, /item\.trigger === event\.name && since\.get\(item\.id!\)! <= event\.createdAt\.getTime\(\)/, 'a rule never answers an event older than itself')
  assert.match(engine, /updateMany\(\{ where: \{ id: event\.id, processedAt: null \}/, 'events are claimed once')
  assert.match(read('src/modules/automation/server/http/admin.ts'), /automation\.manage/)
  assert.match(read('src/modules/billing/server/billing.ts'), /emitAutomation\('order\.paid'/)
  assert.match(read('src/modules/forms/server/service.ts'), /emitAutomation\(name, `form:/)
  assert.match(read('src/modules/identity/server/http/register/route.ts'), /emitAutomation\('user\.registered'/)
  assert.match(read('src/modules/support/server/create-ticket.ts'), /emitAutomation\('ticket\.opened'/, 'the canonical ticket creation service announces new tickets')
})
