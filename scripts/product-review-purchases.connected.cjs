// Docker-local PostgreSQL/API check; creates/removes only namespaced commerce fixtures.
const assert = require('node:assert/strict'), { PrismaClient } = require('@prisma/client'), { encode } = require('next-auth/jwt')
const db = new PrismaClient(), base = 'http://localhost:3000', seed = `rp${Date.now().toString(36)}`
const ids = { products: [], orders: [], users: [] }
async function main() {
  const users = []
  for (const suffix of ['buyer', 'other']) { const user = await db.user.create({ data: { email: `${seed}-${suffix}@example.invalid`, passwordHash: 'test-only', role: 'ADMIN' } }); ids.users.push(user.id); users.push(user) }
  const cookies = await Promise.all(users.map(async user => `next-auth.session-token=${await encode({ token: { uid: String(user.id), sub: String(user.id), email: user.email, role: user.role, authAt: Date.now() }, secret: process.env.NEXTAUTH_SECRET })}`))
  const products = []
  for (const suffix of ['first', 'second', 'legacy']) { const row = await db.product.create({ data: { slug: `${seed}-${suffix}`, name: `${seed}-${suffix}`, approval: 'APPROVED', active: true, price: 100, priceMinor: 100n, currency: 'IRT' } }); ids.products.push(row.id); products.push(row) }
  const cart = await db.order.create({ data: { userId: users[0].id, productId: products[0].id, status: 'PAID', totalAmount: 200, currency: 'IRT', lines: { create: [
    { line: 0, productId: products[0].id, name: products[0].name, quantity: 1, sellerStatus: 'CANCELLED' },
    { line: 1, productId: products[1].id, name: products[1].name, quantity: 1 },
  ] } } }); ids.orders.push(cart.id)
  const legacy = await db.order.create({ data: { userId: users[0].id, productId: products[2].id, status: 'PAID', totalAmount: 100, currency: 'IRT' } }); ids.orders.push(legacy.id)
  for (const order of [cart, legacy]) await db.invoice.create({ data: { number: `${seed}-${order.id}`, userId: users[0].id, orderId: order.id, status: 'PAID', currency: 'IRT' } })
  // Reproduce preceding eligibility: checkout's second product has no first-product mirror.
  assert.equal(await db.order.count({ where: { userId: users[0].id, productId: products[1].id, status: 'PAID', invoice: { status: 'PAID' } } }), 0)
  const get = async (product, cookie = cookies[0]) => { const r = await fetch(`${base}/api/products/${product.slug}/tabs?tab=reviews`, { headers: cookie ? { cookie } : {}, signal: AbortSignal.timeout(60000) }); assert.equal(r.status, 200); return r.json() }
  assert.equal((await get(products[1])).canReview, true)
  assert.equal((await get(products[2])).canReview, true)
  assert.equal((await get(products[0])).canReview, false, 'cancelled modern line cannot use legacy mirror')
  assert.equal((await get(products[1], cookies[1])).canReview, false, 'another identity cannot inherit purchase')
  assert.equal((await get(products[1], '')).canReview, false)
  await db.orderLine.updateMany({ where: { orderId: cart.id, productId: products[1].id }, data: { quantity: 0 } })
  assert.equal((await get(products[1])).canReview, false)
  await db.orderLine.updateMany({ where: { orderId: cart.id, productId: products[1].id }, data: { quantity: 1 } })
  for (const status of ['UNPAID', 'REFUNDED', 'VOID']) {
    await db.invoice.update({ where: { orderId: cart.id }, data: { status } })
    assert.equal((await get(products[1])).canReview, false, status)
  }
  await db.invoice.update({ where: { orderId: cart.id }, data: { status: 'PAID' } })
  await db.order.update({ where: { id: cart.id }, data: { status: 'PENDING' } }); assert.equal((await get(products[1])).canReview, false)
  await db.order.update({ where: { id: cart.id }, data: { status: 'PAID' } })
  const post = product => fetch(`${base}/api/products/${product.slug}/feedback`, { method: 'POST', headers: { cookie: cookies[0], origin: base, 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'review', rating: 5, body: 'Verified fixture purchase review.' }), signal: AbortSignal.timeout(60000) })
  assert.equal((await post(products[1])).status, 201)
  assert.equal((await get(products[1])).hasReviewed, true); assert.equal((await get(products[1])).canReview, false)
  assert.equal((await post(products[1])).status, 409)
  assert.equal((await post(products[2])).status, 201)
  assert.equal((await post(products[0])).status, 403)
  const reviews = await db.productReview.findMany({ where: { productId: { in: ids.products } } })
  assert.equal(reviews.length, 2); assert.ok(reviews.every(row => row.userId === users[0].id && row.status === 'PENDING'))
  console.log('Product review PostgreSQL/API legacy/cart eligibility, ownership, payment/cancelled/zero-quantity gates and duplicate/moderation checks passed.')
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => {
  await db.invoice.deleteMany({ where: { orderId: { in: ids.orders } } })
  await db.order.deleteMany({ where: { id: { in: ids.orders } } })
  await db.product.deleteMany({ where: { id: { in: ids.products } } })
  await db.user.deleteMany({ where: { id: { in: ids.users } } })
  await db.$disconnect()
})
