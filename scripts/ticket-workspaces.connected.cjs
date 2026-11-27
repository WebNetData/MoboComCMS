const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { PrismaClient } = require('@prisma/client')
const { NextRequest } = require('next/server')
const sourceLoader = require('./connected-source-loader.cjs')

const url = new URL(process.env.DATABASE_URL)
assert.match(url.protocol, /^postgres(?:ql)?:$/)
assert.match(url.pathname, /test|check/i, 'disposable PostgreSQL database required')

const db = new PrismaClient()
const stamp = randomUUID().slice(0, 12)
const users = []
const tickets = []
const departments = []
const services = []
const domains = []
const terminals = []
const merchants = []
const products = []
const orders = []
const lines = []
const warranties = []
const subscriptions = []
const settings = new Map()
let hostingProduct, tld, plan, tokenUserId = null

const load = sourceLoader({
  '@/platform/database/prisma': { db },
  'next-auth/jwt': { getToken: async ({ req }) => tokenUserId && req.headers.get('x-fixture-user') === String(tokenUserId) ? { uid: String(tokenUserId), authAt: Math.floor(Date.now() / 1000) } : null },
  '@/extensions/server/runtime': { emitExtensionEvent: async () => {} },
  '@/modules/automation/server/engine': { emitAutomation: async () => {} },
  '@/modules/sms/server/sms': { notifyAdmins: async () => {} },
})
const ticketsRoute = load('src/app/api/tickets/route.ts')

async function setting(key, value) {
  if (!settings.has(key)) settings.set(key, await db.setting.findUnique({ where: { key } }))
  await db.setting.upsert({ where: { key }, create: { key, value: JSON.stringify(value) }, update: { value: JSON.stringify(value) } })
}

function request(path, method = 'GET', body, userId = tokenUserId) {
  tokenUserId = userId
  const headers = { Origin: 'http://localhost', 'x-fixture-user': userId == null ? '' : String(userId) }
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: { ...headers, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

async function createUser(name) {
  const user = await db.user.create({ data: { email: `${stamp}-${name}@example.invalid`, name, passwordHash: 'fixture-only', role: 'USER', status: 'ACTIVE' } })
  users.push(user)
  return user
}

async function post(path, body, user = users[0]) {
  tokenUserId = user?.id ?? null
  return ticketsRoute.POST(request(path, 'POST', body, tokenUserId))
}

async function main() {
  try {
    const cloudUser = await createUser('cloud-owner')
    const foreignUser = await createUser('foreign-owner')
    const payUser = await createUser('pay-owner')
    const inactivePayUser = await createUser('inactive-pay')
    await Promise.all([
      setting('extension.hosting.state.v1', { enabled: true, settings: {} }),
      setting('extension.mobocom-pay.state.v1', { enabled: true, settings: {} }),
      setting('site.maintenance.v1', {}),
      setting('site.section-access.v1', {}),
    ])

    hostingProduct = await db.hostingProduct.create({ data: { slug: `${stamp}-cloud-product`, name: 'Ticket fixture server', kind: 'VPS' } })
    services.push(await db.hostingService.create({ data: { userId: cloudUser.id, productId: hostingProduct.id, cycle: 'MONTH', priceMinor: 100n, label: 'Cloud owner service' } }))
    services.push(await db.hostingService.create({ data: { userId: foreignUser.id, productId: hostingProduct.id, cycle: 'MONTH', priceMinor: 100n, label: 'Foreign cloud service' } }))
    const tldSuffix = `t${stamp.replace(/[^a-z0-9]/gi, '')}`
    tld = await db.domainTld.create({ data: { suffix: tldSuffix, registerMinor: 1n, renewMinor: 1n } })
    domains.push(await db.domain.create({ data: { userId: cloudUser.id, tldId: tld.id, name: `owner-${stamp}.${tldSuffix}`, renewMinor: 1n } }))
    domains.push(await db.domain.create({ data: { userId: foreignUser.id, tldId: tld.id, name: `foreign-${stamp}.${tldSuffix}`, renewMinor: 1n } }))

    const payOwner = await db.payMerchant.create({ data: { id: `${stamp}-merchant`, userId: payUser.id, name: 'Fixture merchant', website: 'https://merchant.invalid', status: 'ACTIVE' } })
    merchants.push(payOwner)
    const payForeign = await db.payMerchant.create({ data: { id: `${stamp}-foreign-merchant`, userId: foreignUser.id, name: 'Foreign merchant', website: 'https://foreign.invalid', status: 'ACTIVE' } })
    merchants.push(payForeign)
    merchants.push(await db.payMerchant.create({ data: { id: `${stamp}-inactive-merchant`, userId: inactivePayUser.id, name: 'Inactive merchant', website: 'https://inactive.invalid', status: 'SUSPENDED' } }))
    terminals.push(await db.payTerminal.create({ data: { id: `${stamp}-terminal`, merchantId: payOwner.id, name: 'Owner terminal', returnUrl: 'https://merchant.invalid/return' } }))
    terminals.push(await db.payTerminal.create({ data: { id: `${stamp}-foreign-terminal`, merchantId: payForeign.id, name: 'Foreign terminal', returnUrl: 'https://foreign.invalid/return' } }))

    const ownStoreProduct = await db.product.create({ data: { slug: `${stamp}-store-owned`, name: 'Owned store product', price: 10, priceMinor: 1000n, active: true } })
    const foreignStoreProduct = await db.product.create({ data: { slug: `${stamp}-store-foreign`, name: 'Foreign store product', price: 10, priceMinor: 1000n, active: true } })
    products.push(ownStoreProduct, foreignStoreProduct)
    const ownOrder = await db.order.create({ data: { userId: cloudUser.id, productId: ownStoreProduct.id, totalAmount: 10, totalMinor: 1000n, currency: 'IRT', status: 'PAID' } })
    const foreignOrder = await db.order.create({ data: { userId: foreignUser.id, productId: foreignStoreProduct.id, totalAmount: 10, totalMinor: 1000n, currency: 'IRT', status: 'PAID' } })
    orders.push(ownOrder, foreignOrder)
    const warrantyOrder = await db.order.create({ data: { userId: foreignUser.id, totalAmount: 10, totalMinor: 1000n, currency: 'IRT', status: 'PAID' } })
    orders.push(warrantyOrder)
    const warrantyLine = await db.orderLine.create({ data: { orderId: warrantyOrder.id, productId: foreignStoreProduct.id, line: 0, name: 'Foreign warranty product', kind: 'PHYSICAL' } })
    lines.push(warrantyLine)
    const warranty = await db.storeWarrantyDevice.create({ data: {
      orderLineId: warrantyLine.id, unitIndex: 0, warrantyStartsAt: new Date(), warrantyEndsAt: new Date(Date.now() + 86_400_000),
      provider: 'fixture', conditions: 'fixture only', createdById: foreignUser.id, updatedById: foreignUser.id,
    } })
    warranties.push(warranty)

    plan = await db.plan.create({ data: { name: 'Ticket fixture plan', trafficGB: 1, days: 30, price: 1, priceMinor: 100n, currency: 'IRT', active: true } })
    subscriptions.push(await db.subscription.create({ data: {
      userId: foreignUser.id, planId: plan.id, username: 'foreign-fixture', expiresAt: new Date(Date.now() + 86_400_000), subToken: `${stamp}-foreign-sub`,
    } }))

    const general = await db.ticketDepartment.create({ data: { slug: `TICKET-GENERAL-${stamp}`, nameFa: 'تست عمومی', nameEn: 'General fixture', active: true } })
    const store = await db.ticketDepartment.create({ data: { slug: `TICKET-STORE-${stamp}`, nameFa: 'تست فروشگاه', nameEn: 'Store fixture', active: true, requiresProduct: true } })
    const subscription = await db.ticketDepartment.create({ data: { slug: `TICKET-SUB-${stamp}`, nameFa: 'تست اشتراک', nameEn: 'Subscription fixture', active: true, requiresSubscription: true } })
    departments.push(general, store, subscription)

    tokenUserId = null
    assert.equal((await ticketsRoute.GET(request('/api/tickets?workspace=cloud&view=options', 'GET', undefined, null))).status, 401)
    tokenUserId = cloudUser.id
    const cloudOptionsResponse = await ticketsRoute.GET(request('/api/tickets?workspace=cloud&view=options'))
    assert.equal(cloudOptionsResponse.status, 200)
    const cloudOptions = await cloudOptionsResponse.json()
    assert.deepEqual(new Set(cloudOptions.services.map(row => row.key)), new Set([`cloud-service:${services[0].id}`, `cloud-domain:${domains[0].id}`]))
    for (const key of ['subscriptions', 'products', 'orders', 'warrantyDevices']) assert.deepEqual(cloudOptions[key], [], `Cloud workspace must not expose account ${key}`)
    assert(cloudOptions.departments.some(row => row.slug === general.slug))
    assert(!cloudOptions.departments.some(row => row.slug === store.slug || row.slug === subscription.slug))

    const payOptionsResponse = await ticketsRoute.GET(request('/api/tickets?workspace=pay&view=options', 'GET', undefined, payUser.id))
    assert.equal(payOptionsResponse.status, 200)
    const payOptions = await payOptionsResponse.json()
    assert.deepEqual(payOptions.services.map(row => row.key), [`pay-terminal:${terminals[0].id}`])
    for (const key of ['subscriptions', 'products', 'orders', 'warrantyDevices']) assert.deepEqual(payOptions[key], [])
    const inactivePay = await ticketsRoute.GET(request('/api/tickets?workspace=pay&view=options', 'GET', undefined, inactivePayUser.id))
    assert.equal(inactivePay.status, 403)

    const validCloudResponse = await post(`/api/tickets?workspace=cloud`, { subject: 'Cloud support', message: 'Please check service', department: general.slug, serviceKey: `cloud-service:${services[0].id}` }, cloudUser)
    assert.equal(validCloudResponse.status, 200)
    const cloudTicketId = (await validCloudResponse.json()).id
    tickets.push(cloudTicketId)
    const persistedCloudTicket = await db.ticket.findUniqueOrThrow({ where: { id: cloudTicketId } })
    assert.deepEqual(JSON.parse(persistedCloudTicket.serviceContext), { key: `cloud-service:${services[0].id}`, label: 'Cloud owner service' })
    assert.equal(persistedCloudTicket.orderId, null); assert.equal(persistedCloudTicket.productId, null); assert.equal(persistedCloudTicket.subscriptionId, null); assert.equal(persistedCloudTicket.storeWarrantyDeviceId, null)

    for (const key of ['orderId', 'productId', 'subscriptionId', 'storeWarrantyDeviceId']) {
      const response = await post('/api/tickets?workspace=cloud', { subject: `Reject ${key}`, message: 'Must stay in workspace', department: general.slug, serviceKey: `cloud-service:${services[0].id}`, [key]: 2147483647 }, cloudUser)
      assert.equal(response.status, 422, `Cloud must reject account field ${key}`)
    }
    for (const [workspace, key] of [
      ['cloud', `cloud-service:${services[1].id}`], ['cloud', `cloud-domain:${domains[1].id}`], ['cloud', `pay-terminal:${terminals[0].id}`], ['pay', `pay-terminal:${terminals[1].id}`], ['pay', `cloud-service:${services[0].id}`],
    ]) {
      const response = await post(`/api/tickets?workspace=${workspace}`, { subject: 'Reject foreign service', message: 'Foreign ID', department: general.slug, serviceKey: key }, workspace === 'pay' ? payUser : cloudUser)
      assert.equal(response.status, 404, `Workspace ${workspace} must reject ${key}`)
    }
    const malformed = await post('/api/tickets?workspace=cloud', { subject: 'Malformed service', message: 'Bad key', department: general.slug, serviceKey: 'cloud-service:01' }, cloudUser)
    assert.equal(malformed.status, 422)
    const unknownPayTerminal = await post('/api/tickets?workspace=pay', { subject: 'Unknown terminal', message: 'Bad terminal', department: general.slug, serviceKey: `pay-terminal:${stamp}-missing` }, payUser)
    assert.equal(unknownPayTerminal.status, 404)

    const legacyOptionsResponse = await ticketsRoute.GET(request('/api/tickets?view=options', 'GET', undefined, cloudUser.id))
    assert.equal(legacyOptionsResponse.status, 200)
    const legacyOptions = await legacyOptionsResponse.json()
    assert(legacyOptions.products.some(row => row.id === ownStoreProduct.id))
    assert(legacyOptions.orders.some(row => row.id === ownOrder.id))
    assert(!Object.hasOwn(legacyOptions, 'services'))
    const legacyStoreResponse = await post('/api/tickets', { subject: 'Store support', message: 'Please check order', department: store.slug, productId: ownStoreProduct.id }, cloudUser)
    assert.equal(legacyStoreResponse.status, 200)
    const legacyStoreTicketId = (await legacyStoreResponse.json()).id
    tickets.push(legacyStoreTicketId)
    const legacyStoreTicket = await db.ticket.findUniqueOrThrow({ where: { id: legacyStoreTicketId } })
    assert.equal(legacyStoreTicket.orderId, ownOrder.id); assert.equal(legacyStoreTicket.productId, ownStoreProduct.id); assert.equal(legacyStoreTicket.serviceContext, '')

    assert.equal((await post('/api/tickets', { subject: 'Forged key', message: 'Wrong surface', department: general.slug, serviceKey: `cloud-service:${services[0].id}` }, cloudUser)).status, 422)
    const ignoredContextResponse = await post('/api/tickets', { subject: 'Forged context', message: 'Must not persist', department: general.slug, serviceContext: { key: `cloud-service:${services[0].id}`, label: 'Forged label' } }, cloudUser)
    assert.equal(ignoredContextResponse.status, 200)
    const ignoredContextId = (await ignoredContextResponse.json()).id; tickets.push(ignoredContextId)
    assert.equal((await db.ticket.findUniqueOrThrow({ where: { id: ignoredContextId } })).serviceContext, '')
    assert.equal((await post('/api/tickets', { subject: 'Foreign product', message: 'No purchase', department: store.slug, productId: foreignStoreProduct.id }, cloudUser)).status, 404)
    assert.equal((await post('/api/tickets', { subject: 'Foreign order', message: 'Not owned', department: general.slug, orderId: foreignOrder.id }, cloudUser)).status, 404)
    assert.equal((await post('/api/tickets', { subject: 'Mismatched product', message: 'Not in order', department: general.slug, orderId: ownOrder.id, productId: foreignStoreProduct.id }, cloudUser)).status, 400)
    assert.equal((await post('/api/tickets', { subject: 'Foreign warranty', message: 'Not owned', department: general.slug, storeWarrantyDeviceId: warranty.id }, cloudUser)).status, 404)
    assert.equal((await post('/api/tickets', { subject: 'Foreign subscription', message: 'Not owned', department: subscription.slug, subscriptionId: subscriptions[0].id }, cloudUser)).status, 404)
    assert.equal((await post('/api/tickets', { subject: 'Invalid subscription', message: 'Bad ID', department: subscription.slug, subscriptionId: -1 }, cloudUser)).status, 400)

    console.log('Ticket workspace connected checks passed')
  } finally {
    try {
      if (tickets.length) {
        await db.ticketMessage.deleteMany({ where: { ticketId: { in: tickets } } })
        await db.ticket.deleteMany({ where: { id: { in: tickets } } })
      }
      if (warranties.length) await db.storeWarrantyDevice.deleteMany({ where: { id: { in: warranties.map(row => row.id) } } })
      if (lines.length) await db.orderLine.deleteMany({ where: { id: { in: lines.map(row => row.id) } } })
      if (orders.length) await db.order.deleteMany({ where: { id: { in: orders.map(row => row.id) } } })
      if (subscriptions.length) await db.subscription.deleteMany({ where: { id: { in: subscriptions.map(row => row.id) } } })
      if (plan) await db.plan.deleteMany({ where: { id: plan.id } })
      if (terminals.length) await db.payTerminal.deleteMany({ where: { id: { in: terminals.map(row => row.id) } } })
      if (merchants.length) await db.payMerchant.deleteMany({ where: { id: { in: merchants.map(row => row.id) } } })
      if (services.length) await db.hostingService.deleteMany({ where: { id: { in: services.map(row => row.id) } } })
      if (domains.length) await db.domain.deleteMany({ where: { id: { in: domains.map(row => row.id) } } })
      for (const department of departments) await db.ticketDepartment.deleteMany({ where: { id: department.id } })
      if (tld) await db.domainTld.deleteMany({ where: { id: tld.id } })
      if (hostingProduct) await db.hostingProduct.deleteMany({ where: { id: hostingProduct.id } })
      if (products.length) await db.product.deleteMany({ where: { id: { in: products.map(row => row.id) } } })
      if (users.length) await db.user.deleteMany({ where: { id: { in: users.map(row => row.id) } } })
      for (const [key, previous] of settings) {
        if (previous) await db.setting.upsert({ where: { key }, create: previous, update: { value: previous.value } })
        else await db.setting.deleteMany({ where: { key } })
      }
    } finally {
      delete globalThis.__mobocomSectionAccess
      await db.$disconnect()
    }
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
