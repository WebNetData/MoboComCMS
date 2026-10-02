// Local PostgreSQL + port 3000: node --env-file=.env scripts/studio-follow.connected.cjs
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const { PrismaClient } = require('@prisma/client')
const { encode } = require('next-auth/jwt')

process.env.DATABASE_URL = process.env.MOBOCOM_CONNECTED_DATABASE_URL || 'postgresql://mobocom:mobocom-local@127.0.0.1:5435/mobocom?schema=public'
const db = new PrismaClient()
const seed = `codex-studio-follow-${Date.now()}`
const ids = { users: [], games: [], software: [], studios: [] }

function load(relative, mocks) {
  const source = fs.readFileSync(path.join(__dirname, '..', relative), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', compiled)((name) => mocks[name] || require(name), mod, mod.exports)
  return mod.exports
}

async function main() {
  const inbox = load('src/modules/notifications/server/inbox.ts', { '@/platform/database/prisma': { db } })
  const publications = load('src/modules/studios/server/publication-notifications.ts', {
    '@/platform/database/prisma': { db }, '@/modules/notifications/server/inbox': { createInboxEvent: inbox.createInboxEvent },
  })
  const admin = await db.user.findUniqueOrThrow({ where: { email: process.env.ADMIN_EMAIL } })
  const auth = async (user) => `next-auth.session-token=${await encode({ token: { uid: String(user.id), sub: String(user.id), email: user.email, role: user.role, roleId: user.roleId, authAt: Date.now() }, secret: process.env.NEXTAUTH_SECRET, maxAge: 3600 })}`
  const request = async (cookie, method, route, body) => fetch(`http://127.0.0.1:3000${route}`, { method, headers: { cookie, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(45_000) })
  const adminCookie = await auth(admin)
  const add = async (type, body) => {
    const res = await request(adminCookie, 'POST', `/api/admin/media-library?type=${type}`, body)
    assert.equal(res.status, 201, res.status === 201 ? '' : await res.text())
    const id = (await res.json()).id
    ids[type].push(id)
    return id
  }
  const studioName = `${seed} maker`
  const publisherName = `${seed} publisher`
  const softwareId = await add('software', { slug: `${seed}-base`, title: 'Base app', developer: studioName, publisher: publisherName, status: 'PUBLISHED', publishedAt: new Date(Date.now() - 86_400_000).toISOString() })
  const software = await db.softwareTitle.findUniqueOrThrow({ where: { id: softwareId } })
  ids.studios.push(software.developerStudioId, software.publisherStudioId)
  const active = await db.user.create({ data: { email: `${seed}-active@example.invalid`, passwordHash: 'test-only' } })
  const muted = await db.user.create({ data: { email: `${seed}-muted@example.invalid`, passwordHash: 'test-only' } })
  const late = await db.user.create({ data: { email: `${seed}-late@example.invalid`, passwordHash: 'test-only' } })
  ids.users.push(active.id, muted.id, late.id)
  const activeCookie = await auth(active)
  const profile = await request(activeCookie, 'GET', `/studios/${software.developerStudioId}`)
  assert.ok((await profile.text()).includes('دنبال‌کردن'), 'studio profile offers follow control')
  for (const studioId of ids.studios) {
    const res = await request(activeCookie, 'POST', '/api/engage/favorite', { item: `studio:${studioId}`, on: true, notify: true })
    assert.equal(res.status, 200, await res.text())
  }
  const favorites = await request(activeCookie, 'GET', '/favorites?type=studio')
  assert.ok((await favorites.text()).includes(studioName), 'followed studio appears in the member library')
  await db.itemFavorite.createMany({ data: [
    { userId: muted.id, itemType: 'studio', itemId: software.developerStudioId, notify: false },
    { userId: late.id, itemType: 'studio', itemId: software.developerStudioId, notify: true, createdAt: new Date(Date.now() + 3 * 86_400_000) },
  ] })
  const tomorrow = new Date(Date.now() + 86_400_000)
  const gameId = await add('games', { slug: `${seed}-game`, title: 'New studio game', developer: studioName, publisher: publisherName, status: 'DRAFT', publishedAt: tomorrow.toISOString() })
  assert.equal(await db.studioPublicationNotification.count({ where: { itemType: 'game', itemId: gameId } }), 0, 'draft does not schedule')
  const publish = await request(adminCookie, 'PATCH', '/api/admin/media-library?type=games', { id: gameId, status: 'PUBLISHED' })
  assert.equal(publish.status, 200, await publish.text())
  const cursor = await db.studioPublicationNotification.findUniqueOrThrow({ where: { itemType_itemId: { itemType: 'game', itemId: gameId } } })
  assert.equal(cursor.dueAt.getTime(), tomorrow.getTime(), 'admin publication schedules at publication date')
  assert.equal((await publications.processStudioPublicationNotifications()).sent, 0, 'future publication waits')
  const atDue = new Date(tomorrow.getTime() + 1000)
  assert.equal((await publications.processStudioPublicationNotifications(atDue)).sent, 1, 'both studio roles notify a member only once')
  assert.equal((await publications.processStudioPublicationNotifications(atDue)).sent, 0, 'repeat worker run does not duplicate')
  const notices = await db.userNotification.findMany({ where: { dedupeKey: { startsWith: `studio:game:${gameId}:published:` } } })
  assert.deepEqual(notices.map((row) => row.userId), [active.id], 'muted and late followers are excluded')
  assert.ok((await db.studioPublicationNotification.findUniqueOrThrow({ where: { itemType_itemId: { itemType: 'game', itemId: gameId } } })).completedAt)
  assert.equal(await db.backgroundJob.count({ where: { dedupeKey: { startsWith: `notification:${notices[0].id}:` } } }), 3, 'inbox event queues channel delivery')
  const newSoftwareId = await add('software', { slug: `${seed}-new-app`, title: 'New studio app', developer: studioName, publisher: publisherName, status: 'DRAFT', publishedAt: tomorrow.toISOString() })
  const bulk = await request(adminCookie, 'POST', '/api/admin/media-library/bulk?type=software', { ids: [newSoftwareId], action: 'publish' })
  assert.equal(bulk.status, 200, await bulk.text())
  assert.ok(await db.studioPublicationNotification.findUnique({ where: { itemType_itemId: { itemType: 'software', itemId: newSoftwareId } } }), 'bulk publish registers a cursor')
  const collisionKey = `studio:software:${newSoftwareId}:published:${active.id}`
  const collision = await db.userNotification.create({ data: { userId: muted.id, kind: 'FOLLOWED_UPDATE', dedupeKey: collisionKey, titleFa: 'Collision', titleEn: 'Collision', href: `/software/${seed}-new-app` } })
  await assert.rejects(publications.processStudioPublicationNotifications(atDue), /dedupe key collision/)
  assert.equal((await db.studioPublicationNotification.findUniqueOrThrow({ where: { itemType_itemId: { itemType: 'software', itemId: newSoftwareId } } })).lastUserId, 0, 'failed delivery preserves cursor')
  await db.userNotification.delete({ where: { id: collision.id } })
  assert.equal((await publications.processStudioPublicationNotifications(atDue)).sent, 1)
  assert.equal((await publications.processStudioPublicationNotifications(atDue)).sent, 0)
  console.log('Studio follow PostgreSQL: profile, authenticated follow, library, draft/future gates, both catalogues, two-role dedupe, opt-out, cutoff, retry and durable delivery OK')
}

main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(async () => {
  for (const type of ['game', 'software']) for (const id of ids[type === 'game' ? 'games' : 'software']) {
    const notices = await db.userNotification.findMany({ where: { dedupeKey: { startsWith: `studio:${type}:${id}:published:` } }, select: { id: true } })
    for (const notice of notices) await db.backgroundJob.deleteMany({ where: { dedupeKey: { startsWith: `notification:${notice.id}:` } } })
    if (notices.length) await db.userNotification.deleteMany({ where: { id: { in: notices.map((notice) => notice.id) } } })
    await db.studioPublicationNotification.deleteMany({ where: { itemType: type, itemId: id } })
  }
  if (ids.games.length) await db.gameTitle.deleteMany({ where: { id: { in: ids.games } } })
  if (ids.software.length) await db.softwareTitle.deleteMany({ where: { id: { in: ids.software } } })
  if (ids.studios.length) await db.studio.deleteMany({ where: { id: { in: ids.studios } } })
  if (ids.users.length) await db.user.deleteMany({ where: { id: { in: ids.users } } })
  await db.$disconnect()
})
