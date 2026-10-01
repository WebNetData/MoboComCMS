// Run inside the local app container: node scripts/cinema-progress.connected.cjs
const assert = require('node:assert/strict')
const { PrismaClient } = require('@prisma/client')
const { encode } = require('next-auth/jwt')
const { createHmac } = require('node:crypto')

const db = new PrismaClient()
const base = 'http://localhost:3000'
const seed = `codex-watch-progress-${Date.now()}`
let userId = 0
let otherId = 0
let titleId = 0
let linkIds = []

async function cookie(user) {
  const token = await encode({ token: { uid: String(user.id), sub: String(user.id), email: user.email, name: user.email, role: user.role, roleId: user.roleId, authAt: Date.now() }, secret: process.env.NEXTAUTH_SECRET })
  return `next-auth.session-token=${token}`
}

async function put(cookieValue, linkId, positionSeconds, durationSeconds, origin = base) {
  return fetch(`${base}/api/cinema/progress`, { method: 'PUT', headers: { 'content-type': 'application/json', origin, ...(cookieValue ? { cookie: cookieValue } : {}) }, body: JSON.stringify({ linkId, positionSeconds, durationSeconds }) })
}

function pageToken(linkId, userId) {
  const expires = Math.floor(Date.now() / 1000) + 3600
  const signature = createHmac('sha256', process.env.NEXTAUTH_SECRET).update(`dl|l${linkId}|${expires}|${userId}`).digest('base64url').slice(0, 27)
  return `${expires.toString(36)}.${signature}`
}

async function main() {
  const owner = await db.user.create({ data: { email: `${seed}@example.invalid`, passwordHash: 'test-only' } })
  const other = await db.user.create({ data: { email: `${seed}-other@example.invalid`, passwordHash: 'test-only' } })
  userId = owner.id; otherId = other.id
  const title = await db.cinemaTitle.create({ data: { slug: seed, title: 'Watch progress test', status: 'PUBLISHED', access: 'PUBLIC' } })
  titleId = title.id
  const season = await db.cinemaSeason.create({ data: { titleId, number: 1 } })
  const episode = await db.cinemaEpisode.create({ data: { seasonId: season.id, number: 1 } })
  const episode2 = await db.cinemaEpisode.create({ data: { seasonId: season.id, number: 2 } })
  const season2 = await db.cinemaSeason.create({ data: { titleId, number: 2 } })
  const nextSeasonEpisode = await db.cinemaEpisode.create({ data: { seasonId: season2.id, number: 1 } })
  const links = await Promise.all([
    db.mediaLink.create({ data: { ownerType: 'title', ownerId: titleId, kind: 'STREAM', url: 'https://example.invalid/test.mp4' } }),
    db.mediaLink.create({ data: { ownerType: 'title', ownerId: titleId, kind: 'STREAM', url: 'https://example.invalid/test-720.mp4' } }),
    db.mediaLink.create({ data: { ownerType: 'episode', ownerId: episode.id, kind: 'STREAM', url: 'https://example.invalid/episode.mp4' } }),
    db.mediaLink.create({ data: { ownerType: 'episode', ownerId: episode2.id, kind: 'STREAM', url: 'https://example.invalid/episode-2.mp4' } }),
    db.mediaLink.create({ data: { ownerType: 'episode', ownerId: nextSeasonEpisode.id, kind: 'STREAM', url: 'https://example.invalid/season-2.mp4' } }),
  ])
  linkIds = links.map((link) => link.id)
  const own = await cookie(owner)
  assert.equal((await put('', links[0].id, 90, 600)).status, 401)
  assert.equal((await put(own, links[0].id, 90, 600, 'https://example.invalid')).status, 403)
  assert.equal((await put(own, links[0].id, 90, 600)).status, 200)
  assert.equal((await db.cinemaWatchProgress.findUniqueOrThrow({ where: { userId_ownerType_ownerId: { userId, ownerType: 'title', ownerId: titleId } } })).positionSeconds, 90)
  assert.equal((await put(own, links[1].id, 140, 600)).status, 200)
  assert.equal(await db.cinemaWatchProgress.count({ where: { userId } }), 1, 'different quality links share title progress')
  const watch = await fetch(`${base}/watch/${links[0].id}?t=${pageToken(links[0].id, userId)}`, { headers: { cookie: own } })
  assert.equal(watch.status, 200)
  const watchHtml = await watch.text()
  assert.match(watchHtml, /serverResume[^<]{0,80}140/, 'watch page receives server progress')
  const cinema = await fetch(`${base}/cinema`, { headers: { cookie: own } })
  assert.equal(cinema.status, 200)
  const cinemaHtml = await cinema.text()
  if (!cinemaHtml.includes('cn-continue-card')) {
    const session = await fetch(`${base}/api/auth/session`, { headers: { cookie: own } })
    const current = await db.cinemaWatchProgress.findMany({ where: { userId } })
    const titleNow = await db.cinemaTitle.findUnique({ where: { id: titleId }, select: { publishedAt: true, status: true } })
    throw new Error(`Continue Watching missing: session=${await session.text()}, progress=${JSON.stringify(current)}, title=${JSON.stringify(titleNow)}, mdBody=${cinemaHtml.includes('md-body')}, testTitle=${cinemaHtml.includes('Watch progress test')}`)
  }
  assert.equal((await put(own, links[2].id, 50, 1200)).status, 200)
  assert.equal(await db.cinemaWatchProgress.count({ where: { userId } }), 2, 'episode keeps independent progress')
  const firstEpisodeWatch = await fetch(`${base}/watch/${links[2].id}?t=${pageToken(links[2].id, userId)}`, { headers: { cookie: own } })
  assert.equal(firstEpisodeWatch.status, 200)
  assert.ok((await firstEpisodeWatch.text()).includes(`/watch/${links[3].id}`), 'first episode offers the second')
  const secondEpisodeWatch = await fetch(`${base}/watch/${links[3].id}?t=${pageToken(links[3].id, userId)}`, { headers: { cookie: own } })
  assert.equal(secondEpisodeWatch.status, 200)
  assert.ok((await secondEpisodeWatch.text()).includes(`/watch/${links[4].id}`), 'season boundary offers next season')
  await db.cinemaEpisode.update({ where: { id: nextSeasonEpisode.id }, data: { airDate: new Date(Date.now() + 60_000) } })
  const scheduledNext = await fetch(`${base}/watch/${links[3].id}?t=${pageToken(links[3].id, userId)}`, { headers: { cookie: own } })
  assert.ok(!(await scheduledNext.text()).includes(`/watch/${links[4].id}`), 'future episode must not be offered')
  await db.cinemaEpisode.update({ where: { id: nextSeasonEpisode.id }, data: { airDate: null, access: 'MEMBERS' } })
  const gatedNext = await fetch(`${base}/watch/${links[3].id}?t=${pageToken(links[3].id, userId)}`, { headers: { cookie: own } })
  assert.ok(!(await gatedNext.text()).includes(`/watch/${links[4].id}`), 'restricted episode must not be offered')
  assert.equal(await db.cinemaWatchProgress.count({ where: { userId: otherId } }), 0, 'watch progress is private')
  assert.equal((await put(own, links[0].id, 585, 600)).status, 200)
  const completed = await db.cinemaWatchProgress.findUniqueOrThrow({ where: { userId_ownerType_ownerId: { userId, ownerType: 'title', ownerId: titleId } } })
  assert.equal(completed.positionSeconds, 0)
  assert.ok(completed.completedAt)
  assert.equal((await put(own, links[0].id, 900, 600)).status, 404)
  await db.mediaLink.update({ where: { id: links[0].id }, data: { disabled: true } })
  assert.equal((await put(own, links[0].id, 30, 600)).status, 404)
  await db.cinemaTitle.update({ where: { id: titleId }, data: { publishedAt: new Date(Date.now() + 60_000) } })
  assert.equal((await put(own, links[1].id, 30, 600)).status, 404, 'scheduled title must not accept progress')
  console.log('Cinema: progress, privacy, next episode, season boundary, access and publication gating OK')
}

main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(async () => {
  if (linkIds.length) await db.mediaLink.deleteMany({ where: { id: { in: linkIds } } })
  if (titleId) await db.cinemaTitle.deleteMany({ where: { id: titleId } })
  if (userId || otherId) await db.user.deleteMany({ where: { id: { in: [userId, otherId].filter(Boolean) } } })
  await db.$disconnect()
})
