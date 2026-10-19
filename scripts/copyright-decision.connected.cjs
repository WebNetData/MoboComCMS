// Copyright decisions: the takedown, the decision, its moderation case and its audit commit together.
const assert = require('node:assert/strict'), { PrismaClient } = require('@prisma/client')
const db = new PrismaClient(), stamp = `copyright-${Date.now()}`
const events = []
const load = require('./connected-source-loader.cjs')({
  '@/platform/database/prisma': { db },
  '@/platform/observability/logger': { logEvent() {}, requestIdFrom: () => stamp },
  '@/modules/content/server/events': { contentChanged: (ref) => events.push(`${ref.type}:${ref.id}`) },
})
const copyright = load('src/modules/copyright/server/copyright.ts')
const report = (n) => ({ code: `${stamp}-${n}`, name: 'Owner', email: `${stamp}@example.invalid`, workTitle: 'Work', infringingUrls: 'https://example.invalid/x', description: 'copied', signature: 'Owner' })
async function main() { try {
  const admin = await db.user.create({ data: { email: `${stamp}@example.invalid`, passwordHash: 'unused', role: 'ADMIN' } })
  const post = await db.post.create({ data: { slug: stamp, title: stamp, content: '', authorId: admin.id, status: 'PUBLISHED' } })
  const one = await db.copyrightReport.create({ data: report(1) })
  const input = { status: 'ACCEPTED', resolution: 'removed after review', unpublish: [`post:${post.id}`, 'post:2147480000'] }
  // A failing audit leaves the item published, the report new and its case undecided; no content event is sent.
  await assert.rejects(copyright.decideReport(one.id, input, admin.id, async () => { throw Error('injected audit outage') }))
  assert.equal((await db.post.findUniqueOrThrow({ where: { id: post.id } })).status, 'PUBLISHED', 'takedown rolled back')
  assert.equal((await db.copyrightReport.findUniqueOrThrow({ where: { id: one.id } })).status, 'NEW')
  assert.equal(await db.moderationCase.count({ where: { source: 'copyright', itemId: one.id, status: 'DECIDED' } }), 0)
  assert.deepEqual(events, [])
  // Success: everything together, a missing item is written down instead of skipped, events follow the commit.
  let audited = null
  const result = await copyright.decideReport(one.id, input, admin.id, async (tx, decided) => { audited = decided; await tx.auditLog.create({ data: { actorUserId: admin.id, actorEmail: admin.email, action: `copyright.${decided.status.toLowerCase()}`, targetType: 'copyright-report', targetId: String(one.id), metadata: JSON.stringify({ actions: decided.actions }) } }) })
  assert.equal(result.status, 'ACCEPTED')
  assert.equal((await db.post.findUniqueOrThrow({ where: { id: post.id } })).status, 'DRAFT')
  assert.ok(result.actions.some((line) => line.includes(`#${post.id}`) && line.includes('از دسترس خارج شد')))
  assert.ok(result.actions.some((line) => line.includes('#2147480000') && line.includes('پیدا نشد')), 'a missing item is logged')
  assert.deepEqual(audited.actions, result.actions)
  const stored = await db.copyrightReport.findUniqueOrThrow({ where: { id: one.id } })
  assert.equal(stored.status, 'ACCEPTED'); assert.match(stored.actionTaken, /پیدا نشد/)
  assert.equal(await db.moderationCase.count({ where: { source: 'copyright', itemId: one.id, status: 'DECIDED' } }), 1)
  assert.equal(await db.auditLog.count({ where: { actorUserId: admin.id, action: 'copyright.accepted', targetId: String(one.id) } }), 1)
  assert.deepEqual(events, [`post:${post.id}`], 'one content event, after the commit, for the item actually removed')
  // A rejected report removes nothing.
  const two = await db.copyrightReport.create({ data: report(2) })
  await db.post.update({ where: { id: post.id }, data: { status: 'PUBLISHED' } })
  await copyright.decideReport(two.id, { ...input, status: 'REJECTED' }, admin.id)
  assert.equal((await db.post.findUniqueOrThrow({ where: { id: post.id } })).status, 'PUBLISHED')
  console.log('Copyright decisions: atomic takedown/decision/case/audit, rollback on audit failure, missing items logged, events after commit passed.')
} finally {
  const reports = await db.copyrightReport.findMany({ where: { code: { startsWith: stamp } }, select: { id: true } })
  await db.moderationDecision.deleteMany({ where: { case: { source: 'copyright', itemId: { in: reports.map((row) => row.id) } } } }).catch(() => undefined)
  await db.moderationCase.deleteMany({ where: { source: 'copyright', itemId: { in: reports.map((row) => row.id) } } })
  await db.copyrightReport.deleteMany({ where: { code: { startsWith: stamp } } })
  await db.contentRevision.deleteMany({ where: { entityType: 'posts', entityId: { in: (await db.post.findMany({ where: { slug: stamp }, select: { id: true } })).map((row) => row.id) } } })
  await db.post.deleteMany({ where: { slug: stamp } })
  const users = await db.user.findMany({ where: { email: { startsWith: stamp } }, select: { id: true } })
  await db.auditLog.deleteMany({ where: { actorUserId: { in: users.map((row) => row.id) } } })
  await db.user.deleteMany({ where: { email: { startsWith: stamp } } }); await db.$disconnect()
} }
main().catch(error => { console.error(error); process.exitCode = 1 })
