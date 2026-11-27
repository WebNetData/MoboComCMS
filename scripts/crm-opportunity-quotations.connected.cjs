// Connected opportunity/quotation regression. All records are disposable and no provider is contacted.
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { PrismaClient } = require('@prisma/client')
const { NextRequest } = require('next/server')

assert(/test|check/i.test(new URL(process.env.DATABASE_URL).pathname), 'use an isolated test database')
if (process.getuid) assert.notEqual(process.getuid(), 0, 'run as a non-root user')
const db = new PrismaClient()
const stamp = 'crm-quote-' + randomUUID().slice(0, 12)
const users = [], roles = [], products = [], quotes = [], opportunities = [], orders = []
const enabled = { livechat: true, store: true }
const load = require('./connected-source-loader.cjs')({
  '@/platform/database/prisma': { db },
  react: { ...require('react'), cache: fn => fn },
  'next-auth/jwt': { getToken: async ({ req }) => ({ uid: req.headers.get('x-fixture-user'), authAt: Date.now() }) },
  '@/platform/config/env': { authSecret: () => 'crm-quote-check-fixture-only' },
  '@/extensions/server/modules': {
    moduleGuard: async id => enabled[id] === false ? new Response(null, { status: 404 }) : null,
    isModuleEnabled: async id => enabled[id] !== false,
  },
})
const api = load('src/modules/livechat/server/http/crm-opportunity-quotations.ts')
const opportunityApi = load('src/modules/livechat/server/http/crm-opportunities.ts')
const { deliverQuotationReminder } = load('src/modules/livechat/server/crm-opportunities/quotation-reminders.ts')

async function person(name, permissions, extra = {}) {
  let roleId
  if (permissions) {
    const role = await db.role.create({ data: { name: `${stamp}-${name}`, permissions } })
    roleId = role.id
    roles.push(role.id)
  }
  const user = await db.user.create({ data: {
    name, email: `${stamp}-${name}@example.invalid`, passwordHash: '!',
    ...(permissions ? { role: 'ADMIN', roleId } : {}), ...extra,
  } })
  users.push(user.id)
  return user
}

function req(actor, path, method = 'GET', body) {
  return new NextRequest(`http://localhost/api/admin/crm/${path}`, {
    method,
    headers: { Origin: 'http://localhost', 'x-fixture-user': String(actor?.id ?? ''), 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
}
const invoke = (method, actor, query = '', body) =>
  api[method](req(actor, `opportunity-quotations${query ? '?' + query : ''}`, method, body))
const list = (actor, query = '') => opportunityApi.GET(req(actor, `opportunities${query ? '?' + query : ''}`))
async function expect(response, status) {
  const body = await response.json().catch(() => null)
  assert.equal(response.status, status, JSON.stringify(body))
  return body
}
async function opportunity(user, assignee, title, amountMinor = 1500n) {
  const row = await db.crmOpportunity.create({ data: {
    userId: user.id, assigneeId: assignee.id, createdById: assignee.id,
    title, amountMinor, currency: 'IRT',
  } })
  opportunities.push(row.id)
  return row
}

async function main() {
  const manager = await person('manager', null, { role: 'ADMIN' })
  const holder = await person('holder', 'tickets.handle,orders.manage')
  const colleague = await person('colleague', 'tickets.handle,orders.manage')
  const crmOnly = await person('crm-only', 'tickets.handle')
  const storeOnly = await person('store-only', 'orders.manage')
  const customer = await person('buyer')
  const other = await person('other')
  const product = await db.product.create({ data: {
    slug: stamp, name: 'کالای پیش‌فاکتور آزمایشی', sku: stamp, kind: 'PHYSICAL',
    currency: 'IRT', price: 1000, priceMinor: 1000n, costMinor: 500n,
    stock: 20, active: true, approval: 'APPROVED',
  } })
  products.push(product.id)
  const first = await opportunity(customer, holder, 'فرصت اول')
  const second = await opportunity(customer, holder, 'فرصت دوم', 2500n)
  const input = {
    op: 'create', opportunityId: first.id, version: first.version, title: 'پیشنهاد آزمون',
    discount: '100', expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    lines: [{ productId: product.id, variantId: null, quantity: 2, unitMinor: '1' }],
  }

  assert.equal((await invoke('GET', customer, `opportunityId=${first.id}`)).status, 403)
  assert.equal((await invoke('GET', crmOnly, `opportunityId=${first.id}`)).status, 403)
  assert.equal((await invoke('GET', storeOnly, `opportunityId=${first.id}`)).status, 403)
  assert([403,404].includes((await invoke('GET', colleague, `opportunityId=${first.id}`)).status))
  assert([403,404].includes((await invoke('POST', colleague, '', input)).status))
  assert.equal((await invoke('POST', crmOnly, '', input)).status, 403)
  assert.equal((await invoke('POST', storeOnly, '', input)).status, 403)
  assert.equal((await invoke('POST', holder, '', { ...input, userId: other.id })).status, 409)
  assert.equal((await invoke('POST', holder, '', { ...input, version: first.version + 1 })).status, 409)
  assert.equal((await invoke('POST', holder, '', { ...input, discount: '0.5' })).status, 400)
  enabled.store = false
  assert.equal((await invoke('GET', holder, `opportunityId=${first.id}`)).status, 404)
  assert.equal((await invoke('POST', holder, '', input)).status, 404)
  enabled.store = true
  enabled.livechat = false
  assert.equal((await invoke('GET', holder, `opportunityId=${first.id}`)).status, 404)
  assert.equal((await invoke('POST', holder, '', input)).status, 404)
  enabled.livechat = true

  const results = await Promise.all([invoke('POST', holder, '', input), invoke('POST', holder, '', input)])
  assert.deepEqual(results.map(r => r.status).sort(), [201, 409], 'one concurrent create wins')
  const created = await results.find(r => r.status === 201).json()
  quotes.push(created.id)
  const row = await db.storeQuotation.findUniqueOrThrow({ where: { id: created.id } })
  assert.equal(row.userId, customer.id, 'quotation stays with opportunity customer')
  assert.equal(row.subtotalMinor, 2000n, 'server product price overrides submitted unit price')
  assert.equal(row.discountMinor, 100n)
  assert.equal(row.currency, 'IRT')
  assert.equal(await db.order.count({ where: { userId: customer.id } }), 0)
  assert.equal((await db.product.findUniqueOrThrow({ where: { id: product.id } })).stock, 20)
  assert.equal(await db.crmOpportunityQuotation.count({ where: { opportunityId: first.id, quotationId: row.id } }), 1)
  const view = await expect(await invoke('GET', holder, `opportunityId=${first.id}`), 200)
  assert.equal(view.rows.length, 1)
  assert(!JSON.stringify(view).includes(row.token), 'unshared token remains private')
  assert.equal(await db.userNotification.count({ where: { dedupeKey: `crm:quotation-share:${row.id}` } }), 0)
  assert.equal((await invoke('POST', holder, '', { op: 'share', opportunityId: first.id, quotationId: row.id })).status, 400)
  assert.equal(await db.userNotification.count({ where: { dedupeKey: `crm:quotation-share:${row.id}` } }), 0)

  const share = { op: 'share', opportunityId: first.id, quotationId: row.id, confirmed: true }
  const shared = await Promise.all([invoke('POST', holder, '', share), invoke('POST', holder, '', share)])
  assert.deepEqual(shared.map(response => response.status), [200, 200])
  const link = await db.crmOpportunityQuotation.findUniqueOrThrow({ where: { quotationId: row.id } })
  assert(link.sharedAt)
  const notice = await db.userNotification.findUniqueOrThrow({ where: { dedupeKey: `crm:quotation-share:${row.id}` } })
  assert.equal(notice.userId, customer.id)
  assert.equal(notice.deliveryChannels, '-')
  assert.equal(await db.userNotification.count({ where: { dedupeKey: `crm:quotation-share:${row.id}` } }), 1)
  assert.equal(await db.backgroundJob.count({ where: { kind: 'notification.deliver', payload: { contains: `"notificationId":${notice.id},` } } }), 0)
  const jobs = await db.backgroundJob.findMany({ where: { kind: 'crm.quotation-reminder', payload: { contains: `"quotationId":${row.id}` } } })
  assert(jobs.length >= 1 && jobs.length <= 2, 'bounded reminder jobs')
  assert(jobs.every(job => !job.payload.includes(row.token)))
  const reread = await expect(await invoke('GET', manager, `opportunityId=${first.id}`), 200)
  assert.equal(reread.rows[0].id, row.id)
  assert(reread.rows[0].sharedAt)

  const secondVersion = (await db.crmOpportunity.findUniqueOrThrow({ where: { id: second.id } })).version
  const madeSecond = await expect(await invoke('POST', holder, '', { ...input, opportunityId: second.id, version: secondVersion }), 201)
  quotes.push(madeSecond.id)
  await expect(await invoke('POST', holder, '', { op:'share', opportunityId:second.id, quotationId:madeSecond.id, confirmed:true }), 200)
  const waitingJob = await db.backgroundJob.findFirstOrThrow({ where: {
    kind:'crm.quotation-reminder', dedupeKey:`crm:quotation-reminder:${madeSecond.id}:waiting`,
  } })
  const waiting = JSON.parse(waitingJob.payload)
  assert.equal((await deliverQuotationReminder(waiting, new Date(waitingJob.runAt.getTime() - 1000))).skipped, 'early')
  enabled.store = false
  assert.equal((await deliverQuotationReminder(waiting, waitingJob.runAt)).skipped, 'disabled')
  enabled.store = true
  const staffRole = await db.role.findUniqueOrThrow({ where:{ id:holder.roleId } })
  await db.role.update({ where:{ id:holder.roleId }, data:{ permissions:'tickets.handle' } })
  assert.equal((await deliverQuotationReminder(waiting, waitingJob.runAt)).skipped, 'ineligible')
  await db.role.update({ where:{ id:holder.roleId }, data:{ permissions:staffRole.permissions } })
  assert.deepEqual(await deliverQuotationReminder(waiting, waitingJob.runAt), { delivered:true })
  assert.deepEqual(await deliverQuotationReminder(waiting, waitingJob.runAt), { delivered:true })
  const staffNotice = await db.userNotification.findUniqueOrThrow({ where:{
    dedupeKey:`crm:quotation-reminder:${madeSecond.id}:waiting`,
  } })
  assert.equal(staffNotice.userId, holder.id)
  assert.equal(staffNotice.deliveryChannels, '-')
  assert.equal(await db.userNotification.count({ where:{ dedupeKey:staffNotice.dedupeKey } }), 1)
  const expiredAt = new Date(Date.now() - 1000)
  const changedExpiry = await db.storeQuotation.updateMany({
    where:{ id:madeSecond.id, status:'OPEN', orderId:null }, data:{ expiresAt:expiredAt },
  })
  assert.equal(changedExpiry.count, 1)
  assert.equal((await deliverQuotationReminder(waiting, new Date())).skipped, 'changed')
  const expired = await expect(await invoke('GET', holder, `opportunityId=${second.id}`), 200)
  assert.equal(expired.rows[0].status, 'EXPIRED')
  assert.equal(expired.canCreate, true)
  const replacement = await expect(await invoke('POST', holder, '', { ...input, opportunityId: second.id, version: secondVersion }), 201)
  quotes.push(replacement.id)
  assert.equal((await expect(await invoke('GET', holder, `opportunityId=${second.id}`), 200)).rows.length, 2)
  const order = await db.order.create({ data: { userId: customer.id, totalAmount: 19, totalMinor: 1900n, currency: 'IRT', status: 'PENDING' } })
  orders.push(order.id)
  const attached = await db.storeQuotation.updateMany({
    where: { id: row.id, status: 'OPEN', orderId: null },
    data: { status: 'CONVERTED', orderId: order.id, convertedAt: new Date() },
  })
  assert.equal(attached.count, 1)
  let report = await expect(await list(holder, `userId=${customer.id}`), 200)
  assert.equal(report.commerce.opportunities, 2)
  assert.equal(report.commerce.paidOpportunities, 0, 'pending orders are excluded')
  const paid = await db.order.updateMany({ where: { id: order.id, status: 'PENDING' }, data: { status: 'PAID' } })
  assert.equal(paid.count, 1)
  report = await expect(await list(holder, `userId=${customer.id}`), 200)
  assert.equal(report.commerce.opportunities, 2)
  assert.equal(report.commerce.paidOpportunities, 1)
  assert.equal(report.commerce.conversionRate, 50)
  assert.deepEqual(report.commerce.totals, [{ currency: 'IRT', estimatedMinor: '1500', paidMinor: '1900' }])
  const restrictedReport = await expect(await list(crmOnly, `userId=${customer.id}`), 200)
  assert.equal(restrictedReport.commerce ?? null, null)
  const reminderPayload = JSON.parse(jobs[0].payload)
  const notificationKey = `crm:quotation-reminder:${row.id}:${reminderPayload.kind}`
  assert.equal((await deliverQuotationReminder(reminderPayload, new Date(Date.now() + 4 * 86400000))).skipped, 'changed')
  assert.equal(await db.userNotification.count({ where: { dedupeKey: notificationKey } }), 0, 'converted quote sends no reminder')
  assert.equal((await invoke('POST', holder, '', share)).status, 200, 'sharing an already shared quotation is idempotent')
  assert.equal(await db.storeQuotation.count({ where: { userId: other.id, id: row.id } }), 0)
  console.log('CRM quotation PostgreSQL passed: authorization, atomic creation/share, exact price, customer inbox, scoped payment report and converted reminder')
}

main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => {
  try {
    for (const quoteId of quotes) {
      const keys = [`crm:quotation-reminder:${quoteId}:waiting`, `crm:quotation-reminder:${quoteId}:expiry`]
      await db.backgroundJob.deleteMany({ where: { kind: 'crm.quotation-reminder', dedupeKey: { in: keys } } })
      await db.userNotification.deleteMany({ where: { dedupeKey: { in: [...keys, `crm:quotation-share:${quoteId}`] }, userId: { in: users } } })
    }
    await db.crmOpportunityQuotation.deleteMany({ where: { opportunityId: { in: opportunities } } })
    await db.storeQuotation.deleteMany({ where: { id: { in: quotes } } })
    await db.order.deleteMany({ where: { id: { in: orders } } })
    await db.crmOpportunity.deleteMany({ where: { id: { in: opportunities } } })
    await db.product.deleteMany({ where: { id: { in: products } } })
    await db.auditLog.deleteMany({ where: { actorUserId: { in: users } } })
    await db.user.deleteMany({ where: { id: { in: users } } })
    await db.role.deleteMany({ where: { id: { in: roles } } })
  } finally { await db.$disconnect() }
})
