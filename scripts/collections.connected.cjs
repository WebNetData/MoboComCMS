// Run inside the local app container after migrations: node scripts/collections.connected.cjs
const assert = require('node:assert/strict')
const { PrismaClient } = require('@prisma/client')
const { encode } = require('next-auth/jwt')

const db = new PrismaClient()
const seed = `codex-collections-${Date.now()}`
const ids = []
let artistId = 0
let collectionId = 0
const base = 'http://localhost:3000'

async function cookie(user) {
  const token = await encode({ token: { uid: String(user.id), sub: String(user.id), email: user.email, authAt: Date.now() }, secret: process.env.NEXTAUTH_SECRET })
  return `next-auth.session-token=${token}`
}

async function call(path, method, cookieValue, body, origin = base) {
  return fetch(`${base}${path}`, { method, headers: { cookie: cookieValue, origin, ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
}

async function main() {
  const owner = await db.user.create({ data: { email: `${seed}-owner@example.invalid`, passwordHash: 'test-only' } })
  const member = await db.user.create({ data: { email: `${seed}-member@example.invalid`, passwordHash: 'test-only' } })
  const outsider = await db.user.create({ data: { email: `${seed}-outsider@example.invalid`, passwordHash: 'test-only' } })
  ids.push(owner.id, member.id, outsider.id)
  const artist = await db.musicArtist.create({ data: { slug: seed, name: 'Collection test artist' } })
  artistId = artist.id
  const first = await db.musicTrack.create({ data: { slug: `${seed}-a`, title: 'Collection test first', artistId, audioUrl: '/test.mp3', status: 'PUBLISHED', publishedAt: new Date(Date.now() - 1000) } })
  const second = await db.musicTrack.create({ data: { slug: `${seed}-b`, title: 'Collection test second', artistId, audioUrl: '/test.mp3', status: 'PUBLISHED', publishedAt: new Date(Date.now() - 1000) } })
  const draft = await db.musicTrack.create({ data: { slug: `${seed}-draft`, title: 'Collection draft', artistId, status: 'DRAFT' } })
  const [own, collaborator, other] = await Promise.all([cookie(owner), cookie(member), cookie(outsider)])
  assert.equal((await call('/api/collections', 'POST', own, { title: 'Test' }, 'https://example.invalid')).status, 403)
  const created = await call('/api/collections', 'POST', own, { title: 'Collection test', visibility: 'PRIVATE' })
  assert.equal(created.status, 201)
  collectionId = (await created.json()).id
  assert.equal((await fetch(`${base}/collections/${collectionId}`)).status, 404)
  assert.equal((await call(`/api/collections/${collectionId}`, 'PATCH', own, { visibility: 'UNLISTED' })).status, 200)
  const shareToken = (await db.userCollection.findUniqueOrThrow({ where: { id: collectionId } })).shareToken
  assert.ok(shareToken && shareToken.length >= 24)
  assert.equal((await fetch(`${base}/collections/${collectionId}`)).status, 404)
  assert.equal((await fetch(`${base}/collections/${collectionId}?share=${shareToken}`)).status, 200)
  assert.equal((await call(`/api/collections/${collectionId}/save`, 'PUT', other)).status, 404)
  assert.equal((await call(`/api/collections/${collectionId}/save?share=${shareToken}`, 'PUT', other)).status, 200)
  assert.equal((await call(`/api/collections/${collectionId}`, 'PATCH', own, { visibility: 'PRIVATE' })).status, 200)
  assert.equal(await db.userCollectionSave.count({ where: { collectionId } }), 0, 'privacy transition must revoke saves')
  assert.equal((await fetch(`${base}/collections/${collectionId}?share=${shareToken}`)).status, 404)
  assert.equal((await call(`/api/collections/${collectionId}/items`, 'POST', other, { item: `track:${first.id}` })).status, 404)
  assert.equal((await call(`/api/collections/${collectionId}/items`, 'POST', own, { item: `track:${draft.id}` })).status, 404)
  assert.equal((await call(`/api/collections/${collectionId}/items`, 'POST', own, { item: `track:${first.id}` })).status, 200)
  assert.equal((await call(`/api/collections/${collectionId}/items`, 'POST', own, { item: `track:${second.id}` })).status, 200)
  assert.equal((await call(`/api/collections/${collectionId}/items/order`, 'PATCH', own, { item: `track:${second.id}`, direction: 'up' })).status, 200)
  const ordered = await db.userCollectionItem.findMany({ where: { collectionId }, orderBy: { position: 'asc' } })
  assert.deepEqual(ordered.map((row) => row.itemId), [second.id, first.id])
  assert.equal((await call(`/api/collections/${collectionId}/collaborators`, 'POST', own, { email: member.email })).status, 200)
  assert.equal((await call(`/api/collections/${collectionId}/items?item=track:${first.id}`, 'DELETE', collaborator)).status, 200)
  assert.equal((await call(`/api/collections/${collectionId}`, 'PATCH', collaborator, { title: 'Hijack' })).status, 404)
  assert.equal((await call(`/api/collections/${collectionId}`, 'PATCH', own, { visibility: 'PUBLIC' })).status, 200)
  const publicPage = await fetch(`${base}/collections/${collectionId}`)
  assert.equal(publicPage.status, 200)
  assert.ok((await publicPage.text()).includes('Collection test second'))
  assert.equal((await call(`/api/collections/${collectionId}/follow`, 'PUT', other)).status, 200)
  assert.equal(await db.userCollectionFollow.count({ where: { collectionId } }), 1)
  assert.equal((await call(`/api/collections/${collectionId}/follow`, 'DELETE', other)).status, 200)
  assert.equal(await db.userCollectionFollow.count({ where: { collectionId } }), 0)
  assert.equal((await call(`/api/collections/${collectionId}/save`, 'PUT', other)).status, 200)
  assert.equal(await db.userCollectionSave.count({ where: { collectionId, userId: outsider.id } }), 1)
  const savedPage = await fetch(`${base}/dashboard/collections`, { headers: { cookie: other } })
  assert.equal(savedPage.status, 200)
  assert.ok((await savedPage.text()).includes('Collection test'))
  assert.equal((await call(`/api/collections/${collectionId}`, 'PATCH', own, { visibility: 'PRIVATE' })).status, 200)
  assert.equal((await call(`/api/collections/${collectionId}/save`, 'PUT', other)).status, 404)
  assert.equal((await call(`/api/collections/${collectionId}/save`, 'DELETE', other)).status, 200)
  assert.equal(await db.userCollectionSave.count({ where: { collectionId, userId: outsider.id } }), 0)
  assert.equal((await call(`/api/collections/${collectionId}`, 'DELETE', own)).status, 200)
  collectionId = 0
  console.log('Collections: privacy, live items, ordering, collaborator, follow, save and owner permissions OK')
}

main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(async () => {
  if (collectionId) await db.userCollection.deleteMany({ where: { id: collectionId } })
  if (artistId) {
    const tracks = await db.musicTrack.findMany({ where: { artistId }, select: { id: true } })
    await db.searchDocument.deleteMany({ where: { itemType: 'track', itemId: { in: tracks.map((track) => track.id) } } })
    await db.musicArtist.delete({ where: { id: artistId } })
  }
  if (ids.length) await db.user.deleteMany({ where: { id: { in: ids } } })
  await db.$disconnect()
})
