// Run inside the local app container after migrations: node scripts/music-release.connected.cjs
const assert = require('node:assert/strict')
const { PrismaClient } = require('@prisma/client')

const db = new PrismaClient()
const seed = `codex-release-${Date.now()}`
let artistId = 0
const userIds = []
const trackIds = []

async function runJobs() {
  const response = await fetch('http://localhost:3000/api/internal/engage/run', {
    method: 'POST', headers: { authorization: `Bearer ${process.env.INTERNAL_JOBS_SECRET}` },
  })
  const body = await response.text()
  assert.equal(response.status, 200, body)
  return JSON.parse(body)
}

async function main() {
  assert.ok(process.env.INTERNAL_JOBS_SECRET, 'INTERNAL_JOBS_SECRET is required')
  const active = await db.user.create({ data: { email: `${seed}-active@example.invalid`, passwordHash: 'test-only', name: 'Release test', smsAlerts: false, emailAlerts: false } })
  userIds.push(active.id)
  const muted = await db.user.create({ data: { email: `${seed}-muted@example.invalid`, passwordHash: 'test-only', name: 'Release test', smsAlerts: false, emailAlerts: false } })
  userIds.push(muted.id)
  const artist = await db.musicArtist.create({ data: { slug: seed, name: 'Test Artist' } })
  artistId = artist.id
  const followedAt = new Date(Date.now() - 60_000)
  await db.itemFavorite.createMany({ data: [
    { userId: active.id, itemType: 'artist', itemId: artist.id, notify: true, createdAt: followedAt },
    { userId: muted.id, itemType: 'artist', itemId: artist.id, notify: false, createdAt: followedAt },
  ] })
  const immediate = await db.musicTrack.create({ data: { slug: `${seed}-now`, title: 'Immediate test track', artistId: artist.id, status: 'PUBLISHED', publishedAt: new Date(Date.now() - 30_000) } })
  const scheduled = await db.musicTrack.create({ data: { slug: `${seed}-later`, title: 'Scheduled test track', artistId: artist.id, status: 'PUBLISHED', publishedAt: new Date(Date.now() + 3_600_000) } })
  const draft = await db.musicTrack.create({ data: { slug: `${seed}-draft`, title: 'Draft test track', artistId: artist.id, status: 'DRAFT' } })
  trackIds.push(immediate.id, scheduled.id, draft.id)
  await db.musicTrackReleaseNotification.createMany({ data: [
    { trackId: immediate.id, dueAt: new Date(Date.now() - 10_000) },
    { trackId: scheduled.id, dueAt: scheduled.publishedAt },
    { trackId: draft.id, dueAt: new Date(Date.now() - 20_000) },
  ] })

  await runJobs()
  let notices = await db.userNotification.findMany({ where: { userId: { in: userIds }, dedupeKey: { startsWith: 'music:track:' } } })
  assert.equal(notices.length, 1)
  assert.equal(notices[0].userId, active.id)
  assert.equal(notices[0].href, `/music/track/${immediate.slug}`)
  assert.equal((await db.musicTrackReleaseNotification.findUniqueOrThrow({ where: { trackId: scheduled.id } })).completedAt, null)

  const releasedAt = new Date()
  await db.musicTrack.update({ where: { id: scheduled.id }, data: { publishedAt: releasedAt } })
  await db.musicTrackReleaseNotification.update({ where: { trackId: scheduled.id }, data: { dueAt: releasedAt } })
  await runJobs()
  await runJobs()
  notices = await db.userNotification.findMany({ where: { userId: { in: userIds }, dedupeKey: { startsWith: 'music:track:' } } })
  assert.equal(notices.length, 2, 'scheduled release should arrive once after becoming live')
  assert.ok(notices.every((notice) => notice.userId === active.id))
  console.log('Music release notifications: immediate, scheduled, muted, draft, and dedupe OK')
}

main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(async () => {
  if (artistId) {
    await db.itemFavorite.deleteMany({ where: { itemType: 'artist', itemId: artistId, userId: { in: userIds } } })
    await db.musicArtist.delete({ where: { id: artistId } })
  }
  if (trackIds.length) await db.searchDocument.deleteMany({ where: { itemType: 'track', itemId: { in: trackIds } } })
  if (userIds.length) await db.user.deleteMany({ where: { id: { in: userIds } } })
  await db.$disconnect()
})
