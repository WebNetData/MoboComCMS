// Run inside the local app container: node scripts/review-helpful.connected.cjs
const assert = require('node:assert/strict')
const { PrismaClient } = require('@prisma/client')
const { encode } = require('next-auth/jwt')

const db = new PrismaClient()
const base = 'http://localhost:3000'
const seed = `codex-helpful-${Date.now()}`
const userIds = [], softwareIds = [], reviewIds = []

async function cookie(user) {
  const token = await encode({ token: { uid: String(user.id), sub: String(user.id), email: user.email, name: user.email, role: user.role, roleId: user.roleId, authAt: Date.now() }, secret: process.env.NEXTAUTH_SECRET })
  return `next-auth.session-token=${token}`
}

async function vote(cookieValue, reviewId, on, origin = base) {
  return fetch(`${base}/api/engage/review/helpful`, { method: 'POST', signal: AbortSignal.timeout(30_000), headers: { origin, 'content-type': 'application/json', ...(cookieValue ? { cookie: cookieValue } : {}) }, body: JSON.stringify({ reviewId, on }) })
}

async function main() {
  const [author, voter, other] = await Promise.all([0, 1, 2].map((n) => db.user.create({ data: { email: `${seed}-${n}@example.invalid`, passwordHash: 'test-only' } })))
  userIds.push(author.id, voter.id, other.id)
  const live = await db.softwareTitle.create({ data: { slug: seed, title: 'Helpful review test' } })
  const draft = await db.softwareTitle.create({ data: { slug: `${seed}-draft`, title: 'Hidden helpful review test', status: 'DRAFT' } })
  softwareIds.push(live.id, draft.id)
  const approved = await db.itemReview.create({ data: { itemType: 'software', itemId: live.id, userId: author.id, rating: 5, body: 'An approved review for a helpful vote.', status: 'APPROVED' } })
  const pending = await db.itemReview.create({ data: { itemType: 'software', itemId: live.id, userId: other.id, rating: 4, body: 'A pending review cannot receive votes.', status: 'PENDING' } })
  const hidden = await db.itemReview.create({ data: { itemType: 'software', itemId: draft.id, userId: author.id, rating: 5, body: 'A draft item cannot receive votes.', status: 'APPROVED' } })
  reviewIds.push(approved.id, pending.id, hidden.id)
  const authorCookie = await cookie(author), voterCookie = await cookie(voter)

  assert.equal((await vote('', approved.id, true)).status, 401)
  assert.equal((await vote(voterCookie, approved.id, true, 'https://example.invalid')).status, 403)
  assert.equal((await vote(authorCookie, approved.id, true)).status, 403)
  assert.equal((await vote(voterCookie, pending.id, true)).status, 404)
  assert.equal((await vote(voterCookie, hidden.id, true)).status, 404)
  assert.equal((await vote(voterCookie, approved.id, true)).status, 200)
  assert.equal((await vote(voterCookie, approved.id, true)).status, 200)
  assert.equal(await db.itemReviewHelpful.count({ where: { reviewId: approved.id } }), 1, 'repeat vote must be idempotent')
  const read = await fetch(`${base}/api/engage?item=software:${live.id}`, { headers: { cookie: voterCookie }, signal: AbortSignal.timeout(30_000) })
  assert.equal(read.status, 200)
  const review = (await read.json()).reviews.find((row) => row.id === approved.id)
  assert.equal(review.helpfulCount, 1)
  assert.equal(review.helpfulByMe, true)
  assert.equal((await vote(voterCookie, approved.id, false)).status, 200)
  assert.equal(await db.itemReviewHelpful.count({ where: { reviewId: approved.id } }), 0)
  assert.equal((await vote(voterCookie, approved.id, true)).status, 200)
  const edit = await fetch(`${base}/api/engage/review`, { method: 'POST', signal: AbortSignal.timeout(30_000), headers: { origin: base, cookie: authorCookie, 'content-type': 'application/json' }, body: JSON.stringify({ item: `software:${live.id}`, rating: 5, body: 'This edited review describes a different experience.' }) })
  assert.equal(edit.status, 200)
  assert.equal(await db.itemReviewHelpful.count({ where: { reviewId: approved.id } }), 0, 'editing review text clears old helpful votes')
  console.log('Helpful reviews: auth, same-origin, approval/publication checks, one vote, undo and edit reset OK')
}

main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(async () => {
  if (reviewIds.length) await db.itemReview.deleteMany({ where: { id: { in: reviewIds } } })
  if (softwareIds.length) await db.softwareTitle.deleteMany({ where: { id: { in: softwareIds } } })
  if (userIds.length) await db.user.deleteMany({ where: { id: { in: userIds } } })
  await db.$disconnect()
})
