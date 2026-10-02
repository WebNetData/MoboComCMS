// Run inside the local app container: node scripts/search-publication.connected.cjs
const assert = require('node:assert/strict')
const { PrismaClient } = require('@prisma/client')

const db = new PrismaClient()
const base = 'http://localhost:3000'
const seed = `codexsearch${Date.now()}`
const productIds = []
let indexedAt = null

async function search(suggest = false) {
  const response = await fetch(`${base}/api/search?q=${seed}${suggest ? '&suggest=1' : ''}`, { signal: AbortSignal.timeout(30_000) })
  assert.equal(response.status, 200)
  assert.match(response.headers.get('cache-control') || '', /no-store/)
  return response.json()
}

async function main() {
  indexedAt = await db.setting.findUnique({ where: { key: 'search.indexedAt' } })
  await db.setting.upsert({ where: { key: 'search.indexedAt' }, create: { key: 'search.indexedAt', value: new Date().toISOString() }, update: { value: new Date().toISOString() } })
  const approved = await db.product.create({ data: { slug: `${seed}-approved`, name: `${seed} approved`, active: true, approval: 'APPROVED', price: 1000, priceMinor: 1000n } })
  const pending = await db.product.create({ data: { slug: `${seed}-pending`, name: `${seed} pending`, active: true, approval: 'PENDING', price: 1000, priceMinor: 1000n } })
  productIds.push(approved.id, pending.id)
  await db.searchDocument.createMany({ data: [approved, pending].map((product) => ({ itemType: 'product', itemId: product.id, title: product.name, text: product.name.toLowerCase(), url: `/products/${product.slug}` })) })

  const first = await search()
  assert.equal(first.total, 1)
  assert.equal(first.hits[0].id, approved.id)
  assert.equal(first.counts.product, 1)
  assert.deepEqual((await search(true)).results.map((item) => item.url), [`/products/${approved.slug}`])

  await db.product.update({ where: { id: approved.id }, data: { approval: 'PENDING' } })
  assert.equal(await db.searchDocument.count({ where: { itemType: 'product', itemId: approved.id } }), 1, 'stale document stays in the index for this test')
  const after = await search()
  assert.equal(after.total, 0)
  assert.equal(after.hits.length, 0)
  assert.equal(after.counts.product || 0, 0)
  assert.deepEqual((await search(true)).results, [])
  console.log('Search publication: stale index rows excluded from hits, facets and suggestions OK')
}

main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(async () => {
  if (productIds.length) {
    await db.searchDocument.deleteMany({ where: { itemType: 'product', itemId: { in: productIds } } })
    await db.product.deleteMany({ where: { id: { in: productIds } } })
  }
  if (indexedAt) await db.setting.update({ where: { key: 'search.indexedAt' }, data: { value: indexedAt.value } })
  else await db.setting.deleteMany({ where: { key: 'search.indexedAt' } })
  await db.$disconnect()
})
