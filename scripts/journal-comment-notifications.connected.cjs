// Real PostgreSQL article comments and blocks; the inbox is a test double that records what would be sent.
const assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript'), {PrismaClient} = require('@prisma/client')
const db = new PrismaClient(), seed = `jcn${Date.now().toString(36)}`
const sent = []
let failInbox = false
const mocks = {
 '@/platform/database/prisma': {db},
 '@/platform/http/rate-limit': {rateLimitHit: () => ({ok: true})},
 '@/platform/observability/logger': {logEvent: () => {}},
 '@/modules/settings/server': {readJsonSetting: async (key, fallback) => fallback},
 '@/modules/notifications/server/inbox': {createInboxEvent: async event => { if (failInbox) throw new Error('inbox down'); sent.push(event); return event }},
}
const cache = new Map()
function load(file) {
 if (cache.has(file)) return cache.get(file).exports
 const mod = {exports: {}}; cache.set(file, mod)
 new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}}).outputText)(name => {
  if (Object.hasOwn(mocks, name)) return mocks[name]
  if (name.startsWith('@/')) {const path = `src/${name.slice(2)}`; return load(fs.existsSync(path + '.ts') ? path + '.ts' : path + '/index.ts')}
  return require(name)
 }, mod, mod.exports)
 return mod.exports
}
const take = () => sent.splice(0).map(event => [event.userId, event.kind, event.dedupeKey])
async function main() {
 const {notifyCommentPublished} = load('src/modules/journal/server/comment-notifications.ts')
 const users = {}
 for (const name of ['writer', 'replier', 'blocker']) users[name] = await db.user.create({data: {email: `${seed}-${name}@example.invalid`, passwordHash: 'test-only', name}})
 const {writer, replier, blocker} = users
 const live = await db.post.create({data: {slug: `${seed}-مقاله`, title: 'مقالهٔ آزمایشی', titleEn: 'Test article', content: 'x', status: 'PUBLISHED', publishedAt: new Date(Date.now() - 60_000)}})
 const scheduled = await db.post.create({data: {slug: `${seed}-later`, title: 'Later', content: 'x', status: 'PUBLISHED', publishedAt: new Date(Date.now() + 86_400_000)}})
 const comment = (post, user, status, parentId = null, body = 'a comment body that is long enough') => db.postComment.create({data: {postId: post.id, userId: user.id, status, parentId, body}})

 // --- a moderator approves a top-level comment: its author is told, once
 const top = await comment(live, writer, 'APPROVED')
 assert.deepEqual(await notifyCommentPublished(top.id, 'moderator'), {author: true, parent: false})
 const [event] = sent
 assert.equal(event.href, `/blog/${encodeURIComponent(live.slug)}`); assert.match(event.href, /^\/[A-Za-z0-9/_?=&.%-]*$/, 'a Persian slug still makes an inbox-safe link')
 assert.ok(event.bodyFa.includes('مقالهٔ آزمایشی') && event.bodyEn.includes('Test article'))
 assert.deepEqual(take(), [[writer.id, 'COMMENT_APPROVED', `post-comment:${top.id}:approved`]])
 // Published without review: the author just posted it and needs no notice.
 assert.deepEqual(await notifyCommentPublished(top.id, 'auto'), {author: false, parent: false}); assert.deepEqual(take(), [])

 // --- a reply: the author of the answered comment is told, and the replier when a moderator approved it
 const reply = await comment(live, replier, 'APPROVED', top.id, '  a reply\n\nwith   spacing  ')
 assert.deepEqual(await notifyCommentPublished(reply.id, 'moderator'), {author: true, parent: true})
 assert.equal(sent[1].bodyFa, 'a reply with spacing')
 assert.deepEqual(take(), [[replier.id, 'COMMENT_APPROVED', `post-comment:${reply.id}:approved`], [writer.id, 'COMMENT_REPLY', `post-comment:${reply.id}:reply`]])
 assert.deepEqual(await notifyCommentPublished(reply.id, 'auto'), {author: false, parent: true}); take()
 // Answering yourself is not news.
 const own = await comment(live, writer, 'APPROVED', top.id)
 assert.deepEqual(await notifyCommentPublished(own.id, 'auto'), {author: false, parent: false}); assert.deepEqual(take(), [])

 // --- nothing is announced that is not public
 const pending = await comment(live, replier, 'PENDING', top.id)
 assert.deepEqual(await notifyCommentPublished(pending.id, 'moderator'), {author: false, parent: false})
 const early = await comment(scheduled, writer, 'APPROVED')
 assert.deepEqual(await notifyCommentPublished(early.id, 'moderator'), {author: false, parent: false}, 'an article that is not live yet')
 const rejectedTop = await comment(live, writer, 'REJECTED')
 const orphan = await comment(live, replier, 'APPROVED', rejectedTop.id)
 assert.deepEqual(await notifyCommentPublished(orphan.id, 'auto'), {author: false, parent: false}, 'a reply under a comment that is not shown')
 assert.deepEqual(await notifyCommentPublished(999_999_999, 'moderator'), {author: false, parent: false})
 assert.deepEqual(take(), [])

 // --- a block, either way, stops the reply notice; the replier's own notice is unaffected
 const theirs = await comment(live, blocker, 'APPROVED')
 await db.userBlock.create({data: {blockerId: blocker.id, blockedId: replier.id}})
 const unwanted = await comment(live, replier, 'APPROVED', theirs.id)
 assert.deepEqual(await notifyCommentPublished(unwanted.id, 'moderator'), {author: true, parent: false})
 assert.deepEqual(take(), [[replier.id, 'COMMENT_APPROVED', `post-comment:${unwanted.id}:approved`]])
 await db.userBlock.deleteMany({where: {blockerId: blocker.id}}); await db.userBlock.create({data: {blockerId: replier.id, blockedId: blocker.id}})
 assert.deepEqual(await notifyCommentPublished(unwanted.id, 'auto'), {author: false, parent: false}); assert.deepEqual(take(), [])

 // --- a failing inbox is reported as nothing sent, never as an error to the caller
 failInbox = true
 assert.deepEqual(await notifyCommentPublished(top.id, 'moderator'), {author: false, parent: false})
 console.log('PostgreSQL article comment notices: author on moderator approval, answered author on reply, not for own reply, unpublished or blocked, inbox-safe link, inbox failure contained passed')
}
main().catch(error => {console.error(error); process.exitCode = 1}).finally(async () => {
 try {
  const ids = (await db.user.findMany({where: {email: {startsWith: seed}}, select: {id: true}})).map(user => user.id)
  await db.post.deleteMany({where: {slug: {startsWith: seed}}}); await db.userBlock.deleteMany({where: {OR: [{blockerId: {in: ids}}, {blockedId: {in: ids}}]}}); await db.user.deleteMany({where: {id: {in: ids}}})
 } finally {await db.$disconnect()}
})
