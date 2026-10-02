// Local PostgreSQL + port 3000: node --env-file=.env scripts/software-release.connected.cjs
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const { PrismaClient } = require('@prisma/client')

process.env.DATABASE_URL = process.env.MOBOCOM_CONNECTED_DATABASE_URL || 'postgresql://mobocom:mobocom-local@127.0.0.1:5435/mobocom?schema=public'
const db = new PrismaClient()
const slug = `codex-software-release-${Date.now()}`
let softwareId = 0, releaseId = 0, linkId = 0
const userIds = []
const rendered = (html) => html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
const get = (route) => fetch(`http://127.0.0.1:3000${route}`, { redirect: 'manual', headers: { accept: 'application/json' }, signal: AbortSignal.timeout(45_000) })

function load(relative, mocks) {
  const source = fs.readFileSync(path.join(__dirname, '..', relative), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', compiled)((name) => mocks[name] || require(name), mod, mod.exports)
  return mod.exports
}

async function main() {
  const inbox = load('src/modules/notifications/server/inbox.ts', { '@/platform/database/prisma': { db } })
  const notices = load('src/modules/software/server/release-notifications.ts', {
    '@/platform/database/prisma': { db },
    '@/modules/notifications/server/inbox': { createInboxEvent: inbox.createInboxEvent },
    '@/modules/content/server/events': { contentChanged: () => undefined },
  })
  const projection = load('src/modules/software/server/current-version.ts', { '@/platform/database/prisma': { db } })
  const yesterday = new Date(Date.now() - 86_400_000)
  const tomorrow = new Date(Date.now() + 86_400_000)
  const software = await db.softwareTitle.create({ data: { slug, title: 'Codex software release', version: 'future-9.9', changelog: 'future-secret', publishedAt: yesterday } })
  softwareId = software.id
  const release = await db.$transaction(async (tx) => {
    const row = await tx.softwareRelease.create({ data: { softwareId, version: 'future-9.9', changelog: 'future-secret', status: 'PUBLISHED', releasedAt: tomorrow } })
    await notices.scheduleSoftwareRelease(tx, row, null)
    return row
  })
  releaseId = release.id
  const link = await db.mediaLink.create({ data: { ownerType: 'softwarerelease', ownerId: releaseId, label: 'Future file', url: 'https://example.invalid/software-future.zip' } })
  linkId = link.id
  const future = rendered(await (await get(`/software/${slug}`)).text())
  assert.ok(!future.includes('future-9.9') && !future.includes('future-secret'), 'future version and changelog stay off the public page')
  const futureBrowse = rendered(await (await get('/software/browse?q=Codex%20software%20release')).text())
  assert.ok(futureBrowse.includes(slug) && !futureBrowse.includes('future-9.9'), 'catalogue card hides the future version')
  assert.equal((await projection.currentSoftwareVersions([softwareId])).get(softwareId), null)
  assert.equal(projection.projectSoftwareVersion(software, await projection.currentSoftwareVersions([softwareId])).version, '')
  assert.equal((await get(`/api/media/link/${linkId}`)).status, 404, 'future file is closed')
  assert.equal((await notices.processSoftwareReleaseNotifications()).checked, 0, 'future release is not notified')

  const active = await db.user.create({ data: { email: `${slug}-active@example.invalid`, passwordHash: 'test-only' } })
  const muted = await db.user.create({ data: { email: `${slug}-muted@example.invalid`, passwordHash: 'test-only' } })
  userIds.push(active.id, muted.id)
  await db.itemFavorite.createMany({ data: [
    { userId: active.id, itemType: 'software', itemId: softwareId, notify: true, createdAt: yesterday },
    { userId: muted.id, itemType: 'software', itemId: softwareId, notify: false, createdAt: yesterday },
  ] })
  await db.softwareRelease.update({ where: { id: releaseId }, data: { status: 'DRAFT', releasedAt: yesterday } })
  await db.softwareReleaseNotification.update({ where: { releaseId }, data: { dueAt: yesterday } })
  assert.equal((await notices.processSoftwareReleaseNotifications()).checked, 0, 'draft release is not notified')
  await db.softwareRelease.update({ where: { id: releaseId }, data: { status: 'PUBLISHED' } })
  const live = rendered(await (await get(`/software/${slug}`)).text())
  assert.ok(live.includes('future-9.9') && live.includes('future-secret'), 'due version and changelog appear')
  const liveBrowse = rendered(await (await get('/software/browse?q=Codex%20software%20release')).text())
  assert.ok(liveBrowse.includes('future-9.9'), 'catalogue card follows the due release')
  assert.equal((await projection.currentSoftwareVersions([softwareId])).get(softwareId)?.version, 'future-9.9')
  assert.notEqual((await get(`/api/media/link/${linkId}`)).status, 404, 'due file passes publication gate')
  await db.softwareTitle.update({ where: { id: softwareId }, data: { publishedAt: tomorrow } })
  assert.equal((await get(`/api/media/link/${linkId}`)).status, 404, 'scheduled parent closes direct file access')
  assert.equal((await notices.processSoftwareReleaseNotifications()).checked, 0, 'scheduled parent blocks notices')
  await db.softwareTitle.update({ where: { id: softwareId }, data: { publishedAt: yesterday } })
  assert.equal((await notices.processSoftwareReleaseNotifications()).sent, 1)
  assert.equal((await notices.processSoftwareReleaseNotifications()).sent, 0, 'cursor is idempotent')
  const emitted = await db.userNotification.findMany({ where: { dedupeKey: { startsWith: `software:release:${releaseId}:` } } })
  assert.deepEqual(emitted.map((row) => row.userId), [active.id])
  assert.equal(await db.backgroundJob.count({ where: { dedupeKey: { startsWith: `notification:${emitted[0].id}:` } } }), 3)
  console.log('Software releases: future/draft/parent gates, public timeline, direct link and durable follower delivery OK')
}

main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(async () => {
  const notifications = releaseId ? await db.userNotification.findMany({ where: { dedupeKey: { startsWith: `software:release:${releaseId}:` } }, select: { id: true } }) : []
  for (const notice of notifications) await db.backgroundJob.deleteMany({ where: { dedupeKey: { startsWith: `notification:${notice.id}:` } } })
  if (notifications.length) await db.userNotification.deleteMany({ where: { id: { in: notifications.map((row) => row.id) } } })
  if (softwareId) await db.itemFavorite.deleteMany({ where: { itemType: 'software', itemId: softwareId } })
  if (linkId) await db.mediaLink.deleteMany({ where: { id: linkId } })
  if (softwareId) await db.softwareTitle.deleteMany({ where: { id: softwareId } })
  if (userIds.length) await db.user.deleteMany({ where: { id: { in: userIds } } })
  await db.$disconnect()
})
