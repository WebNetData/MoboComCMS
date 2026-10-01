// Run inside the local app container: node scripts/library-feed.connected.cjs
const assert = require('node:assert/strict')
const { PrismaClient } = require('@prisma/client')
const { encode } = require('next-auth/jwt')

const db = new PrismaClient()
const seed = `codex-library-feed-${Date.now()}`
const ids = []
let gameId = 0

async function cookie(user) {
  const token = await encode({ token: { uid: String(user.id), sub: String(user.id), email: user.email, name: user.email, role: user.role, roleId: user.roleId, authAt: Date.now() }, secret: process.env.NEXTAUTH_SECRET })
  return `next-auth.session-token=${token}`
}

async function main() {
  const owner = await db.user.create({ data: { email: `${seed}-owner@example.invalid`, passwordHash: 'test-only' } })
  const other = await db.user.create({ data: { email: `${seed}-other@example.invalid`, passwordHash: 'test-only' } })
  ids.push(owner.id, other.id)
  const playlist = await db.userMusicPlaylist.create({ data: { userId: owner.id, title: `${seed} personal playlist` } })
  const ownCollection = await db.userCollection.create({ data: { ownerId: owner.id, title: `${seed} private collection`, visibility: 'PRIVATE' } })
  const savedCollection = await db.userCollection.create({ data: { ownerId: other.id, title: `${seed} saved public collection`, visibility: 'PUBLIC' } })
  await db.userCollectionSave.create({ data: { userId: owner.id, collectionId: savedCollection.id } })
  const privateOther = await db.userCollection.create({ data: { ownerId: other.id, title: `${seed} hidden other collection`, visibility: 'PRIVATE' } })
  const game = await db.gameTitle.create({ data: { slug: seed, title: `${seed} purchased game`, status: 'PUBLISHED', access: 'PUBLIC' } })
  gameId = game.id
  await db.contentPurchase.create({ data: { userId: owner.id, ownerType: 'game', ownerId: gameId } })
  const response = await fetch('http://localhost:3000/dashboard/library', { headers: { cookie: await cookie(owner) } })
  assert.equal(response.status, 200)
  const html = await response.text()
  for (const title of [playlist.title, ownCollection.title, savedCollection.title, game.title]) assert.ok(html.includes(title), `${title} missing from library`)
  assert.ok(!html.includes(privateOther.title), 'another user private collection leaked')
  assert.ok(html.includes(`/collections/${savedCollection.id}`), 'saved collection link missing')
  const anonymous = await fetch('http://localhost:3000/dashboard/library', { redirect: 'manual' })
  const anonymousHtml = await anonymous.text()
  assert.ok(!anonymousHtml.includes(playlist.title) && !anonymousHtml.includes(ownCollection.title), `anonymous visitor saw private library content (${anonymous.status})`)
  console.log('Library feed: playlist, owned/saved collections, purchase and anonymous privacy OK')
}

main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(async () => {
  if (gameId) {
    await db.contentPurchase.deleteMany({ where: { ownerType: 'game', ownerId: gameId } })
    await db.gameTitle.deleteMany({ where: { id: gameId } })
  }
  if (ids.length) await db.user.deleteMany({ where: { id: { in: ids } } })
  await db.$disconnect()
})
