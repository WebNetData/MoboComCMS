// Real PostgreSQL: a block hides the two members' comments from each other, and the profile posts read honors the profile gate.
// COMMUNITY_BLOCK_BASELINE=<git ref> loads the community service from that ref to show the fault there.
const assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript'), {execFileSync} = require('node:child_process'), {PrismaClient} = require('@prisma/client')
const db = new PrismaClient(), seed = `cb${Date.now().toString(36)}`, baseline = process.env.COMMUNITY_BLOCK_BASELINE
const mocks = {
 '@/platform/database/prisma': {db},
 '@/platform/http/rate-limit': {rateLimitHit: () => ({ok: true})},
 '@/platform/observability/logger': {logEvent: () => {}},
 '@/extensions/server/modules': {isModuleEnabled: async () => true, getModuleSettings: async () => ({})},
 '@/modules/notifications/server/inbox': {createInboxEvent: async () => ({})},
 '@/modules/content/server/registry': {itemCards: async () => new Map()},
 '@/modules/settings/server': {readJsonSetting: async (key, fallback) => fallback},
}
const source = file => baseline && file === 'src/modules/community/server/community.ts' ? execFileSync('git', ['show', `${baseline}:${file}`], {encoding: 'utf8', maxBuffer: 1 << 26}) : fs.readFileSync(file, 'utf8')
function load(file, cache = new Map()) {
 if (cache.has(file)) return cache.get(file).exports
 const mod = {exports: {}}; cache.set(file, mod)
 new Function('require', 'module', 'exports', ts.transpileModule(source(file), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}}).outputText)(name => {
  if (Object.hasOwn(mocks, name)) return mocks[name]
  if (name.startsWith('@/')) {const path = `src/${name.slice(2)}`; return load(fs.existsSync(path + '.ts') ? path + '.ts' : path + '/index.ts', cache)}
  return require(name)
 }, mod, mod.exports)
 return mod.exports
}
async function main() {
 const community = load('src/modules/community/server/community.ts')
 const users = {}
 for (const name of ['author', 'viewer', 'rival', 'friend', 'hermit', 'admin']) {
  users[name] = await db.user.create({data: {email: `${seed}-${name}@example.invalid`, passwordHash: 'test-only', name, role: name === 'admin' ? 'ADMIN' : 'USER'}})
  await db.userProfile.create({data: {userId: users[name].id, username: `${seed}_${name}`, privacy: JSON.stringify(name === 'hermit' ? {profile: 'PRIVATE'} : {})}})
 }
 const {author, viewer, rival, friend, hermit, admin} = users
 const post = await db.communityPost.create({data: {authorId: author.id, content: 'a public post', visibility: 'PUBLIC', commentCount: 3}})
 const say = (user, content, minutes) => db.communityComment.create({data: {postId: post.id, authorId: user.id, content, createdAt: new Date(Date.now() - minutes * 60_000)}})
 await say(friend, 'from a friend', 3); await say(rival, 'from the rival', 2); await say(viewer, 'from the viewer', 1)
 const names = view => view.map(comment => comment.author.name)
 const full = async who => names((await community.getPost(post.id, who)).all)
 const preview = async who => names((await community.homeFeed(who, {})).posts.find(row => row.id === post.id).preview)
 assert.deepEqual(await full(viewer.id), ['friend', 'rival', 'viewer'], 'no block: every comment')

 // --- the viewer blocks the rival: neither sees the other's comments, everyone else sees all
 await db.userBlock.create({data: {blockerId: viewer.id, blockedId: rival.id}})
 assert.deepEqual(await full(viewer.id), ['friend', 'viewer'], 'the blocker does not see the blocked member\'s comment')
 assert.deepEqual(await full(rival.id), ['friend', 'rival'], 'the blocked member does not see the blocker\'s comment')
 assert.deepEqual(await preview(viewer.id), ['friend', 'viewer'], 'the feed preview follows the same rule and still fills two slots')
 assert.deepEqual(await preview(rival.id), ['friend', 'rival'])
 for (const who of [friend.id, author.id, null]) assert.deepEqual(await full(who), ['friend', 'rival', 'viewer'], 'third parties and guests are unaffected')
 assert.equal((await community.getPost(post.id, viewer.id)).comments, 3, 'the stored comment count is not rewritten')
 await db.userBlock.deleteMany({where: {blockerId: viewer.id}})
 assert.deepEqual(await full(viewer.id), ['friend', 'rival', 'viewer'], 'unblocking restores them')

 // --- profile posts: the same gate as the profile page
 const ids = async (owner, who) => (await community.profilePosts(owner.id, who)).posts.map(row => row.id)
 const secret = await db.communityPost.create({data: {authorId: hermit.id, content: 'public post on a private profile', visibility: 'PUBLIC'}})
 assert.deepEqual(await ids(hermit, null), [], 'a private profile lists nothing to a guest')
 assert.deepEqual(await ids(hermit, viewer.id), [], 'nor to another member')
 assert.deepEqual(await ids(hermit, hermit.id), [secret.id], 'the owner sees their own')
 assert.deepEqual(await ids(hermit, admin.id), [secret.id], 'staff keep moderation access')
 assert.deepEqual(await ids(author, viewer.id), [post.id]); assert.deepEqual(await ids(author, null), [post.id], 'a public profile is unchanged')
 await db.userBlock.create({data: {blockerId: author.id, blockedId: viewer.id}})
 assert.deepEqual(await ids(author, viewer.id), [], 'a member the owner blocked cannot list the owner\'s posts')
 assert.deepEqual(await ids(author, friend.id), [post.id])
 await db.userProfile.update({where: {userId: hermit.id}, data: {privacy: JSON.stringify({profile: 'FOLLOWERS'})}})
 assert.deepEqual(await ids(hermit, viewer.id), [])
 await db.userFollow.create({data: {followerId: viewer.id, followingId: hermit.id}})
 assert.deepEqual(await ids(hermit, viewer.id), [secret.id], 'followers-only profile opens to a follower')
 assert.deepEqual(await ids({id: 999_999_999}, viewer.id), [], 'an unknown owner lists nothing')
 console.log('PostgreSQL blocked members\' comments hidden both ways in post and feed preview, third parties unaffected, profile posts behind the profile gate passed')
}
main().catch(error => {console.error(error); process.exitCode = 1}).finally(async () => {
 try {
  const ids = (await db.user.findMany({where: {email: {startsWith: seed}}, select: {id: true}})).map(user => user.id)
  await db.communityComment.deleteMany({where: {authorId: {in: ids}}}); await db.communityPost.deleteMany({where: {authorId: {in: ids}}})
  await db.userBlock.deleteMany({where: {OR: [{blockerId: {in: ids}}, {blockedId: {in: ids}}]}}); await db.userFollow.deleteMany({where: {OR: [{followerId: {in: ids}}, {followingId: {in: ids}}]}})
  await db.userProfile.deleteMany({where: {userId: {in: ids}}}); await db.user.deleteMany({where: {id: {in: ids}}})
 } finally {await db.$disconnect()}
})
