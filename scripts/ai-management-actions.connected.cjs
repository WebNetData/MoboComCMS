const assert = require('node:assert/strict')
const { randomUUID, randomBytes } = require('node:crypto')
const { PrismaClient } = require('@prisma/client')
const { NextRequest } = require('next/server')
const { encode } = require('next-auth/jwt')

if (!/test_/.test(new URL(process.env.DATABASE_URL || 'postgresql://invalid/invalid').pathname)) throw new Error('Disposable database required')
process.env.NEXTAUTH_SECRET = randomBytes(32).toString('hex')
process.env.NEXTAUTH_URL = 'https://mobocom.invalid'
const db = new PrismaClient()
const origin = process.env.NEXTAUTH_URL
const stamp = 'desk-actions-' + randomUUID()
const backups = new Map()
const users = []
let role, department, product, order, ticket, otherTicket

const loader = require('./connected-source-loader.cjs')
const common = { '@/platform/database/prisma': { db }, react: { ...require('react'), cache: fn => fn } }
const load = loader(common)
const { clearAdminPolicyCache } = load('src/modules/identity/server/access.ts')
const { reviewNow, reviewHistory, decideReview } = load('src/modules/ai/server/management-review.ts')
const { POST } = load('src/modules/ai/server/http/management-actions.ts')

async function main() {
  try {
    for (const [key, value] of [
      ['security.policy.v1', '{"requireAdmin2fa":false}'], ['extension.ai-assistant.state.v1', '{"enabled":true,"settings":{}}'], ['extension.store.state.v1', '{"enabled":true,"settings":{}}'],
    ]) {
      backups.set(key, await db.setting.findUnique({ where: { key } }))
      await db.setting.upsert({ where: { key }, update: { value }, create: { key, value } })
    }
    clearAdminPolicyCache()
    role = await db.role.create({ data: { name: stamp, permissions: 'tickets.handle,orders.manage' } })
    const createUser = async (name, staff) => {
      const user = await db.user.create({ data: { email: stamp + name + '@example.invalid', role: staff ? 'ADMIN' : 'CUSTOMER', roleId: staff ? role.id : null, passwordHash: '!' } })
      users.push(user.id)
      return user
    }
    const manager = await createUser('manager', true), specialist = await createUser('specialist', true), customer = await createUser('customer', false)
    const token = await encode({ secret: process.env.NEXTAUTH_SECRET, token: { uid: String(manager.id), authAt: Date.now() } })
    const request = (body, from = origin) => new NextRequest(origin + '/api/admin/ai/management/reviews/actions', {
      method: body ? 'POST' : 'GET', headers: { origin: from, 'content-type': 'application/json', cookie: '__Secure-next-auth.session-token=' + token },
      ...(body && { body: JSON.stringify(body) }),
    })
    const old = new Date(Date.now() - 172800000)
    department = await db.ticketDepartment.create({ data: { slug: stamp, nameFa: stamp, nameEn: stamp, roleIds: JSON.stringify([role.id]) } })
    ticket = await db.ticket.create({ data: { userId: customer.id, subject: 'private subject', department: stamp, assignedToId: manager.id, updatedAt: old } })
    otherTicket = await db.ticket.create({ data: { userId: customer.id, subject: 'other private subject', department: stamp, assignedToId: specialist.id, updatedAt: old } })
    product = await db.product.create({ data: { name: stamp, slug: stamp, stock: 1, price: 1000, priceMinor: 1000n } })
    order = await db.order.create({ data: { userId: customer.id, productId: product.id, status: 'PAID', totalMinor: 1000n, totalAmount: 1000 } })
    await db.productDelivery.create({ data: { orderId: order.id, status: 'PENDING', updatedAt: old } })
    await db.fulfillmentJob.create({ data: { orderId: order.id, kind: 'DELIVER_PRODUCT', status: 'FAILED', dedupeKey: stamp, lastError: 'secret=never-exposed' } })

    const latest = async () => (await reviewHistory(request())).reviews[0]
    const approve = async signalId => {
      const { id, version } = await latest()
      await decideReview(request(), { id, version, signalId, decision: 'APPROVED' })
    }
    const call = async (signalId, action, values = {}) => {
      const { id, version } = await latest()
      const result = await POST(request({ id, version, signalId, action, ...values }))
      return { status: result.status, body: await result.json() }
    }

    await reviewNow(request())
    assert.equal((await call('support.stale', 'targets')).status, 409)
    await approve('support.stale')
    const tickets = (await call('support.stale', 'targets')).body.targets
    const owned = tickets.find(item => item.id === String(ticket.id)), held = tickets.find(item => item.id === String(otherTicket.id))
    assert.deepEqual(owned.commands, ['TICKET_NOTE', 'TICKET_REPLY'])
    assert.deepEqual(held.commands, ['TICKET_NOTE'])
    assert.ok(!JSON.stringify(tickets).includes('private subject'))
    const support = { targetId: owned.id, stamp: owned.stamp, command: 'TICKET_REPLY', text: 'درخواست شما در حال بررسی است.' }
    const { id: reviewId, version: reviewVersion } = await latest()
    let modelCalls = 0
    const mockedAi = loader({ ...common, './client': { generate: async prompt => {
      modelCalls++
      assert.ok(!JSON.stringify(prompt).includes('private subject'))
      assert.ok(!JSON.stringify(prompt).includes(customer.email))
      return { text: JSON.stringify({ text: support.text }) }
    } } })
    const { suggestDeskAction } = mockedAi('src/modules/ai/server/management-actions.ts')
    const suggestion = { ...support, id: reviewId, version: reviewVersion, signalId: 'support.stale' }
    await assert.rejects(suggestDeskAction(request(), { ...suggestion, targetId: held.id, stamp: held.stamp }), error => error.status === 409)
    assert.equal(modelCalls, 0)
    assert.deepEqual(await suggestDeskAction(request(), suggestion), { text: support.text })
    assert.equal(modelCalls, 1)
    assert.equal((await call('support.stale', 'prepare', { ...support, targetId: held.id, stamp: held.stamp })).status, 409)
    assert.equal((await call('support.stale', 'prepare', support)).status, 200)
    assert.equal(await db.ticketMessage.count({ where: { ticketId: ticket.id } }), 0)
    assert.equal((await call('support.stale', 'execute', { confirmed: false })).status, 422)
    const draft = await latest()
    const submit = () => POST(request({ id: draft.id, version: draft.version, signalId: 'support.stale', action: 'execute', confirmed: true }))
    const race = await Promise.all([submit(), submit()])
    assert.deepEqual(race.map(response => response.status).sort(), [200, 409])
    assert.equal(await db.ticketMessage.count({ where: { ticketId: ticket.id, internal: false } }), 1)
    assert.equal((await db.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).status, 'PENDING')
    assert.equal(await db.userNotification.count({ where: { userId: customer.id, kind: 'TICKET_REPLY', href: '/dashboard/tickets/' + ticket.id } }), 1)

    await approve('store.fulfilment')
    const { targets, assignees } = (await call('store.fulfilment', 'targets')).body
    const selected = targets.find(item => item.id === String(order.id))
    assert.ok(selected.facts.some(text => text.includes('خطا')))
    assert.ok(!JSON.stringify(targets).includes('never-exposed'))
    assert.ok(assignees.some(item => item.id === specialist.id))
    const assignment = { targetId: selected.id, stamp: selected.stamp, command: 'ORDER_ASSIGN', assigneeId: specialist.id }
    assert.equal((await call('store.fulfilment', 'prepare', assignment)).status, 200)
    await db.order.updateMany({ where: { id: order.id, status: 'PAID' }, data: { assigneeId: manager.id } })
    assert.equal((await call('store.fulfilment', 'execute', { confirmed: true })).status, 409)
    const fresh = (await call('store.fulfilment', 'targets')).body.targets.find(item => item.id === String(order.id))
    assert.equal((await call('store.fulfilment', 'prepare', { ...assignment, stamp: fresh.stamp })).status, 200)
    assert.equal((await call('store.fulfilment', 'execute', { confirmed: true })).status, 200)
    assert.equal((await db.order.findUniqueOrThrow({ where: { id: order.id } })).assigneeId, specialist.id)
    assert.equal(await db.orderEvent.count({ where: { orderId: order.id, status: 'ASSIGNED' } }), 1)
    await reviewNow(request())
    await approve('support.stale')
    const internalTicket = (await call('support.stale', 'targets')).body.targets.find(item => item.id === String(otherTicket.id))
    assert.equal((await call('support.stale', 'prepare', { targetId: internalTicket.id, stamp: internalTicket.stamp, command: 'TICKET_NOTE', text: 'پیگیری داخلی تیکت' })).status, 200)
    assert.equal((await call('support.stale', 'execute', { confirmed: true })).status, 200)
    assert.equal(await db.ticketMessage.count({ where: { ticketId: otherTicket.id, internal: true } }), 1)
    assert.equal((await db.ticket.findUniqueOrThrow({ where: { id: otherTicket.id } })).status, 'OPEN')
    assert.equal(await db.userNotification.count({ where: { userId: customer.id, kind: 'TICKET_REPLY' } }), 1)

    await approve('store.fulfilment')
    const annotatedOrder = (await call('store.fulfilment', 'targets')).body.targets.find(item => item.id === String(order.id))
    const orderNote = 'پیگیری داخلی سفارش'
    assert.equal((await call('store.fulfilment', 'prepare', { targetId: annotatedOrder.id, stamp: annotatedOrder.stamp, command: 'ORDER_NOTE', text: orderNote })).status, 200)
    assert.equal((await call('store.fulfilment', 'execute', { confirmed: true })).status, 200)
    assert.equal(await db.orderEvent.count({ where: { orderId: order.id, note: orderNote, visible: false } }), 1)
    assert.equal(await db.auditLog.count({ where: { actorUserId: manager.id, action: 'ai.management.action_applied' } }), 4)
    console.log('Reviewed ticket replies and notes, store assignments and notes: scope, previews, stale records, confirmation, audit and once-only effects passed')
  } finally {
    if (order) {
      await db.orderEvent.deleteMany({ where: { orderId: order.id } })
      await db.fulfillmentJob.deleteMany({ where: { orderId: order.id } })
      await db.productDelivery.deleteMany({ where: { orderId: order.id } })
      await db.order.delete({ where: { id: order.id } })
    }
    if (product) await db.product.delete({ where: { id: product.id } })
    const ticketIds = [ticket?.id, otherTicket?.id].filter(Boolean)
    await db.ticketMessage.deleteMany({ where: { ticketId: { in: ticketIds } } })
    await db.ticket.deleteMany({ where: { id: { in: ticketIds } } })
    if (department) await db.ticketDepartment.delete({ where: { id: department.id } })
    await db.auditLog.deleteMany({ where: { actorUserId: { in: users } } })
    await db.userNotification.deleteMany({ where: { userId: { in: users } } })
    await db.user.deleteMany({ where: { id: { in: users } } })
    if (role) await db.role.delete({ where: { id: role.id } })
    for (const [key, row] of backups) {
      if (row) await db.setting.update({ where: { key }, data: { value: row.value } })
      else await db.setting.deleteMany({ where: { key } })
    }
    await db.$disconnect()
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
