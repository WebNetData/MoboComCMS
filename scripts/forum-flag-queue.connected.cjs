// Real PostgreSQL: a moderator's hide or show settles the flags waiting on a forum post or topic; a flag decision
// commits its flags, the post or topic and the overview's cases together, and deleting content decides its waiting flags.
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
 '@/modules/forum/server/forum': {authorsFor: async () => new Map(), fallbackAuthor: () => ({})},
}
// The review queue reads the held post before deciding; staleRead hands it the row as another moderator saw it.
let staleRead = null
const bound = (target, key) => {const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value}
const staleDb = new Proxy(db, {get: (target, key) => key === 'forumPost' ? new Proxy(target.forumPost, {get: (posts, name) => name === 'findUnique' && staleRead ? async () => {const row = staleRead; staleRead = null; return row} : bound(posts, name)}) : bound(target, key)})
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
// The overview's cases are the real ones; failCases makes the case store fail inside the owner's transaction.
let failCases = false
async function main() {
 const cases = load('src/modules/moderation/server/cases.ts')
 mocks['@/modules/moderation/server/cases'] = {...cases, completeOwnerCase: async (...args) => {if (failCases) throw new Error('case store unavailable'); return cases.completeOwnerCase(...args)}}
 const forum = load('src/modules/forum/server/actions.ts')
 mocks['@/platform/database/prisma'] = {db: staleDb}
 const review = load('src/modules/forum/server/moderation.ts')
 mocks['@/platform/database/prisma'] = {db}
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
 const caseOf = async flagRow => db.moderationCase.findUnique({where: {source_itemId: {source: 'forum-flags', itemId: flagRow.id}}})
 const flagsOf = post => db.forumFlag.findMany({where: {postId: post.id}, orderBy: {id: 'asc'}})
 const decided = async (post, decision) => {
  for (const row of await flagsOf(post)) {const found = await caseOf(row); assert.equal(found?.status, 'DECIDED', `flag ${row.id} case decided`); assert.equal(found.decision, decision); assert.equal(found.decidedById, users.mod.id)}
 }
 await decided(three.first, 'approve')
 // A second decision on the same flags finds nothing waiting: refused, and the topic stays as the first decision left it.
 await assert.rejects(forum.resolveFlags(mod, three.first.id, 'disagree'), error => error.status === 409)
 assert.equal(await threadStatus(three.thread), 'HIDDEN'); assert.deepEqual(await statuses(three.first), ['AGREED'])

 // --- atomic: when the case store fails, the flags stay pending and the post keeps its status
 const four = await topic('four')
 await flag(users.a, four.reply)
 failCases = true
 await assert.rejects(forum.resolveFlags(mod, four.reply.id, 'agree'), /case store unavailable/)
 await assert.rejects(forum.resolveFlags(mod, four.reply.id, 'delete'), /case store unavailable/)
 failCases = false
 assert.deepEqual(await statuses(four.reply), ['PENDING'], 'a failed decision leaves the flag waiting')
 assert.equal(await postStatus(four.reply), 'VISIBLE', 'and the post untouched')
 assert.equal(await caseOf((await flagsOf(four.reply))[0]), null)
 await forum.resolveFlags(mod, four.reply.id, 'disagree')
 assert.deepEqual(await statuses(four.reply), ['DISAGREED']); assert.equal(await postStatus(four.reply), 'VISIBLE')
 await decided(four.reply, 'reject')

 // --- deleting content decides the flags waiting on it, so no case is left open for a post that is gone
 const five = await topic('five')
 await flag(users.a, five.reply); await flag(users.b, five.first)
 const [replyFlag] = await flagsOf(five.reply), [firstFlag] = await flagsOf(five.first)
 await forum.moderatePost(mod, five.reply.id, 'delete')
 assert.equal((await caseOf(replyFlag))?.decision, 'approve', 'deleting a reply decides its flags')
 await forum.deleteThread(mod, five.thread.id)
 assert.equal((await caseOf(firstFlag))?.decision, 'approve', 'deleting a topic decides the flags in it')
 const six = await topic('six')
 await flag(users.a, six.first); await flag(users.b, six.reply)
 const sixFlags = [...await flagsOf(six.first), ...await flagsOf(six.reply)]
 await forum.resolveFlags(mod, six.first.id, 'delete')
 assert.equal(await db.forumThread.count({where: {id: six.thread.id}}), 0, 'purging a topic\'s first post removes the topic')
 for (const row of sixFlags) assert.equal((await caseOf(row))?.decision, 'approve')
 // --- held posts: a decision taken on what another moderator already decided is refused and changes nothing
 const seven = await topic('seven')
 const held = async post => {await db.forumPost.update({where: {id: post.id}, data: {status: 'PENDING'}}); return db.forumPost.findUniqueOrThrow({where: {id: post.id}, include: {thread: true}})}
 staleRead = await held(seven.reply)
 await db.forumPost.update({where: {id: seven.reply.id}, data: {status: 'VISIBLE'}}) // approved by someone else
 await assert.rejects(review.reviewPost(mod, seven.reply.id, 'reject'), error => error.status === 409)
 assert.equal(await postStatus(seven.reply), 'VISIBLE', 'an approved post is not deleted by a late reject')
 staleRead = await held(seven.first)
 await db.forumPost.update({where: {id: seven.first.id}, data: {status: 'VISIBLE'}})
 await assert.rejects(review.reviewPost(mod, seven.first.id, 'reject'), error => error.status === 409)
 assert.equal(await db.forumThread.count({where: {id: seven.thread.id}}), 1, 'nor its topic')
 staleRead = await held(seven.reply)
 await db.forumPost.update({where: {id: seven.reply.id}, data: {status: 'HIDDEN'}}) // decided otherwise meanwhile
 await assert.rejects(review.reviewPost(mod, seven.reply.id, 'approve'), error => error.status === 409)
 assert.equal(await postStatus(seven.reply), 'HIDDEN', 'a late approve does not publish it')
 const queued = await held(seven.reply)
 await review.reviewPost(mod, queued.id, 'reject')
 assert.equal(await db.forumPost.count({where: {id: queued.id}}), 0, 'a fresh reject still removes a held reply')
 console.log('PostgreSQL forum flags settled by moderator show and hide for replies and topics, no re-hide by a single flag, unrelated flags untouched, decisions atomic with their cases, refused when already decided, deletes deciding waiting flags, held posts decided once passed')
}
main().catch(error => {console.error(error); process.exitCode = 1}).finally(async () => {
 try {
  const staff = await db.user.findMany({where: {email: {startsWith: seed}}, select: {id: true}})
  const owned = await db.moderationCase.findMany({where: {source: 'forum-flags', decidedById: {in: staff.map(row => row.id)}}, select: {id: true}})
  await db.moderationDecision.deleteMany({where: {caseId: {in: owned.map(row => row.id)}}})
  await db.moderationCase.deleteMany({where: {id: {in: owned.map(row => row.id)}}})
  await db.forumCategory.deleteMany({where: {slug: {startsWith: seed}}})
  await db.user.deleteMany({where: {email: {startsWith: seed}}})
 } finally {await db.$disconnect()}
})
