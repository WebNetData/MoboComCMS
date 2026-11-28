const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { PrismaClient } = require('@prisma/client')
const { NextRequest } = require('next/server')
const sourceLoader = require('./connected-source-loader.cjs')

const database = new URL(process.env.DATABASE_URL)
assert.match(database.protocol, /^postgres(?:ql)?:$/)
assert.match(database.pathname, /test|check/i, 'disposable PostgreSQL database required')
if (process.getuid) assert.notEqual(process.getuid(), 0, 'run connected checks as a non-root user')

const db = new PrismaClient()
const stamp = `expert-${randomUUID()}`
const ids = { users: [], roles: [], orders: [] }
const load = sourceLoader({
  '@/platform/database/prisma': { db },
  'next-auth/jwt': { getToken: async ({ req }) => ({ uid: req.headers.get('x-fixture-user'), authAt: Date.now() }) },
})
const storeRoute = load('src/app/api/admin/store/orders/[id]/expert-ticket/route.ts')
const formRoute = load('src/app/api/admin/forms/submissions/[id]/expert-ticket/route.ts')
const ticketsRoute = load('src/app/api/tickets/[id]/route.ts')
const { assignOrder } = load('src/modules/store/server/order-work.ts')
const { transitionOrder } = load('src/modules/store/server/orders.ts')
const { myRequests, workOnSubmission } = load('src/modules/forms/server/paid.ts')
const { TEMPLATES } = load('src/modules/forms/domain/forms.ts')
const base = 'http://localhost'

const where = {
  store: id => `/api/admin/store/orders/${id}/expert-ticket`,
  form: id => `/api/admin/forms/submissions/${id}/expert-ticket`,
  ticket: id => `/api/tickets/${id}?asCustomer=1`,
}
async function request(route, url, id, user, body) {
  const method = body === undefined ? 'GET' : 'POST'
  const res = await route[method](new NextRequest(base + url(id), {
    method, headers: { origin: base, 'x-fixture-user': String(user.id), 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }), { params: Promise.resolve({ id: String(id) }) })
  return { status: res.status, data: await res.json() }
}

async function user(name, permissions) {
  const role = permissions ? await db.role.create({ data: { name: `${stamp}-${name}`, permissions } }) : null
  if (role) ids.roles.push(role.id)
  const person = await db.user.create({
    data: { email: `${stamp}-${name}@example.invalid`, name, role: role ? 'ADMIN' : 'CUSTOMER', roleId: role?.id, passwordHash: 'fixture-only', status: 'ACTIVE', totpEnabledAt: role ? new Date() : null },
  })
  ids.users.push(person.id)
  return person
}

async function order(userId, productId) {
  const row = await db.order.create({ data: { userId, productId, status: 'PAID', currency: 'IRT', totalAmount: 3000, totalMinor: 3000n } })
  ids.orders.push(row.id)
  if (productId) await db.productDelivery.create({ data: { orderId: row.id } })
  return row
}

async function main() {
  const [buyer, stranger, specialist, colleague] = await Promise.all([
    user('buyer'), user('stranger'), user('specialist', 'store.orders.handle,forms.handle'), user('colleague', 'store.orders.handle,forms.handle'),
  ])
  const product = await db.product.create({ data: { slug: stamp, name: 'Virtual service', kind: 'VIRTUAL', price: 3000, priceMinor: 3000n } })
  ids.product = product.id
  const [shop, paid] = await Promise.all([order(buyer.id, product.id), order(buyer.id)])
  const foreign = TEMPLATES.find(t => t.id === 'foreign-payment').build()
  assert.equal(foreign.fields.some(field => field.type === 'secret'), false, 'foreign-payment preset must not request credentials')
  const form = await db.siteForm.create({ data: { slug: stamp, title: 'Paid foreign site request', fields: JSON.stringify(foreign.fields), settings: JSON.stringify({ ...foreign.settings, handlers: [specialist.id, colleague.id] }) } })
  ids.form = form.id
  const submission = await db.formSubmission.create({
    data: { formId: form.id, userId: buyer.id, orderId: paid.id, payStatus: 'PAID', paidAt: new Date(), amountMinor: paid.totalMinor, currency: paid.currency, stage: 'OPEN', data: '[]' },
  })
  const scope = { actorId: specialist.id, manager: false }
  const callStore = (actor, body) => request(storeRoute, where.store, shop.id, actor, body)
  const callForm = (actor, body) => request(formRoute, where.form, submission.id, actor, body)
  const verification = { purpose: 'verification', version: null }

  assert.equal((await callStore(specialist, verification)).status, 403, 'unassigned store order')
  assert.equal((await callForm(specialist, verification)).status, 403, 'unassigned paid form')
  await assignOrder(shop.id, specialist.id, scope)
  await workOnSubmission(submission.id, specialist, { take: true })
  assert.equal((await callStore(colleague)).status, 403, 'other specialist cannot read store work')
  assert.equal((await callForm(colleague, verification)).status, 403, 'other named specialist cannot write form work')
  assert.equal((await callStore(specialist)).data.ticket, null, 'taking an order alone creates no ticket')
  assert.equal((await callForm(specialist)).data.ticket, null, 'taking a form alone creates no ticket')

  assert.equal((await callForm(specialist, { purpose: 'detail', message: 'کد تأیید را بفرستید', version: null })).status, 400)
  const twoOpenings = await Promise.all([callStore(specialist, verification), callStore(specialist, verification)])
  const storeTicket = twoOpenings.find(result => result.status === 200)?.data.ticket
  assert.ok(storeTicket)
  for (const result of twoOpenings) {
    assert.ok([200, 409].includes(result.status), JSON.stringify(result))
    if (result.status === 200) assert.equal(result.data.ticket.id, storeTicket.id)
  }
  const repeatStore = await callStore(specialist, verification)
  assert.equal(repeatStore.data.ticket.id, storeTicket.id)
  assert.equal(repeatStore.data.ticket.messages.length, 1)
  assert.equal(await db.ticket.count({ where: { expertRequestKey: `store:${shop.id}`, userId: buyer.id, orderId: shop.id } }), 1)
  const formTicket = (await callForm(specialist, { purpose: 'detail', message: 'نام طرح مورد نظر را اعلام کنید.', version: null })).data.ticket
  assert.ok(formTicket)
  assert.equal((await myRequests(buyer.id)).find(row => row.id === submission.id).expertTicketId, formTicket.id)
  assert.equal((await request(ticketsRoute, where.ticket, storeTicket.id, stranger)).status, 403)
  const read = await request(ticketsRoute, where.ticket, storeTicket.id, buyer)
  assert.equal(read.data.expertRequest, 'store')
  assert.equal(read.data.order.id, shop.id)
  assert.match(read.data.messages[0].body, /برنامه یا سایت اصلی سرویس/)
  assert.equal((await request(ticketsRoute, where.ticket, formTicket.id, buyer)).data.expertRequest, 'form')
  const reply = message => request(ticketsRoute, where.ticket, storeTicket.id, buyer, { message, asCustomer: true })
  assert.equal((await reply('۱۲۳۴۵۶')).status, 422)
  assert.equal((await reply('تأیید را در سایت انجام دادم.')).status, 200)
  assert.equal((await callStore(specialist, { purpose: 'detail', message: 'از همکاری شما متشکریم.', version: storeTicket.version })).status, 409, 'stale revision')
  const latest = (await callStore(specialist)).data.ticket
  assert.equal(latest.status, 'OPEN')
  assert.equal(latest.messages.length, 2)
  const followed = await callStore(specialist, { purpose: 'detail', message: 'از همکاری شما متشکریم.', version: latest.version })
  assert.equal(followed.status, 200)
  assert.equal(followed.data.ticket.messages.length, 3)
  assert.equal(await db.userNotification.count({ where: { userId: buyer.id, href: `/dashboard/tickets/${storeTicket.id}` } }), 2)

  await workOnSubmission(submission.id, specialist, { stage: 'DONE' })
  assert.equal((await callForm(specialist, verification)).status, 409, 'completed form cannot send new messages')
  await transitionOrder({ orderId: shop.id, scope, actorId: specialist.id, to: 'PROCESSING', notify: false })
  await transitionOrder({ orderId: shop.id, scope, actorId: specialist.id, to: 'DELIVERED', notify: false })
  assert.equal((await callStore(specialist, verification)).status, 409, 'delivered order cannot send new messages')
  assert.equal((await callStore(specialist)).data.ticket.id, storeTicket.id, 'existing ticket still visible after delivery')
  console.log('Expert order tickets: two scoped queues, optional one-ticket claim, safe 2FA reply, notification, completion and account isolation passed')
}

async function cleanup() {
  if (ids.form) await db.siteForm.delete({ where: { id: ids.form } })
  const notes = await db.userNotification.findMany({ where: { userId: { in: ids.users } }, select: { id: true } })
  await db.backgroundJob.deleteMany({ where: { dedupeKey: { in: notes.flatMap(row => ['sms', 'email', 'push'].map(channel => `notification:${row.id}:${channel}`)) } } })
  await db.userNotification.deleteMany({ where: { userId: { in: ids.users } } })
  await db.auditLog.deleteMany({ where: { actorUserId: { in: ids.users } } })
  const tickets = await db.ticket.findMany({ where: { orderId: { in: ids.orders } }, select: { id: true } })
  await db.ticketMessage.deleteMany({ where: { ticketId: { in: tickets.map(ticket => ticket.id) } } })
  await db.ticket.deleteMany({ where: { id: { in: tickets.map(ticket => ticket.id) } } })
  await db.orderEvent.deleteMany({ where: { orderId: { in: ids.orders } } })
  await db.order.deleteMany({ where: { id: { in: ids.orders } } })
  if (ids.product) await db.product.delete({ where: { id: ids.product } })
  await db.user.deleteMany({ where: { id: { in: ids.users } } })
  await db.role.deleteMany({ where: { id: { in: ids.roles } } })
}

main().catch(error => { console.error(error); process.exitCode = 1 })
  .finally(async () => {
    try { await cleanup() } catch (error) { console.error(error); process.exitCode = 1 } finally { await db.$disconnect() }
  })
