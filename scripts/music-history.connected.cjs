// Run inside the local app container after migrations: node scripts/music-history.connected.cjs
const assert = require('node:assert/strict')
const { PrismaClient } = require('@prisma/client')
const { encode } = require('next-auth/jwt')

const db = new PrismaClient()
const seed = `codex-history-${Date.now()}`
const userIds = []
let artistId = 0

async function cookie(user) {
  const secret = process.env.NEXTAUTH_SECRET
  assert.ok(secret, 'NEXTAUTH_SECRET is required')
  const token = await encode({ token: { uid: String(user.id), sub: String(user.id), email: user.email, authAt: Date.now() }, secret })
  return `next-auth.session-token=${token}`
}

async function main() {
  const first = await db.user.create({ data: { email: `${seed}-a@example.invalid`, passwordHash: 'test-only' } })
  const second = await db.user.create({ data: { email: `${seed}-b@example.invalid`, passwordHash: 'test-only' } })
  userIds.push(first.id, second.id)
  const artist = await db.musicArtist.create({ data: { slug: seed, name: 'History test artist' } })
  artistId = artist.id
  const track = await db.musicTrack.create({ data: { slug: `${seed}-track`, title: 'History test track', artistId: artist.id, audioUrl: '/test-audio.mp3', status: 'PUBLISHED', publishedAt: new Date(Date.now() - 1000) } })
  const firstCookie = await cookie(first)
  const secondCookie = await cookie(second)
  const api = 'http://localhost:3000/api/music/history'
  const headers = { cookie: firstCookie, origin: 'http://localhost:3000', 'content-type': 'application/json' }
  const post = () => fetch(api, { method: 'POST', headers, body: JSON.stringify({ trackId: track.id }) })
  assert.equal((await fetch(api, { method: 'POST', headers: { ...headers, origin: 'https://example.invalid' }, body: JSON.stringify({ trackId: track.id }) })).status, 403)
  assert.equal((await fetch(api, { method: 'POST', headers, body: JSON.stringify({ trackId: track.id, padding: 'x'.repeat(300) }) })).status, 400)
  assert.equal((await post()).status, 200)
  assert.equal((await post()).status, 200)
  let history = await db.musicListenHistory.findUnique({ where: { userId_trackId: { userId: first.id, trackId: track.id } } })
  assert.equal(history?.playCount, 1, 'rapid repeat must be deduplicated')
  const progressUrl = `${api}?trackId=${track.id}`
  const progress = (position, duration, completed) => fetch(api, { method: 'PATCH', headers, body: JSON.stringify({ trackId: track.id, position, duration, completed }) })
  assert.equal((await progress(42, 180, false)).status, 200)
  assert.equal((await progress(181, 180, false)).status, 400)
  const saved = await fetch(progressUrl, { headers: { cookie: firstCookie } }).then((response) => response.json())
  assert.equal(saved.positionSeconds, 42)
  assert.equal(saved.durationSeconds, 180)
  const stranger = await fetch(progressUrl, { headers: { cookie: secondCookie } }).then((response) => response.json())
  assert.equal(stranger.positionSeconds, 0)
  assert.equal(await db.musicListenHistory.count({ where: { userId: second.id } }), 0)
  const ownPage = await fetch('http://localhost:3000/music/history', { headers: { cookie: firstCookie } })
  assert.equal(ownPage.status, 200)
  assert.ok((await ownPage.text()).includes('History test track'))
  const otherPage = await fetch('http://localhost:3000/music/history', { headers: { cookie: secondCookie } })
  assert.equal(otherPage.status, 200)
  assert.ok(!(await otherPage.text()).includes('History test track'))
  const library = await fetch('http://localhost:3000/dashboard/library', { headers: { cookie: firstCookie } })
  assert.equal(library.status, 200)
  assert.ok((await library.text()).includes('/music/history'))
  assert.equal((await progress(180, 180, true)).status, 200)
  history = await db.musicListenHistory.findUnique({ where: { userId_trackId: { userId: first.id, trackId: track.id } } })
  assert.ok(history?.completedAt)
  assert.equal((await fetch(api, { method: 'DELETE', headers: { cookie: firstCookie, origin: 'http://localhost:3000' } })).status, 200)
  history = await db.musicListenHistory.findUnique({ where: { userId_trackId: { userId: first.id, trackId: track.id } } })
  assert.equal(history, null)
  console.log('Music history: owner isolation, dedupe, private page, and clear OK')
}

main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(async () => {
  if (artistId) await db.musicArtist.delete({ where: { id: artistId } })
  if (userIds.length) await db.user.deleteMany({ where: { id: { in: userIds } } })
  await db.$disconnect()
})
