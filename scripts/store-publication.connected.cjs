// Run inside the local app container: node scripts/store-publication.connected.cjs
const assert = require('node:assert/strict')
const { PrismaClient } = require('@prisma/client')

const db = new PrismaClient()
const base = 'http://localhost:3000'
const seed = `codex-store-public-${Date.now()}`
const productIds = []

async function main() {
  const approved = await db.product.create({ data: { slug: `${seed}-approved`, name: `Visible ${seed}`, active: true, approval: 'APPROVED', price: 1000, priceMinor: 1000n } })
  const pending = await db.product.create({ data: { slug: `${seed}-pending`, name: `Pending ${seed}`, active: true, approval: 'PENDING', price: 1000, priceMinor: 1000n } })
  productIds.push(approved.id, pending.id)

  const listing = await fetch(`${base}/products?q=${encodeURIComponent(seed)}`, { signal: AbortSignal.timeout(30_000) })
  assert.equal(listing.status, 200)
  const html = await listing.text()
  assert.ok(html.includes(approved.slug), 'approved product must appear in storefront search')
  assert.ok(!html.includes(pending.slug), 'pending product must stay out of storefront search')
  assert.equal((await fetch(`${base}/products/${pending.slug}`, { signal: AbortSignal.timeout(30_000) })).status, 404)
  console.log('Store publication: approved listing visible and active pending product hidden OK')
}

main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(async () => {
  if (productIds.length) await db.product.deleteMany({ where: { id: { in: productIds } } })
  await db.$disconnect()
})
