// Local PostgreSQL: node --env-file=.env scripts/game-release-notifications.connected.cjs
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript-api')
const { PrismaClient } = require('@prisma/client')

process.env.DATABASE_URL = process.env.MOBOCOM_CONNECTED_DATABASE_URL || 'postgresql://mobocom:mobocom-local@127.0.0.1:5435/mobocom?schema=public'
const db = new PrismaClient()
const seed = `codex-game-notice-${Date.now()}`
let gameId = 0, updateId = 0
const userIds = []

function load(relative, mocks) {
  const source = fs.readFileSync(path.join(__dirname, '..', relative), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', compiled)((name) => mocks[name] || require(name), mod, mod.exports)
  return mod.exports
}

async function main() {
  const inbox = load('src/modules/notifications/server/inbox.ts', { '@/platform/database/prisma': { db } })
  const releases = load('src/modules/games/server/release-notifications.ts', {
    '@/platform/database/prisma': { db },
    '@/modules/notifications/server/inbox': { createInboxEvent: inbox.createInboxEvent },
  })
  const active = await db.user.create({ data: { email: `${seed}-active@example.invalid`, passwordHash: 'test-only' } })
  const muted = await db.user.create({ data: { email: `${seed}-muted@example.invalid`, passwordHash: 'test-only' } })
  const late = await db.user.create({ data: { email: `${seed}-late@example.invalid`, passwordHash: 'test-only' } })
  userIds.push(active.id, muted.id, late.id)
  const yesterday = new Date(Date.now() - 86_400_000)
  const tomorrow = new Date(Date.now() + 86_400_000)
  const game = await db.gameTitle.create({ data: { slug: seed, title: 'Release notice test', status: 'DRAFT', publishedAt: yesterday } })
  gameId = game.id
  await db.itemFavorite.createMany({ data: [
    { userId: active.id, itemType: 'game', itemId: gameId, notify: true, createdAt: yesterday },
    { userId: muted.id, itemType: 'game', itemId: gameId, notify: false, createdAt: yesterday },
    { userId: late.id, itemType: 'game', itemId: gameId, notify: true, createdAt: tomorrow },
  ] })
  const update = await db.$transaction(async (tx) => {
    const row = await tx.gameUpdate.create({ data: { gameId, title: 'Patch 1', releasedAt: tomorrow } })
    await releases.scheduleGameUpdateRelease(tx, row)
    return row
  })
  updateId = update.id
  assert.equal((await db.gameUpdateReleaseNotification.findUniqueOrThrow({ where: { updateId } })).dueAt.getTime(), tomorrow.getTime())
  assert.equal((await releases.processGameUpdateReleaseNotifications()).checked, 0, 'scheduled update is not due')
  await db.$transaction(async (tx) => {
    const row = await tx.gameUpdate.update({ where: { id: updateId }, data: { releasedAt: yesterday } })
    await releases.scheduleGameUpdateRelease(tx, row, update)
  })
  assert.equal((await releases.processGameUpdateReleaseNotifications()).checked, 0, 'draft game cannot notify')
  await db.gameTitle.update({ where: { id: gameId }, data: { status: 'PUBLISHED' } })

  const key = `game:update:${updateId}:release:${active.id}`
  const collision = await db.userNotification.create({ data: { userId: muted.id, kind: 'FOLLOWED_UPDATE', dedupeKey: key, titleEn: 'Collision', titleFa: 'Collision', href: `/games/${seed}` } })
  await assert.rejects(releases.processGameUpdateReleaseNotifications(), /dedupe key collision/)
  assert.equal((await db.gameUpdateReleaseNotification.findUniqueOrThrow({ where: { updateId } })).lastUserId, 0, 'failure preserves cursor')
  await db.userNotification.delete({ where: { id: collision.id } })
  assert.equal((await releases.processGameUpdateReleaseNotifications()).sent, 1)
  assert.equal((await releases.processGameUpdateReleaseNotifications()).sent, 0)
  const notices = await db.userNotification.findMany({ where: { dedupeKey: { startsWith: `game:update:${updateId}:release:` } } })
  assert.deepEqual(notices.map((row) => row.userId), [active.id])
  assert.equal(await db.backgroundJob.count({ where: { dedupeKey: { startsWith: `notification:${notices[0].id}:` } } }), 3)
  assert.ok((await db.gameUpdateReleaseNotification.findUniqueOrThrow({ where: { updateId } })).completedAt)
  console.log('Game update notices PostgreSQL: schedule, draft gate, follower opt-out, cursor retry and once-only inbox delivery OK')
}

main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(async () => {
  const notices = updateId ? await db.userNotification.findMany({ where: { dedupeKey: { startsWith: `game:update:${updateId}:release:` } }, select: { id: true } }) : []
  for (const notice of notices) await db.backgroundJob.deleteMany({ where: { dedupeKey: { startsWith: `notification:${notice.id}:` } } })
  if (notices.length) await db.userNotification.deleteMany({ where: { id: { in: notices.map((row) => row.id) } } })
  if (gameId) {
    await db.itemFavorite.deleteMany({ where: { itemType: 'game', itemId: gameId } })
    await db.gameTitle.deleteMany({ where: { id: gameId } })
  }
  if (userIds.length) await db.user.deleteMany({ where: { id: { in: userIds } } })
  await db.$disconnect()
})
