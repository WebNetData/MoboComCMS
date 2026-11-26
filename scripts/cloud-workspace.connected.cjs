const assert = require('node:assert/strict')
const { PrismaClient } = require('@prisma/client')
const loadSource = require('./connected-source-loader.cjs')
const db = new PrismaClient()
const stamp = `cloud-workspace-${Date.now()}-${process.pid}`
const users = [], settings = new Map()
let token = null, product, tld
const mocks = {
  '@/platform/database/prisma': { db },
  'next-auth/jwt': { getToken: async () => token }, // Session boundary only; requireUser resolves current DB state.
  'next/headers': { headers: async () => new Headers() },
  '@/platform/cache/kv': { cached: async (_key, _ttl, fn) => fn(), invalidate: async () => {} },
}
const load = loadSource(mocks)
const access = load('src/modules/hosting/server/workspace-access.ts')
const workspace = load('src/modules/hosting/server/workspace.ts')
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
    console.log('Cloud workspace connected checks passed')
  } finally {
    try {
      const ids = users.map(user => user.id)
      await db.hostingService.deleteMany({ where: { userId: { in: ids } } })
      await db.domain.deleteMany({ where: { userId: { in: ids } } })
      await db.invoice.deleteMany({ where: { OR: [{ userId: { in: ids } }, { order: { is: { userId: { in: ids } } } }] } })
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
