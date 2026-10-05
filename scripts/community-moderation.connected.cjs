// Real PostgreSQL: an author's deletion is final, hiding a post closes its open reports, and a comment can only be reported from a post the member can open.
// COMMUNITY_MODERATION_BASELINE=<git ref> loads the two community services from that ref to show the faults there.
const assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript'), {execFileSync} = require('node:child_process'), {PrismaClient} = require('@prisma/client')
const db = new PrismaClient(), seed = `cm${Date.now().toString(36)}`, baseline = process.env.COMMUNITY_MODERATION_BASELINE
const OLD = ['src/modules/community/server/community.ts', 'src/modules/community/server/admin.ts']
const mocks = {
 '@/platform/database/prisma': {db},
 '@/platform/http/rate-limit': {rateLimitHit: () => ({ok: true})},
 '@/platform/observability/logger': {logEvent: () => {}},
 '@/extensions/server/modules': {isModuleEnabled: async () => true, getModuleSettings: async () => ({})},
 '@/modules/notifications/server/inbox': {createInboxEvent: async () => ({})},
 '@/modules/content/server/registry': {itemCards: async () => new Map()},
 '@/modules/settings/server': {readJsonSetting: async (key, fallback) => fallback},
}
const source = file => baseline && OLD.includes(file) ? execFileSync('git', ['show', `${baseline}:${file}`], {encoding: 'utf8', maxBuffer: 1 << 26}) : fs.readFileSync(file, 'utf8')
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
const refuses = (promise, status) => assert.rejects(promise, error => error.status === status)
async function main() {
 const community = load('src/modules/community/server/community.ts'), admin = load('src/modules/community/server/admin.ts')
 const users = {}
 for (const name of ['author', 'reader', 'second', 'outsider', 'staff']) {
  users[name] = await db.user.create({data: {email: `${seed}-${name}@example.invalid`, passwordHash: 'test-only', name, role: name === 'staff' ? 'ADMIN' : 'USER'}})
  await db.userProfile.create({data: {userId: users[name].id, username: `${seed}_${name}`}})
 }
 const {author, reader, second, outsider, staff} = users
 const newPost = (content, extra = {}) => db.communityPost.create({data: {authorId: author.id, content, visibility: 'PUBLIC', ...extra}})
 const status = async id => (await db.communityPost.findUniqueOrThrow({where: {id}})).status
 const open = where => db.communityReport.count({where: {...where, status: 'OPEN'}})

 // --- the author's own deletion is final
 const regretted = await newPost('a post its author regrets')
 await community.report(reader.id, {postId: regretted.id, reason: 'SPAM'})
 assert.deepEqual(await community.deletePost(author.id, regretted.id), {deleted: true, moderated: false})
 await refuses(community.getPost(regretted.id, reader.id), 404)
 await assert.rejects(admin.moderatePost(regretted.id, 'restore'), 'staff cannot republish a post its author deleted')
 assert.notEqual(await status(regretted.id), 'VISIBLE'); await refuses(community.getPost(regretted.id, null), 404)
 // Staff still see it, marked as the author's deletion, and can filter for it; the report can be closed with or without "hide".
 const listed = (await admin.moderationPosts({status: 'DELETED'})).posts.find(row => row.id === regretted.id)
 assert.equal(listed?.status, 'DELETED')
 const pending = await db.communityReport.findFirstOrThrow({where: {postId: regretted.id}})
 await admin.resolveReport(pending.id, 'resolve', staff.id, true)
 assert.equal(await status(regretted.id), 'DELETED', 'closing a report does not turn the author\'s deletion into a restorable hide')
 assert.equal((await db.userProfile.findUniqueOrThrow({where: {userId: author.id}})).postCount, 0)

 // --- a moderator's hide is still reversible, and decides the open reports
 const disputed = await newPost('a disputed post')
 await community.report(reader.id, {postId: disputed.id, reason: 'ABUSE'}); await community.report(second.id, {postId: disputed.id, reason: 'SPAM'})
 const other = await newPost('an unrelated reported post')
 await community.report(reader.id, {postId: other.id, reason: 'SPAM'})
 assert.equal(await open({postId: disputed.id}), 2)
 assert.deepEqual(await admin.moderatePost(disputed.id, 'hide'), {status: 'HIDDEN'})
 assert.equal(await open({postId: disputed.id}), 0, 'hiding a post closes the reports that asked for it')
 assert.equal(await db.communityReport.count({where: {postId: disputed.id, status: 'RESOLVED'}}), 2)
 assert.equal(await open({postId: other.id}), 1, 'reports on other posts stay open')
 assert.deepEqual(await admin.moderatePost(disputed.id, 'restore'), {status: 'VISIBLE'})
 assert.equal(await open({postId: disputed.id}), 0, 'restoring does not reopen them')
 assert.equal((await community.getPost(disputed.id, reader.id)).id, disputed.id)
 // Staff removing a post through the member API hides it (reversible), as before.
 assert.deepEqual(await community.deletePost(staff.id, disputed.id), {deleted: true, moderated: true})
 assert.equal(await status(disputed.id), 'HIDDEN')
 assert.deepEqual(await admin.moderatePost(disputed.id, 'restore'), {status: 'VISIBLE'})

 // --- a comment is reported from a post the member can open
 const closed = await newPost('followers only', {visibility: 'FOLLOWERS'})
 await db.userFollow.create({data: {followerId: reader.id, followingId: author.id}})
 const comment = await db.communityComment.create({data: {postId: closed.id, authorId: reader.id, content: 'a comment under a followers-only post'}})
 await refuses(community.report(outsider.id, {commentId: comment.id, reason: 'SPAM'}), 404)
 assert.equal(await db.communityReport.count({where: {commentId: comment.id}}), 0, 'no report is stored for a comment the member cannot see')
 assert.deepEqual(await community.report(reader.id, {commentId: comment.id, reason: 'SPAM'}), {reported: true, duplicate: false})
 assert.deepEqual(await community.report(reader.id, {commentId: comment.id, reason: 'SPAM'}), {reported: true, duplicate: true})
 const publicComment = await db.communityComment.create({data: {postId: other.id, authorId: reader.id, content: 'a comment under a public post'}})
 assert.deepEqual(await community.report(outsider.id, {commentId: publicComment.id, reason: 'ABUSE'}), {reported: true, duplicate: false})
 console.log('PostgreSQL author deletion final, moderator hide reversible and closing open reports, comment reports only from an openable post passed')
}
main().catch(error => {console.error(error); process.exitCode = 1}).finally(async () => {
 try {
  const ids = (await db.user.findMany({where: {email: {startsWith: seed}}, select: {id: true}})).map(user => user.id)
  await db.communityReport.deleteMany({where: {reporterId: {in: ids}}}); await db.communityComment.deleteMany({where: {authorId: {in: ids}}}); await db.communityPost.deleteMany({where: {authorId: {in: ids}}})
  await db.userFollow.deleteMany({where: {OR: [{followerId: {in: ids}}, {followingId: {in: ids}}]}}); await db.userProfile.deleteMany({where: {userId: {in: ids}}}); await db.user.deleteMany({where: {id: {in: ids}}})
 } finally {await db.$disconnect()}
})
