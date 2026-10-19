// Real PostgreSQL: a moderator's hide or show settles the flags waiting on a forum post or topic.
// FORUM_FLAG_BASELINE=<git ref> loads the forum actions from that ref to show the fault there.
const assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript-api'), {execFileSync} = require('node:child_process'), {PrismaClient} = require('@prisma/client')
const db = new PrismaClient(), seed = `ffq${Date.now().toString(36)}`, baseline = process.env.FORUM_FLAG_BASELINE
const mocks = {
 '@/platform/database/prisma': {db},
 '@/platform/http/rate-limit': {rateLimitHit: () => ({ok: true})},
 '@/platform/observability/logger': {logEvent: () => {}},
 '@/modules/content/server/events': {contentChanged: () => {}},
 '@/modules/content/server/registry': {itemCard: async () => null},
 '@/modules/forum/server/community': {getForumSettings: async () => ({flagHideWeight: 3}), notify: async () => {}, refreshStats: async () => {}},
 '@/modules/forum/server/polls': {checkPolls: async () => {}, syncPolls: async () => {}},
 '@/modules/forum/server/related': {ENTITY_TOPIC_TYPES: [], publicEntityCategoryIds: async () => []},
}
const source = file => baseline && file === 'src/modules/forum/server/actions.ts' ? execFileSync('git', ['show', `${baseline}:${file}`], {encoding: 'utf8', maxBuffer: 1 << 26}) : fs.readFileSync(file, 'utf8')
const cache = new Map()
function load(file) {
 if (cache.has(file)) return cache.get(file).exports
 const mod = {exports: {}}; cache.set(file, mod)
 new Function('require', 'module', 'exports', ts.transpileModule(source(file), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}}).outputText)(name => {
  if (Object.hasOwn(mocks, name)) return mocks[name]
  if (name.startsWith('@/')) {const path = `src/${name.slice(2)}`; return load(fs.existsSync(path + '.ts') ? path + '.ts' : path + '/index.ts')}
  return require(name)
 }, mod, mod.exports)
 return mod.exports
}
async function main() {
 const forum = load('src/modules/forum/server/actions.ts')
 const users = {}
 for (const name of ['author', 'a', 'b', 'c', 'd', 'mod']) users[name] = await db.user.create({data: {email: `${seed}-${name}@example.invalid`, passwordHash: 'test-only', name}})
 const viewer = (user, moderator = false) => ({userId: user.id, groupIds: [], trustLevel: 1, moderator, member: false, silenced: false, suspended: false})
 const mod = viewer(users.mod, true)
 const category = await db.forumCategory.create({data: {slug: `${seed}-cat`, title: 'Flag queue test'}})
 const topic = async name => {
  const thread = await db.forumThread.create({data: {categoryId: category.id, userId: users.author.id, title: name}})
  const first = await db.forumPost.create({data: {threadId: thread.id, userId: users.author.id, content: `${name} opening post`, postNumber: 1}})
  const reply = await db.forumPost.create({data: {threadId: thread.id, userId: users.author.id, content: `${name} reply`, postNumber: 2}})
  return {thread, first, reply}
 }
 const flag = (user, post) => forum.flag(viewer(user), post.id, {reason: 'SPAM'})
 const statuses = async post => (await db.forumFlag.findMany({where: {postId: post.id}, orderBy: {id: 'asc'}})).map(row => row.status)
 const postStatus = async post => (await db.forumPost.findUniqueOrThrow({where: {id: post.id}})).status
 const threadStatus = async thread => (await db.forumThread.findUniqueOrThrow({where: {id: thread.id}})).status

 // --- a reply: three flags hide it; the moderator shows it again; one more flag must not hide it again
 const one = await topic('one')
 assert.deepEqual(await flag(users.a, one.reply), {flagged: true, hidden: false}); await flag(users.b, one.reply)
 assert.deepEqual(await flag(users.c, one.reply), {flagged: true, hidden: true})
 assert.equal(await postStatus(one.reply), 'HIDDEN')
 await forum.moderatePost(mod, one.reply.id, 'show')
 assert.equal(await postStatus(one.reply), 'VISIBLE')
 assert.deepEqual(await statuses(one.reply), ['DISAGREED', 'DISAGREED', 'DISAGREED'], 'showing the post answers the flags that hid it')
 const handled = await db.forumFlag.findFirstOrThrow({where: {postId: one.reply.id}})
 assert.equal(handled.handledBy, users.mod.id); assert.ok(handled.handledAt)
 assert.deepEqual(await flag(users.d, one.reply), {flagged: true, hidden: false}, 'a single new flag does not undo the moderator\'s decision')
 assert.equal(await postStatus(one.reply), 'VISIBLE')
 // --- a reply hidden by the moderator directly: its flags are agreed and leave the queue
 await forum.moderatePost(mod, one.reply.id, 'hide')
 assert.deepEqual(await statuses(one.reply), ['DISAGREED', 'DISAGREED', 'DISAGREED', 'AGREED'])
 assert.equal(await db.forumFlag.count({where: {postId: one.reply.id, status: 'PENDING'}}), 0)

 // --- a topic is flagged through its first post; hiding or showing the topic settles those flags, not the replies'
 const two = await topic('two')
 await flag(users.a, two.first); await flag(users.b, two.first); await flag(users.a, two.reply)
 assert.deepEqual(await flag(users.c, two.first), {flagged: true, hidden: true})
 assert.equal(await threadStatus(two.thread), 'HIDDEN')
 await forum.moderateThread(mod, two.thread.id, {status: 'VISIBLE'})
 assert.deepEqual(await statuses(two.first), ['DISAGREED', 'DISAGREED', 'DISAGREED'])
 assert.deepEqual(await statuses(two.reply), ['PENDING'], 'a reply\'s own flag still waits for a decision')
 assert.deepEqual(await flag(users.d, two.first), {flagged: true, hidden: false}); assert.equal(await threadStatus(two.thread), 'VISIBLE')
 await forum.moderateThread(mod, two.thread.id, {status: 'HIDDEN'})
 assert.deepEqual(await statuses(two.first), ['DISAGREED', 'DISAGREED', 'DISAGREED', 'AGREED'])
 // Pinning or locking is not a decision about flags.
 const three = await topic('three')
 await flag(users.a, three.first)
 await forum.moderateThread(mod, three.thread.id, {pinned: true, locked: true, status: 'VISIBLE'})
 assert.deepEqual(await statuses(three.first), ['PENDING'])
 // The flag queue's own decisions work as before.
 await forum.resolveFlags(mod, three.first.id, 'agree')
 assert.deepEqual(await statuses(three.first), ['AGREED']); assert.equal(await threadStatus(three.thread), 'HIDDEN')
 console.log('PostgreSQL forum flags settled by moderator show and hide for replies and topics, no re-hide by a single flag, unrelated flags untouched passed')
}
main().catch(error => {console.error(error); process.exitCode = 1}).finally(async () => {
 try {
  await db.forumCategory.deleteMany({where: {slug: {startsWith: seed}}})
  await db.user.deleteMany({where: {email: {startsWith: seed}}})
 } finally {await db.$disconnect()}
})
