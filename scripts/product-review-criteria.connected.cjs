// Docker PostgreSQL/API regression check; removes namespaced users/reviews/product.
const assert = require('node:assert/strict'), { PrismaClient } = require('@prisma/client')
const db = new PrismaClient(), seed = `rc${Date.now().toString(36)}`
let product
async function main() {
  product = await db.product.create({ data: { slug: seed, name: seed, active: true, approval: 'APPROVED', price: 100, priceMinor: 100n } })
  await db.user.createMany({ data: Array.from({ length: 1003 }, (_, i) => ({ email: `${seed}-${i}@example.invalid`, passwordHash: 'test-only' })) })
  const users = await db.user.findMany({ where: { email: { startsWith: `${seed}-` } }, orderBy: { id: 'asc' }, select: { id: true } })
  assert.equal(users.length, 1003)
  await db.productReview.createMany({ data: users.map((user, i) => ({ productId: product.id, userId: user.id, rating: 5, body: 'Fixture review only.', status: i < 1001 ? 'APPROVED' : i === 1001 ? 'PENDING' : 'REJECTED', criteria: JSON.stringify({ quality: i < 500 ? 1 : 5, value: 4, usability: 3 }) })) })
  const firstPage = await db.productReview.findMany({ where: { productId: product.id, status: 'APPROVED' }, orderBy: { id: 'asc' }, take: 500, select: { criteria: true } })
  assert.ok(firstPage.every(row => JSON.parse(row.criteria).quality === 1), 'a 500-row aggregate would report the wrong quality')
  const response = await fetch(`http://localhost:3000/api/products/${seed}/tabs?tab=reviews`, { signal: AbortSignal.timeout(60000) })
  assert.equal(response.status, 200)
  const result = await response.json()
  assert.equal(result.total, 1001); assert.equal(result.average, 5); assert.equal(result.pages, 101); assert.equal(result.items.length, 10)
  assert.deepEqual(result.criteria, { quality: 3, value: 4, usability: 3 })
  assert.equal(result.canReview, false); assert.equal(result.signedIn, false)
  await db.product.update({ where: { id: product.id }, data: { approval: 'PENDING' } })
  assert.equal((await fetch(`http://localhost:3000/api/products/${seed}/tabs?tab=reviews`)).status, 404)
  console.log('Product dimensions PostgreSQL/API 1001-approved-review totals/averages, pagination, guest and publication checks passed.')
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => {
  if (product) await db.product.delete({ where: { id: product.id } })
  await db.user.deleteMany({ where: { email: { startsWith: `${seed}-` } } })
  await db.$disconnect()
})
