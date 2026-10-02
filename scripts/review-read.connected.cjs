// Run inside the local app container: node scripts/review-read.connected.cjs
const assert = require('node:assert/strict')
const { PrismaClient } = require('@prisma/client')

const db = new PrismaClient()
const base = process.env.TEST_BASE || 'http://localhost:3000'
const seed = `codex-review-read-${Date.now()}`
const userIds = []
const softwareIds = []

async function get(item, page) {
  const url = new URL('/api/engage', base)
  url.searchParams.set('item', item)
  if (page !== undefined) url.searchParams.set('page', String(page))
  return fetch(url, { signal: AbortSignal.timeout(30_000) })
}

async function main() {
  const live = await db.softwareTitle.create({ data: { slug: seed, title: 'Review read test' } })
  const draft = await db.softwareTitle.create({ data: { slug: `${seed}-draft`, title: 'Hidden review read test', status: 'DRAFT' } })
  softwareIds.push(live.id, draft.id)
  for (let n = 0; n < 4; n++) {
    const user = await db.user.create({ data: { email: `${seed}-${n}@example.invalid`, passwordHash: 'test-only' } })
    userIds.push(user.id)
  }
  const reviews = [
    { userId: userIds[0], rating: 5, status: 'APPROVED', body: 'A useful review for public reading.' },
    { userId: userIds[1], rating: 4, status: 'APPROVED', body: '' },
    { userId: userIds[2], rating: 1, status: 'PENDING', body: 'A pending text review still contributes its rating.' },
    { userId: userIds[3], rating: 2, status: 'REJECTED', body: 'This should not count.' },
  ]
  await db.itemReview.createMany({ data: reviews.map((review) => ({ ...review, itemType: 'software', itemId: live.id })) })
  await db.itemReview.create({ data: { userId: userIds[0], itemType: 'software', itemId: draft.id, rating: 5, body: 'A hidden review.', status: 'APPROVED' } })

  const publicResponse = await get(`software:${live.id}`)
  assert.equal(publicResponse.status, 200)
  const publicData = await publicResponse.json()
  assert.equal(publicData.summary.count, 3)
  assert.equal(publicData.summary.average, 3.3)
  assert.deepEqual(publicData.summary.distribution, [1, 0, 0, 1, 1])
  assert.equal(publicData.total, 1, 'only approved text is displayed')
  assert.equal(publicData.reviews.length, 1)
  assert.equal((await get(`software:${draft.id}`)).status, 404, 'draft reviews stay private')
  assert.equal((await get('software:999999999')).status, 404)
  const badPage = await (await get(`software:${live.id}`, 'Infinity')).json()
  assert.equal(badPage.page, 1)
  const largePage = await (await get(`software:${live.id}`, 999999999)).json()
  assert.equal(largePage.page, 1000)
  console.log('Review reads: public visibility, grouped rating summary and bounded page OK')
}

main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(async () => {
  if (softwareIds.length) {
    await db.itemReview.deleteMany({ where: { itemType: 'software', itemId: { in: softwareIds } } })
    await db.softwareTitle.deleteMany({ where: { id: { in: softwareIds } } })
  }
  if (userIds.length) await db.user.deleteMany({ where: { id: { in: userIds } } })
  await db.$disconnect()
})
