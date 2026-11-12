// Actual Forms owners against disposable PostgreSQL rows. No SMS/provider request is sent.
const assert = require('node:assert/strict')
const { PrismaClient } = require('@prisma/client')
const { NextRequest } = require('next/server')
process.env.STORE_DELIVERY_KEY = require('node:crypto').randomBytes(32).toString('hex')

assert(/test|check/i.test(new URL(process.env.DATABASE_URL).pathname), 'disposable test database required')
const db = new PrismaClient()
const stamp = `counter-check-${Date.now().toString(36)}`
const users = [], roles = [], forms = []
let viewer = null
const load = require('./connected-source-loader.cjs')({
  '@/platform/database/prisma': { db },
  'next-auth/jwt': { getToken: async () => viewer ? { uid: viewer.id, authAt: new Date().toISOString() } : null },
  '@/extensions/server/modules': { isModuleEnabled: async () => true },
  '@/platform/observability/logger': { logEvent() {}, requestIdFrom: () => stamp },
  '@/modules/sms/server/sms': { notifyPhone: async () => {}, siteLink: async (route) => `http://site.invalid${route}` },
  react: { ...require('react'), cache: (fn) => fn },
})
const definitions = load('src/modules/forms/domain/forms.ts')
const service = load('src/modules/forms/server/service.ts')
const formApi = load('src/modules/site/server/http/admin/forms/route.ts')
const answersApi = load('src/modules/site/server/http/admin/forms/submissions/route.ts')
const counter = load('src/modules/forms/server/counter.ts')

async function user(label, permissions) {
  let roleId = null
  if (permissions) {
    const role = await db.role.create({ data: { name: `${stamp}-${label}`, permissions } })
    roles.push(role.id)
    roleId = role.id
  }
  const row = await db.user.create({ data: { name: label, email: `${stamp}-${label}@example.invalid`, passwordHash: 'fixture-only', role: 'ADMIN', roleId } })
  users.push(row.id)
  return row
}

async function call(handler, method, query = '', body) {
  const response = await handler(new NextRequest(`http://site.invalid/api/admin/forms${query}`, {
    method,
    headers: { Origin: 'http://site.invalid', 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }))
  return { status: response.status, body: await response.json() }
}

async function main() {
  const manager = await user('manager')
  const handler = await user('handler', 'dashboard.view,forms.handle')
  const other = await user('other', 'dashboard.view,forms.handle')
  const unrelated = await user('journal', 'dashboard.view,cms.posts')
  const repair = definitions.TEMPLATES.find((template) => template.id === 'mobile-repair').build()
  const form = await service.saveForm({ ...repair, slug: stamp, settings: { ...repair.settings, handlers: [handler.id] } })
  forms.push(form.id)
  const paid = await service.saveForm({ ...repair, slug: `${stamp}-paid`, fields: [...repair.fields, { id: 'price', type: 'price', label: 'هزینه', amount: 100 }], settings: { ...repair.settings, handlers: [handler.id], payment: { enabled: true } } })
  forms.push(paid.id)

  viewer = handler
  const listing = await call(formApi.GET, 'GET')
  assert.equal(listing.status, 200)
  assert.equal(listing.body.canBuild, false)
  assert.ok(listing.body.forms.some((item) => item.id === form.id && !item.published), 'saved drafts support counter intake')
  const lock = definitions.encodeDeviceLock({ kind: 'pin', pattern: [], text: '735192' })
  const values = { name: 'مشتری آزمایشی', mobile: `091${String(Date.now()).slice(-8)}`, brand: 'سامسونگ', model: 'Galaxy A54', issue: 'سخت‌افزاری', description: 'باتری شارژ نمی‌شود', handover: 'حضوری می‌آورم', consent: true, lock }
  const created = await call(answersApi.POST, 'POST', '/submissions', { formId: form.id, values })
  assert.equal(created.status, 200, JSON.stringify(created.body))
  const row = await db.formSubmission.findUniqueOrThrow({ where: { id: created.body.id } })
  assert.equal(row.source, 'STAFF')
  assert.equal(row.createdById, handler.id)
  assert.equal(row.assigneeId, handler.id)
  assert.equal(row.stage, 'RECEIVED')
  assert.ok(row.receivedAt)
  assert.match(row.pickupCode, /^\d{6}$/)
  assert.ok(row.receiptToken.length >= 20)
  assert.ok(row.userId, "staff phone links the canonical simple account")
  users.push(row.userId)
  assert.ok(row.secrets && !row.secrets.includes('735192'))
  assert.equal(JSON.parse(row.data).find((answer) => answer.id === 'lock').value, definitions.SECRET_MASK)

  const customer = await call(answersApi.GET, 'GET', `/submissions?receipt=${row.id}&copy=customer`)
  assert.equal(customer.status, 200)
  assert.deepEqual(customer.body.secrets, [])
  assert.ok(!JSON.stringify(customer.body).includes('735192'))
  const shop = await call(answersApi.GET, 'GET', `/submissions?receipt=${row.id}&copy=shop`)
  assert.equal(shop.status, 200)
  assert.ok(JSON.stringify(shop.body.secrets).includes('735192'))
  const publicReceipt = await counter.receiptByToken(row.receiptToken)
  assert.deepEqual(publicReceipt.secrets, [])
  assert.equal(await counter.receiptByToken('invalid'), null)
  assert.equal(await db.auditLog.count({ where: { actorUserId: handler.id, action: 'forms.staff_entry', targetId: String(row.id) } }), 1)
  assert.equal(await db.auditLog.count({ where: { actorUserId: handler.id, action: 'forms.receipt_shop', targetId: String(row.id) } }), 1)

  assert.equal((await call(answersApi.POST, 'POST', '/submissions', { formId: paid.id, values })).status, 400)
  assert.equal((await call(answersApi.POST, 'POST', '/submissions', { formId: form.id, values: {} })).status, 400)
  for (const forbidden of [other, unrelated, null]) {
    viewer = forbidden
    assert.equal((await call(answersApi.POST, 'POST', '/submissions', { formId: form.id, values })).status, 403)
    assert.equal((await call(answersApi.GET, 'GET', `/submissions?receipt=${row.id}&copy=shop`)).status, 403)
  }
  viewer = other
  assert.ok(!(await call(formApi.GET, 'GET')).body.forms.some((item) => item.id === form.id))
  viewer = manager
  assert.ok((await call(formApi.GET, 'GET')).body.forms.some((item) => item.id === form.id))
  assert.equal((await call(answersApi.GET, 'GET', `/submissions?receipt=${row.id}&copy=customer`)).status, 200)
  assert.equal(await db.formSubmission.count({ where: { formId: { in: forms } } }), 1, 'denied requests create no answers')
  console.log('PASS Forms counter: draft intake, assigned-handler/manager access, direct denials, paid/invalid refusal, sealed lock, customer/token privacy, shop receipt and audit')
}

main().finally(async () => {
  await db.siteForm.deleteMany({ where: { id: { in: forms } } })
  await db.auditLog.deleteMany({ where: { actorUserId: { in: users } } })
  await db.user.deleteMany({ where: { id: { in: users } } })
  await db.role.deleteMany({ where: { id: { in: roles } } })
  await db.$disconnect()
}).catch((error) => { console.error(error); process.exitCode = 1 })
