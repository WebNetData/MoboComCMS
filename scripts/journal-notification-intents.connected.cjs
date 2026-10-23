// Real PostgreSQL publication+intent rollback and actual Operations/Inbox retry/dedupe.
const assert = require('node:assert/strict'), { PrismaClient } = require('@prisma/client'), { NextRequest } = require('next/server')
const prisma = new PrismaClient(), stamp = `jintent${Date.now().toString(36)}`
let actor, failIntent = false, failInbox = false
const wrap = tx => new Proxy(tx, { get(target, key) {
 if (key === 'backgroundJob') return new Proxy(target.backgroundJob, { get(model, action) {
  if (action === 'create') return async args => { if (failIntent) throw Error('intent unavailable'); return model.create(args) }
  return typeof model[action] === 'function' ? model[action].bind(model) : model[action]
 } })
 if (key === '$transaction') return (fn, options) => typeof fn === 'function' ? prisma.$transaction(tx => fn(wrap(tx)), options) : prisma.$transaction(fn, options)
 return typeof target[key] === 'function' ? target[key].bind(target) : target[key]
} })
const load = require('./connected-source-loader.cjs')({
 '@/platform/database/prisma': { db: wrap(prisma) },
 '@/modules/identity/server/access': { requirePerm: async () => actor, requireUser: async () => actor },
 '@/modules/journal/server/admin': { getJournalSettings: async () => ({ autoApproveComments: true }) },
 '@/platform/http/rate-limit': { rateLimitHit: () => ({ ok: true }) },
 '@/platform/audit/server': { auditAdmin: async () => {} },
 '@/platform/observability/logger': { logEvent: () => {} },
 '@/modules/identity/server/profile': { blockedIds: async () => [] },
 '@/modules/notifications/server/inbox': { createInboxEvent: async event => {
  if (failInbox) throw Error('temporary inbox outage')
  return inbox.createInboxEvent(event)
 } },
})
const inbox = require('./connected-source-loader.cjs')({ '@/platform/database/prisma': { db: prisma } })('src/modules/notifications/server/inbox.ts')
const req = (url, body) => new NextRequest('http://localhost:3000' + url, { method: 'PATCH', headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' }, body: JSON.stringify(body) })
async function main() {
 if (!new URL(process.env.DATABASE_URL).pathname.includes('mobocom_reliability_')) throw Error('owned reliability database required')
 actor = await prisma.user.create({ data: { email: stamp + '@example.invalid', passwordHash: 'fixture', role: 'ADMIN' } })
 const post = await prisma.post.create({ data: { slug: stamp, title: stamp, content: 'owned', status: 'PUBLISHED', publishedAt: new Date(0) } })
 const comment = await prisma.postComment.create({ data: { postId: post.id, userId: actor.id, body: 'owned comment', status: 'PENDING' } })
 const { PATCH } = load('src/modules/site/server/http/admin/comments/route.ts')
 failIntent = true
 await assert.rejects(PATCH(req('/api/admin/comments', { id: comment.id, status: 'APPROVED' })), /intent unavailable/)
 assert.equal((await prisma.postComment.findUnique({ where: { id: comment.id } })).status, 'PENDING', 'intent failure rolls publication back')
 assert.equal(await prisma.backgroundJob.count({ where: { kind: 'journal.comment-published' } }), 0)
 failIntent = false
 assert.equal((await PATCH(req('/api/admin/comments', { id: comment.id, status: 'APPROVED' }))).status, 200)
 const intent = await prisma.backgroundJob.findFirstOrThrow({ where: { kind: 'journal.comment-published' } })
 assert.equal(JSON.parse(intent.payload).commentId, comment.id)
 const { runQueue } = load('src/modules/operations/server/queue.ts')
 failInbox = true
 await runQueue(300)
 const retained = await prisma.backgroundJob.findUniqueOrThrow({ where: { id: intent.id } })
 assert.equal(retained.status, 'QUEUED'); assert.equal(retained.attempts, 1); assert.match(retained.lastError, /outage/)
 assert.ok(retained.runAt > new Date())
 failInbox = false
 await prisma.backgroundJob.update({ where: { id: intent.id }, data: { runAt: new Date(0) } })
 // Hold transport jobs; this suite proves the Inbox/outbound job handoff, without contacting providers.
 const raw = prisma.backgroundJob.findFirst.bind(prisma.backgroundJob)
 prisma.backgroundJob.findFirst = args => raw({ ...args, where: { ...args.where, kind: 'journal.comment-published' } })
 await runQueue(300)
 assert.equal((await prisma.backgroundJob.findUniqueOrThrow({ where: { id: intent.id } })).status, 'DONE')
 assert.equal(await prisma.userNotification.count({ where: { userId: actor.id, kind: 'COMMENT_APPROVED' } }), 1)
 assert.equal(await prisma.backgroundJob.count({ where: { kind: 'notification.deliver' } }), 3)
 await prisma.backgroundJob.update({ where: { id: intent.id }, data: { status: 'QUEUED', runAt: new Date(0) } })
 await runQueue(300)
 assert.equal(await prisma.userNotification.count({ where: { userId: actor.id, kind: 'COMMENT_APPROVED' } }), 1, 'replay does not duplicate notice')
 assert.equal(await prisma.backgroundJob.count({ where: { kind: 'notification.deliver' } }), 3, 'replay does not duplicate delivery')
 const hidden = await prisma.postComment.create({ data: { postId: post.id, userId: actor.id, body: 'hidden', status: 'APPROVED' } })
 await prisma.$transaction(tx => load('src/modules/journal/server/comment-notification-intents.ts').queueCommentNotification(tx, hidden.id, 'moderator'))
 await prisma.postComment.update({ where: { id: hidden.id }, data: { status: 'REJECTED' } })
 await runQueue(300)
 assert.equal(await prisma.userNotification.count({ where: { dedupeKey: `post-comment:${hidden.id}:approved` } }), 0, 'worker rechecks publication')
 console.log('Journal intents: atomic rollback, retained retry/backoff, recovery, dedupe, transport handoff and hidden-current-state refusal passed')
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => {
 try {
  if (!actor) return
  const users = await prisma.user.findMany({ where: { email: { startsWith: stamp } }, select: { id: true } })
  const notices = await prisma.userNotification.findMany({ where: { userId: { in: users.map(x => x.id) } }, select: { id: true } })
  const comments = await prisma.postComment.findMany({ where: { post: { slug: stamp } }, select: { id: true } })
  const jobs = [...comments.map(x => ({ dedupeKey: { startsWith: `journal-comment:${x.id}:` } })), ...notices.map(x => ({ dedupeKey: { startsWith: `notification:${x.id}:` } }))]
  if (jobs.length) await prisma.backgroundJob.deleteMany({ where: { OR: jobs } })
  await prisma.post.deleteMany({ where: { slug: stamp } }); await prisma.user.deleteMany({ where: { id: { in: users.map(x => x.id) } } })
 } finally { await prisma.$disconnect() }
})
