// Run inside the local app container: node scripts/recent-views.connected.cjs
const assert = require('node:assert/strict')
const { PrismaClient } = require('@prisma/client')
const { encode } = require('next-auth/jwt')

const db = new PrismaClient()
const base = 'http://localhost:3000'
const seed = `codex-recent-view-${Date.now()}`
const userIds = [], productIds = []

async function cookie(user) {
  const token = await encode({ token: { uid: String(user.id), sub: String(user.id), email: user.email, name: user.email, role: user.role, roleId: user.roleId, authAt: Date.now() }, secret: process.env.NEXTAUTH_SECRET })
  return `next-auth.session-token=${token}`
}

async function post(cookieValue, item, origin = base) {
  return fetch(`${base}/api/library/recent`, { method: 'POST', headers: { origin, 'content-type': 'application/json', ...(cookieValue ? { cookie: cookieValue } : {}) }, body: JSON.stringify({ item }) })
}

async function main() {
  const owner = await db.user.create({ data: { email: `${seed}-owner@example.invalid`, passwordHash: 'test-only' } })
  const other = await db.user.create({ data: { email: `${seed}-other@example.invalid`, passwordHash: 'test-only' } })
  userIds.push(owner.id, other.id)
  const product = await db.product.create({ data: { slug: seed, name: 'Recent view test product', active: true } })
  const draft = await db.product.create({ data: { slug: `${seed}-draft`, name: 'Hidden recent view product', active: false } })
  const pending = await db.product.create({ data: { slug: `${seed}-pending`, name: 'Pending recent view product', active: true, approval: 'PENDING' } })
  productIds.push(product.id, draft.id, pending.id)
  const own = await cookie(owner), outsider = await cookie(other)
  assert.equal((await post('', `product:${product.id}`)).status, 401)
  assert.equal((await post(own, `product:${product.id}`, 'https://example.invalid')).status, 403)
  assert.equal((await post(own, `product:${draft.id}`)).status, 404)
  assert.equal((await post(own, `product:${pending.id}`)).status, 404)
  assert.equal((await fetch(`${base}/products/${pending.slug}`)).status, 404)
  assert.equal((await post(own, `product:${product.id}`)).status, 200)
  assert.equal((await post(own, `product:${product.id}`)).status, 200)
  assert.equal(await db.userRecentView.count({ where: { userId: owner.id } }), 1, 'repeat views must share one row')
  const ownHistory = await fetch(`${base}/dashboard/recent`, { headers: { cookie: own } })
  assert.equal(ownHistory.status, 200)
  assert.ok((await ownHistory.text()).includes(product.name))
  const otherHistory = await fetch(`${base}/dashboard/recent`, { headers: { cookie: outsider } })
  assert.ok(!(await otherHistory.text()).includes(product.name), 'other user cannot read private views')
  const library = await fetch(`${base}/dashboard/library`, { headers: { cookie: own } })
  assert.ok((await library.text()).includes(product.name), 'library overview must include recent view')
  assert.equal((await post(outsider, `product:${product.id}`)).status, 200)
  assert.equal((await fetch(`${base}/api/library/recent`, { method: 'DELETE', headers: { cookie: own, origin: 'https://example.invalid' } })).status, 403)
  assert.equal((await fetch(`${base}/api/library/recent`, { method: 'DELETE', headers: { cookie: own, origin: base } })).status, 200)
  assert.equal(await db.userRecentView.count({ where: { userId: owner.id } }), 0)
  assert.equal(await db.userRecentView.count({ where: { userId: other.id } }), 1, 'clear must affect only owner')
  console.log('Recent views: published-only writes, repeat visits, private read and owner-scoped clear OK')
}

main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(async () => {
  if (productIds.length) await db.product.deleteMany({ where: { id: { in: productIds } } })
  if (userIds.length) await db.user.deleteMany({ where: { id: { in: userIds } } })
  await db.$disconnect()
})
