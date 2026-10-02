// Local PostgreSQL + port 3000: node --env-file=.env scripts/studio-reviews.connected.cjs
const assert = require('node:assert/strict')
const { PrismaClient } = require('@prisma/client')

process.env.DATABASE_URL = process.env.MOBOCOM_CONNECTED_DATABASE_URL || 'postgresql://mobocom:mobocom-local@127.0.0.1:5435/mobocom?schema=public'
const db = new PrismaClient()
const seed = `codex-studio-reviews-${Date.now()}`
const ids = { studio: 0, games: [], software: [], users: [] }

async function main() {
  const studio = await db.studio.create({ data: { name: seed, normalizedName: seed } })
  ids.studio = studio.id
  const user = await db.user.create({ data: { email: `${seed}@example.invalid`, passwordHash: 'test-only', name: 'Reviewer Test' } })
  ids.users.push(user.id)
  const past = new Date(Date.now() - 86_400_000)
  const game = await db.gameTitle.create({ data: { slug: `${seed}-game`, title: 'Reviewed studio game', developer: seed, developerStudioId: studio.id, publishedAt: past } })
  const software = await db.softwareTitle.create({ data: { slug: `${seed}-software`, title: 'Reviewed studio software', publisher: seed, publisherStudioId: studio.id, publishedAt: past } })
  const hidden = await db.gameTitle.create({ data: { slug: `${seed}-hidden`, title: 'Hidden studio game', developerStudioId: studio.id, status: 'DRAFT', publishedAt: past } })
  ids.games.push(game.id, hidden.id)
  ids.software.push(software.id)
  await db.itemReview.createMany({ data: [
    { itemType: 'game', itemId: game.id, userId: user.id, rating: 5, body: 'Approved game review belongs on the studio profile', status: 'APPROVED' },
    { itemType: 'software', itemId: software.id, userId: user.id, rating: 4, body: 'Approved software review belongs on the studio profile', status: 'APPROVED' },
    { itemType: 'game', itemId: hidden.id, userId: user.id, rating: 3, body: 'Draft review must remain hidden from everyone', status: 'APPROVED' },
  ] })
  const extras = await db.user.createManyAndReturn({ data: Array.from({ length: 21 }, (_, index) => ({ email: `${seed}-older-${index}@example.invalid`, passwordHash: 'test-only', name: `Older reviewer ${index}` })) })
  ids.users.push(...extras.map((row) => row.id))
  await db.itemReview.createMany({ data: extras.map((row, index) => ({ itemType: 'game', itemId: game.id, userId: row.id, rating: 4, body: `Older studio review ${index} has enough detail to read.`, status: 'APPROVED', createdAt: new Date(Date.now() - 7 * 86_400_000) })) })
  const admin = await db.user.findUniqueOrThrow({ where: { email: process.env.ADMIN_EMAIL } })
  await db.itemReview.createMany({ data: [
    { itemType: 'game', itemId: game.id, userId: admin.id, rating: 2, body: 'Pending review must remain hidden from public profile', status: 'PENDING' },
    { itemType: 'software', itemId: software.id, userId: admin.id, rating: 1, body: 'Rejected review must remain hidden from public profile', status: 'REJECTED' },
  ] })
  const response = await fetch(`http://127.0.0.1:3000/studios/${studio.id}`, { signal: AbortSignal.timeout(45_000) })
  assert.equal(response.status, 200)
  const html = (await response.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
  assert.ok(html.includes('Approved game review') && html.includes('Approved software review'), 'approved reviews from both catalogues appear')
  assert.ok(html.includes(`/games/${game.slug}#reviews`) && html.includes(`/software/${software.slug}#reviews`), 'reviews link to their products')
  assert.ok(!html.includes('Draft review') && !html.includes('Pending review') && !html.includes('Rejected review'), 'draft and unapproved content stays hidden')
  assert.ok(html.includes(`/studios/${studio.id}/reviews`), 'profile links to the complete review archive')
  const archive = await fetch(`http://127.0.0.1:3000/studios/${studio.id}/reviews`, { signal: AbortSignal.timeout(45_000) })
  assert.equal(archive.status, 200)
  const first = (await archive.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
  assert.ok(first.includes('صفحهٔ بعد') && first.includes('Approved software review'), 'archive shows 20 reviews per page')
  const second = (await (await fetch(`http://127.0.0.1:3000/studios/${studio.id}/reviews?page=2`, { signal: AbortSignal.timeout(45_000) })).text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
  assert.ok(second.includes('صفحهٔ قبل') && second.includes('Older studio review 0'), 'older reviews stay reachable')
  await db.gameTitle.update({ where: { id: game.id }, data: { status: 'DRAFT' } })
  const afterDraft = (await (await fetch(`http://127.0.0.1:3000/studios/${studio.id}/reviews`, { signal: AbortSignal.timeout(45_000) })).text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
  assert.ok(!afterDraft.includes('Approved game review') && afterDraft.includes('Approved software review'), 'archive reevaluates current publication')
  console.log('Studio product reviews PostgreSQL: approved cross-catalogue text, 20-item archive and publication/moderation gates OK')
}

main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(async () => {
  if (ids.games.length) await db.itemReview.deleteMany({ where: { itemType: 'game', itemId: { in: ids.games } } })
  if (ids.software.length) await db.itemReview.deleteMany({ where: { itemType: 'software', itemId: { in: ids.software } } })
  if (ids.games.length) await db.gameTitle.deleteMany({ where: { id: { in: ids.games } } })
  if (ids.software.length) await db.softwareTitle.deleteMany({ where: { id: { in: ids.software } } })
  if (ids.studio) await db.studio.deleteMany({ where: { id: ids.studio } })
  if (ids.users.length) await db.user.deleteMany({ where: { id: { in: ids.users } } })
  await db.$disconnect()
})
