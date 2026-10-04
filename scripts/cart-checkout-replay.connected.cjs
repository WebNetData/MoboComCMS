// Real port-3000 checkout replay against namespaced PostgreSQL fixtures.
const assert = require('node:assert/strict'), {PrismaClient} = require('@prisma/client'), {encode} = require('next-auth/jwt')
const db = new PrismaClient(), seed = `cart-replay-${Date.now()}`, base = 'http://localhost:3000'
let user, other, product, fresh, cart, otherCart, order
async function main() {
  user = await db.user.create({data: {email: `${seed}@example.invalid`, passwordHash: 'test-only'}})
  other = await db.user.create({data: {email: `${seed}-other@example.invalid`, passwordHash: 'test-only'}})
  product = await db.product.create({data: {slug: seed, name: seed, price: 1, priceMinor: 100n, currency: 'USD', stock: 30, approval: 'APPROVED'}})
  fresh = await db.product.create({data: {slug: `${seed}-fresh`, name: seed, price: 2, priceMinor: 200n, currency: 'USD', stock: 30, approval: 'APPROVED'}})
  cart = await db.cart.create({data: {userId: user.id, token: `${seed}-owned-cart`, reminderCount: 1}})
  otherCart = await db.cart.create({data: {userId: other.id, token: `${seed}-other-cart`}})
  order = await db.order.create({data: {userId: user.id, idempotencyKey: seed, totalAmount: 1, totalMinor: 100n, currency: 'USD', productId: product.id, lines: {create: {productId: product.id, name: product.name, quantity: 1, unitPriceMinor: 100n, totalMinor: 100n, currency: 'USD'}}}})
  const token = async owner => encode({secret: process.env.NEXTAUTH_SECRET, token: {uid: String(owner.id), sub: String(owner.id), email: owner.email, role: owner.role, authAt: Date.now()}})
  const ownerToken = await token(user), otherToken = await token(other)
  const call = jwt => fetch(`${base}/api/cart/checkout`, {method: 'POST', headers: {origin: base, 'content-type': 'application/json', 'idempotency-key': seed, ...(jwt ? {cookie: `next-auth.session-token=${jwt}`} : {})}, body: '{}', signal: AbortSignal.timeout(60000)})
  await db.cartLine.createMany({data: [{cartId: cart.id, productId: product.id, quantity: 3}, {cartId: cart.id, productId: fresh.id, quantity: 2}, {cartId: otherCart.id, productId: fresh.id, quantity: 1}]})
  const before = await db.cartLine.findMany({where: {cartId: cart.id}, orderBy: {id: 'asc'}}), cycle = await db.cart.findUniqueOrThrow({where: {id: cart.id}})
  let response = await call(ownerToken)
  assert.equal(response.status, 200, await response.clone().text())
  const result = await response.json(); assert.equal(result.replayed, true); assert.equal(result.orderId, order.id)
  const after = await db.cartLine.findMany({where: {cartId: cart.id}, orderBy: {id: 'asc'}})
  if (process.env.CART_REPLAY_BASELINE === '1') {
    assert.equal(after.length, 0)
    console.log('Reproduced: replay of a one-unit old order deleted both current cart lines (three old-product units and two fresh-product units)')
    return
  }
  assert.deepEqual(after, before, 'replay preserves current rows/quantities/timestamps')
  assert.deepEqual(await db.cart.findUniqueOrThrow({where: {id: cart.id}}), cycle, 'replay preserves reminder cycle')
  response = await call(ownerToken); assert.equal(response.status, 200); assert.deepEqual(await db.cartLine.findMany({where: {cartId: cart.id}, orderBy: {id: 'asc'}}), before)
  response = await call(otherToken); assert.equal(response.status, 409)
  assert.equal(await db.cartLine.count({where: {cartId: otherCart.id}}), 1)
  assert.equal((await call(null)).status, 401)
  assert.equal(await db.order.count({where: {idempotencyKey: seed}}), 1)
  assert.equal((await db.order.findUniqueOrThrow({where: {id: order.id}, include: {lines: true}})).lines[0].quantity, 1)
  await db.cartLine.deleteMany({where: {cartId: cart.id}})
  response = await call(ownerToken); assert.equal(response.status, 200); assert.equal((await response.json()).replayed, true)
  console.log('Real PostgreSQL/HTTP existing-order repeated replay preserves fresh cart rows and recovery timestamps, conflicts preserve other owner cart, guest denial, one unchanged order and empty-cart replay passed')
}
main().catch(error => {console.error(error); process.exitCode = 1}).finally(async () => {
  try {
    if (order) await db.order.deleteMany({where: {id: order.id, idempotencyKey: seed}})
    if (user) await db.cart.deleteMany({where: {userId: user.id}})
    if (other) await db.cart.deleteMany({where: {userId: other.id}})
    if (product) await db.product.deleteMany({where: {id: product.id, slug: seed}})
    if (fresh) await db.product.deleteMany({where: {id: fresh.id, slug: `${seed}-fresh`}})
    if (user) await db.user.deleteMany({where: {id: user.id, email: `${seed}@example.invalid`}})
    if (other) await db.user.deleteMany({where: {id: other.id, email: `${seed}-other@example.invalid`}})
  } finally {await db.$disconnect()}
})
