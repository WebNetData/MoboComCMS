const assert = require('node:assert/strict')
const { PrismaClient } = require('@prisma/client')
const loadSource = require('./connected-source-loader.cjs')
const db = new PrismaClient()
const stamp = `cloud-workspace-${Date.now()}-${process.pid}`
const users = [], settings = new Map(), topupInvoiceIds = []
let token = null, product, tld, gateway
const mocks = {
  '@/platform/database/prisma': { db },
  'next-auth/jwt': { getToken: async () => token }, // Session boundary only; requireUser resolves current DB state.
  'next/headers': { headers: async () => new Headers() },
  '@/platform/cache/kv': { cached: async (_key, _ttl, fn) => fn(), invalidate: async () => {} },
}
const load = loadSource(mocks)
const surface = load('src/modules/checkout/domain/surface.ts')
const access = load('src/modules/hosting/server/workspace-access.ts')
const workspace = load('src/modules/hosting/server/workspace.ts')
const renewalWorkspace = load('src/modules/hosting/server/renewal-workspace.ts')
const put = async (key, value) => {
  if (!settings.has(key)) settings.set(key, await db.setting.findUnique({ where: { key } }))
  await db.setting.upsert({ where: { key }, create: { key, value: JSON.stringify(value) }, update: { value: JSON.stringify(value) } })
}
const denied = async status => assert.rejects(access.cloudWorkspaceUser({}), error => error instanceof access.CloudWorkspaceError && error.status === status)
async function order(userId, invoiceUserId, meta, index) {
  const row = await db.order.create({ data: { userId, totalAmount: 1, totalMinor: 1n, currency: 'IRT', meta, idempotencyKey: `${stamp}-${index}` } })
  const invoice = await db.invoice.create({ data: { userId: invoiceUserId, orderId: row.id, number: `${stamp}-${index}`, total: 1, totalMinor: 1n, currency: 'IRT', title: 'Cloud test', detail: 'private-detail', notes: 'private-note' } })
  return { row, invoice }
}

async function verifyRenewals() {
  const [owner, other] = users
  const now = new Date('2026-11-28T10:00:00.000Z')
  const nextDueAt = new Date('2026-12-02T10:00:00.000Z')
  const wrongTerm = new Date('2026-11-02T10:00:00.000Z')
  const service = (userId, suffix, overrides) => db.hostingService.create({
    data: { userId, productId: product.id, label: `${stamp}-renewal-${suffix}`, cycle: 'MONTH',
      priceMinor: 100n, status: 'ACTIVE', startedAt: wrongTerm, nextDueAt, ...overrides },
  })
  const [payable, paid, noInvoice, hourly, later, foreign] = await Promise.all([
    service(owner.id, 'payable', { nextDueAt: new Date('2026-11-27T10:00:00.000Z'), status: 'SUSPENDED' }),
    service(owner.id, 'paid'),
    service(owner.id, 'new'),
    service(owner.id, 'hourly', { cycle: 'HOURLY' }),
    service(owner.id, 'later', { nextDueAt: new Date('2026-12-29T10:00:00.000Z') }),
    service(other.id, 'foreign'),
  ])
  const renewMeta = (row, dueAt = row.nextDueAt, kind = 'hosting-renewal') =>
    JSON.stringify({ kind, serviceId: row.id, dueAt: dueAt.toISOString() }, null, 2)
  const valid = await order(owner.id, owner.id, renewMeta(payable), 'renewal-open')
  const accepted = await order(owner.id, owner.id, renewMeta(paid), 'renewal-paid')
  await db.$transaction([
    db.order.update({ where: { id: accepted.row.id }, data: { status: 'PAID' } }),
    db.invoice.update({ where: { id: accepted.invoice.id }, data: { status: 'PAID' } }),
  ])
  const obsolete = await order(owner.id, owner.id, renewMeta(noInvoice), 'renewal-expired')
  await db.invoice.update({ where: { id: obsolete.invoice.id }, data: { expiresAt: now } })
  await order(owner.id, owner.id, renewMeta(paid), 'renewal-newer-unpaid')
  await order(owner.id, owner.id, renewMeta(payable, wrongTerm), 'renewal-old-term')
  await order(owner.id, owner.id, renewMeta(payable, payable.nextDueAt, 'hosting-addon'), 'renewal-wrong-kind')
  await order(owner.id, other.id, renewMeta(payable), 'renewal-foreign-invoice')
  await order(other.id, owner.id, renewMeta(payable), 'renewal-foreign-order')
  await order(owner.id, owner.id, renewMeta(foreign), 'renewal-foreign-service')
  const result = await renewalWorkspace.cloudServiceRenewals(owner.id, now)
  assert.equal(result.renewalsTotal, 3)
  assert.deepEqual(result.renewals.map(row => row.id), [payable.id, ...[paid.id, noInvoice.id].sort((a, b) => a - b)])
  assert(result.renewals.find(row => row.id === payable.id).overdue)
  const byId = new Map(result.renewals.map(row => [row.id, row.invoice]))
  assert.deepEqual(byId.get(payable.id), { number: valid.invoice.number, status: 'UNPAID' })
  assert.deepEqual(byId.get(paid.id), { number: accepted.invoice.number, status: 'PAID' })
  assert.equal(byId.get(noInvoice.id), null)
  for (const row of [hourly, later, foreign]) assert(!byId.has(row.id))

  const notice = (row, userId, days, dueAt, createdAt, kind = 'HOSTING') => ({
    userId, kind, dedupeKey: `hosting:${row.id}:due:${days}:${dueAt}`,
    titleEn: 'test', titleFa: 'تست', href: `/dashboard/services/${row.id}`, createdAt,
  })
  const latest = new Date('2026-11-26T12:00:00.000Z')
  await db.userNotification.createMany({ data: [
    notice(payable, owner.id, 3, payable.nextDueAt.toISOString(), new Date('2026-11-24T12:00:00.000Z')),
    notice(payable, owner.id, 1, payable.nextDueAt.toISOString(), latest),
    notice(payable, owner.id, 7, wrongTerm.toISOString(), now),
    notice(paid, other.id, 7, paid.nextDueAt.toISOString(), now),
    notice(noInvoice, owner.id, 7, noInvoice.nextDueAt.toISOString(), now, 'PAYMENT_PAID'),
    notice(noInvoice, owner.id, 3, `2026-false:${noInvoice.nextDueAt.toISOString()}`, now),
  ] })
  const admin = load('src/modules/hosting/server/services.ts')
  const queue = await admin.adminHostingServices({ status: 'RENEWALS', q: `${stamp}-renewal` }, now)
  assert.equal(queue.total, 4)
  assert.equal(queue.services[0].id, payable.id)
  assert.equal(queue.services[0].renewalReminderAt, latest.toISOString())
  assert(queue.services.slice(1).every(row => row.renewalReminderAt === null))
  assert.equal((await admin.adminHostingServices({ status: 'ACTIVE', q: `${stamp}-renewal` }, now)).total, 5)
}
async function main() {
  try {
    for (let i = 0; i < 2; i++) users.push(await db.user.create({ data: { email: `${stamp}-${i}@invalid.test`, name: stamp, passwordHash: 'unused', role: 'USER', status: 'ACTIVE' } }))
    await put('extension.hosting.state.v1', { enabled: true, settings: {} })
    await put('site.maintenance.v1', {})
    await put('site.section-access.v1', {})
    await denied(401)
    token = { uid: String(users[0].id), authAt: Math.floor(Date.now() / 1000) }
    assert.equal((await access.cloudWorkspaceUser({})).id, users[0].id)
    await put('extension.hosting.state.v1', { enabled: false, settings: {} }); await denied(404)
    await put('extension.hosting.state.v1', { enabled: true, settings: {} })
    await db.user.update({ where: { id: users[0].id }, data: { status: 'BANNED' } }); await denied(401)
    await db.user.update({ where: { id: users[0].id }, data: { status: 'ACTIVE' } })
    await put('site.section-access.v1', { hosting: ['group:999999999'] }); await denied(403)
    await put('site.section-access.v1', {})
    await put('site.maintenance.v1', { hosting: { enabled: true, title: 'closed', message: 'closed' } }); await denied(503)
    await put('site.maintenance.v1', {})

    const whitespace = await order(users[0].id, users[0].id, '{ "kind" : "hosting", "password":"private-meta" }', 'whitespace')
    const foreign = await order(users[1].id, users[1].id, '{"kind":"domain"}', 'foreign')
    const mismatched = await order(users[0].id, users[1].id, '{"kind":"hosting"}', 'mismatched')
    const store = await order(users[0].id, users[0].id, '{"kind":"store","description":"hosting"}', 'store')
    await order(users[0].id, users[0].id, '{"kind":"hosting-invalid"}', 'near')
    await order(users[0].id, users[0].id, '{"kind":"hosting"', 'malformed')
    assert.equal(await access.ownedCloudInvoice(users[0].id, whitespace.invoice.number), whitespace.invoice.id)
    for (const row of [foreign, mismatched, store]) {assert.equal(await access.ownedCloudInvoice(users[0].id, row.invoice.number), null);assert.equal(await access.ownedCloudResultInvoice(users[0].id,{order:String(row.row.id)}),null)}
    assert.equal(await access.ownedCloudResultInvoice(users[0].id,{order:String(whitespace.row.id)}),whitespace.invoice.number)
    assert.equal(await access.ownedCloudResultInvoice(users[0].id,{invoice:whitespace.invoice.number}),whitespace.invoice.number)
    gateway = await db.gateway.create({ data: { name: stamp, provider: 'MANUAL', fiat: 'IRT', instructions: 'connected test', active: true } })
    let gatewayCalls = 0
    const topupLoad = loadSource({ ...mocks,
      '@/modules/settings/server': { getSettings: async () => ({}) },
      '@/modules/billing/server/gateways': {
        resolveCheckoutGateway: async () => gateway,
        checkoutGatewayOptions: async () => [],
        gatewayAcceptsCheckoutCurrency: () => true,
        gatewayCallbackUrl: () => '',
        createGatewayInvoice: async () => { gatewayCalls++; return { ok: true, manual: true, paymentUrl: '' } },
      },
    })
    const startTopup = topupLoad('src/modules/wallet/server/topup.ts').startWalletTopup
    // The same caller key is valid on both surfaces; each must retain its own callback and replay destination.
    const requestKey = 'cloud:request-1234'
    const cloudTopup = await startTopup({ userId: users[0].id, email: users[0].email, amount: 10000, currency: 'IRT', idempotencyKey: requestKey, surface: 'cloud' })
    const cloudReplay = await startTopup({ userId: users[0].id, email: users[0].email, amount: 10000, currency: 'IRT', idempotencyKey: requestKey, surface: 'cloud' })
    const regularTopup = await startTopup({ userId: users[0].id, email: users[0].email, amount: 10000, currency: 'IRT', idempotencyKey: requestKey })
    const regularReplay = await startTopup({ userId: users[0].id, email: users[0].email, amount: 10000, currency: 'IRT', idempotencyKey: requestKey })
    assert(cloudTopup.ok && regularTopup.ok && cloudReplay.ok && regularReplay.ok)
    topupInvoiceIds.push(cloudTopup.invoiceId, regularTopup.invoiceId)
    assert.equal(cloudReplay.invoiceId, cloudTopup.invoiceId); assert.equal(cloudReplay.replayed, true)
    assert.equal(cloudTopup.paymentUrl, `/cloud/dashboard/invoices/${cloudTopup.invoiceNumber}`)
    assert.equal(cloudReplay.paymentUrl, cloudTopup.paymentUrl); assert.equal(cloudReplay.manual, true)
    assert.equal(regularReplay.invoiceId, regularTopup.invoiceId); assert.notEqual(regularTopup.invoiceId, cloudTopup.invoiceId)
    assert.equal(regularTopup.paymentUrl, `/invoice/${regularTopup.invoiceNumber}`); assert.equal(regularReplay.paymentUrl, regularTopup.paymentUrl)
    assert.equal(gatewayCalls, 2)
    const cloudInvoice = await db.invoice.findUnique({ where: { id: cloudTopup.invoiceId } })
    const regularInvoice = await db.invoice.findUnique({ where: { id: regularTopup.invoiceId } })
    assert.equal(cloudInvoice.idempotencyKey, `wallet-topup:cloud:${users[0].id}:${requestKey}`)
    assert.equal(await access.ownedCloudInvoice(users[0].id, cloudInvoice.number), cloudInvoice.id)
    assert.equal(await access.ownedCloudInvoice(users[1].id, cloudInvoice.number), null)
    assert.equal(await access.ownedCloudInvoice(users[0].id, regularInvoice.number), null)
    assert.equal(surface.isCloudWalletTopup(regularInvoice), false)
    const ledgerRows = await db.walletTx.findMany({ where: { invoiceId: { in: topupInvoiceIds } } })
    assert.equal(ledgerRows.length, 2); assert.notEqual(ledgerRows[0].idempotencyKey, ledgerRows[1].idempotencyKey)
    const walletOverview = topupLoad('src/modules/wallet/server/overview.ts').walletOverview
    const walletView = await walletOverview(users[0].id, 'cloud')
    assert.equal(walletView.transactions.find(row => row.invoiceId === cloudTopup.invoiceId).cloudInvoiceNumber, cloudInvoice.number)
    assert.equal(walletView.transactions.find(row => row.invoiceId === regularTopup.invoiceId).cloudInvoiceNumber, null)
    assert((await walletOverview(users[0].id)).transactions.every(row => !Object.hasOwn(row, 'cloudInvoiceNumber')))
    const http=load('src/modules/hosting/server/workspace-http.ts'),request=query=>({nextUrl:new URL('https://owned.invalid/api/hosting/workspace'+query)})
    for(const query of ['?view=invoices&userId=1','?view=invoices&cursor=-1','?view=invoices&cursor=0','?view=invoices&cursor=2147483648','?view=other'])assert.equal((await http.GET_workspace(request(query))).status,422)
    token=null;assert.equal((await http.GET_workspace(request(''))).status,401);token={uid:String(users[0].id),authAt:Math.floor(Date.now()/1000)}
    const response=await http.GET_workspace(request('?view=invoices'));assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal(response.headers.get('x-robots-tag'),'noindex, nofollow');assert.equal((await response.json()).items.length,1)
    for (let i = 0; i < 30; i++) await order(users[0].id, users[0].id, JSON.stringify({ kind: i % 2 ? 'domain-renewal' : 'hosting-addon' }), `page-${i}`)
    const first = await workspace.cloudFinancialPage(users[0].id)
    assert.equal(first.items.length, 25); assert.equal(first.hasMore, true); assert(first.nextCursor)
    const second = await workspace.cloudFinancialPage(users[0].id, first.nextCursor)
    assert.equal(second.items.length, 6); assert.equal(second.hasMore, false)
    assert.equal(new Set([...first.items, ...second.items].map(row => row.orderId)).size, 31)
    assert(second.items.some(row => row.orderId === whitespace.row.id))
    assert(!JSON.stringify([first, second]).includes('private-'))

    // 1000 newer non-cloud rows require an empty page with a usable continuation.
    await db.order.createMany({ data: Array.from({ length: 1000 }, (_, i) => ({ userId: users[0].id, totalAmount: 1, totalMinor: 1n, currency: 'IRT', meta: '{"kind":"store"}', idempotencyKey: `${stamp}-sparse-${i}` })) })
    const sparse = await db.order.findMany({ where: { idempotencyKey: { startsWith: `${stamp}-sparse-` } }, select: { id: true } })
    assert.equal(sparse.length, 1000)
    await db.invoice.createMany({ data: sparse.map(row => ({ userId: users[0].id, orderId: row.id, number: `${stamp}-sparse-invoice-${row.id}`, total: 1, totalMinor: 1n, currency: 'IRT' })) })
    const gap = await workspace.cloudFinancialPage(users[0].id)
    assert.equal(gap.items.length, 0); assert.equal(gap.hasMore, true); assert(gap.nextCursor)
    assert.equal((await workspace.cloudFinancialPage(users[0].id, gap.nextCursor)).items.length, 25)

    product = await db.hostingProduct.create({ data: { slug: stamp, name: stamp, kind: 'VPS' } })
    tld = await db.domainTld.create({ data: { suffix: stamp, registerMinor: 1n, renewMinor: 1n } })
    for (const user of users) {
      const service = await db.hostingService.create({ data: { userId: user.id, productId: product.id, cycle: 'MONTH', priceMinor: 1n, label: user.id === users[0].id ? 'owned-service' : 'foreign-service', loginSecret: 'private-secret' } })
      await db.hostingAction.create({ data: { serviceId: service.id, actor: 'SYSTEM', kind: 'PROVISION', status: 'FAILED', detail: 'private-detail', error: 'private-error' } })
      const domain = await db.domain.create({ data: { userId: user.id, tldId: tld.id, name: `${user.id}.${stamp}`, renewMinor: 1n, authCode: 'private-code' } })
      await db.domainAction.create({ data: { domainId: domain.id, actor: 'SYSTEM', kind: 'REGISTER', status: 'FAILED', detail: 'private-domain-detail' } })
    }
    const overview = await workspace.cloudWorkspaceOverview(users[0].id)
    assert.equal(overview.activity.length, 2)
    assert(overview.activity.some(row => row.label === 'owned-service'))
    assert(!JSON.stringify(overview).includes('private-'))
    assert(!JSON.stringify(overview).includes('foreign-service'))
    await verifyRenewals()
    console.log('Cloud workspace connected checks passed')
  } finally {
    try {
      const ids = users.map(user => user.id)
      if (topupInvoiceIds.length) await db.walletTx.deleteMany({ where: { invoiceId: { in: topupInvoiceIds } } })
      await db.hostingService.deleteMany({ where: { userId: { in: ids } } })
      await db.domain.deleteMany({ where: { userId: { in: ids } } })
      await db.invoice.deleteMany({ where: { OR: [{ userId: { in: ids } }, { order: { is: { userId: { in: ids } } } }] } })
      if (gateway) await db.gateway.deleteMany({ where: { id: gateway.id } })
      await db.order.deleteMany({ where: { userId: { in: ids } } })
      if (product) await db.hostingProduct.delete({ where: { id: product.id } })
      if (tld) await db.domainTld.delete({ where: { id: tld.id } })
      await db.user.deleteMany({ where: { id: { in: ids } } })
      for (const [key, row] of settings) {
        if (row) await db.setting.upsert({ where: { key }, create: row, update: { value: row.value } })
        else await db.setting.deleteMany({ where: { key } })
      }
    } finally { delete globalThis.__mobocomSectionAccess; await db.$disconnect() }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
