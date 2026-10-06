// Real PostgreSQL forum posts and feed posts. The stream is asked as different viewers; the fixtures are the
// newest rows of the database, so they lead the stream whatever else it holds.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript'), { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient(), seed = `stream-${Date.now()}`
const cache = new Map()
let community = true
function load(file) {
  const full = path.resolve(file.endsWith('.ts') || file.endsWith('.tsx') ? file : fs.existsSync(`${file}.ts`) ? `${file}.ts` : fs.existsSync(`${file}.tsx`) ? `${file}.tsx` : path.join(file, 'index.ts'))
  if (cache.has(full)) return cache.get(full).exports
  const mod = { exports: {} }; cache.set(full, mod)
  const source = ts.transpileModule(fs.readFileSync(full, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText
  new Function('require', 'module', 'exports', source)(name => {
    if (name === '@/platform/database/prisma') return { db: prisma }
    if (name === '@/platform/observability/logger') return { logEvent: () => {} }
    if (name === '@/modules/notifications/server/inbox') return { createInboxEvent: async () => {} }
    // The module switch is the script's to turn; settings of modules come back empty.
    if (name === '@/extensions/server/modules') return { isModuleEnabled: async id => id !== 'community' || community, getModuleSettings: async () => ({}), getModuleStates: async () => ({}) }
    if (name.endsWith('.json')) return JSON.parse(fs.readFileSync(name.startsWith('@/') ? `src/${name.slice(2)}` : path.join(path.dirname(full), name), 'utf8'))
    if (name.startsWith('@/')) return load(`src/${name.slice(2)}`)
    if (name.startsWith('.')) return load(path.join(path.dirname(full), name))
    return require(name)
  }, mod, mod.exports)
  return mod.exports
}
const stream = load('src/modules/forum/server/stream.ts')
const start = Date.now(), at = seconds => new Date(start + seconds * 1000)

async function main() {
  const [writer, friend, stranger] = await Promise.all(['writer', 'friend', 'stranger'].map(name => prisma.user.create({ data: { email: `${seed}-${name}@example.invalid`, passwordHash: 'test-only', name: `${seed} ${name}` } })))
  for (const user of [writer, friend, stranger]) await prisma.forumProfile.create({ data: { userId: user.id, username: `${seed}${user.id}` } })
  const group = await prisma.forumGroup.create({ data: { slug: seed, name: seed } })
  const open = await prisma.forumCategory.create({ data: { slug: `${seed}-open`, title: `${seed} open`, color: '#123456' } })
  const closed = await prisma.forumCategory.create({ data: { slug: `${seed}-closed`, title: `${seed} closed`, permissions: { create: [{ groupId: group.id, level: 'CREATE' }] } } })
  const thread = (category, title, data = {}) => prisma.forumThread.create({ data: { categoryId: category.id, userId: writer.id, title, ...data } })
  const post = (row, number, content, seconds, data = {}) => prisma.forumPost.create({ data: { threadId: row.id, userId: writer.id, postNumber: number, content, createdAt: at(seconds), ...data } })
  const publicTopic = await thread(open, 'public topic'), secretTopic = await thread(closed, 'secret topic'), unlisted = await thread(open, 'unlisted topic', { listed: false })
  await post(publicTopic, 1, '**opening** post', 10); await post(publicTopic, 2, 'a reply [with a link](https://example.invalid)', 20); await post(publicTopic, 3, 'hidden reply', 30, { status: 'HIDDEN' })
  await post(secretTopic, 1, 'secret opening', 40); await post(unlisted, 1, 'unlisted opening', 50)
  await prisma.userFollow.create({ data: { followerId: friend.id, followingId: writer.id } })
  await prisma.communityPost.create({ data: { authorId: writer.id, content: 'a public feed post', createdAt: at(60) } })
  await prisma.communityPost.create({ data: { authorId: writer.id, content: 'for followers only', visibility: 'FOLLOWERS', createdAt: at(70) } })
  await prisma.communityPost.create({ data: { authorId: writer.id, content: 'hidden by staff', status: 'HIDDEN', createdAt: at(80) } })

  const viewer = (userId, groupIds = []) => ({ userId, member: false, moderator: false, staff: false, trustLevel: 0, groupIds, silenced: false, suspended: false })
  const mine = result => result.entries.filter(entry => entry.person.name.startsWith(seed)).map(entry => [entry.kind, entry.title || entry.text])
  const all = await stream.activityStream(viewer(stranger.id))
  assert.deepEqual(mine(all), [['post', 'a public feed post'], ['reply', 'public topic'], ['topic', 'public topic']], 'newest first across the forum and the feed; nothing hidden, unlisted, private or for followers')
  const reply = all.entries.find(entry => entry.kind === 'reply' && entry.person.name.startsWith(seed))
  assert.deepEqual([reply.text, reply.href, reply.place.title, reply.place.color, reply.person.href], ['a reply with a link', `/forum/t/${publicTopic.id}?post=2`, `${seed} open`, '#123456', `/forum/u/${seed}${writer.id}`], 'plain excerpt, link to the post, its forum')
  assert.equal(all.entries.find(entry => entry.kind === 'post' && entry.person.name.startsWith(seed)).href.startsWith('/feed/p/'), true)

  // ---- each viewer sees what their own access allows
  assert.deepEqual(mine(await stream.activityStream(viewer(friend.id))).slice(0, 2), [['post', 'for followers only'], ['post', 'a public feed post']], 'a follower also gets the followers-only post')
  assert.deepEqual(mine(await stream.activityStream(viewer(stranger.id, [group.id]))).filter(row => row[1] === 'secret topic'), [['topic', 'secret topic']], 'a member of the group sees its forum')
  const guest = await stream.activityStream(viewer(null))
  assert.deepEqual(mine(guest), mine(all)); assert.ok(!JSON.stringify(guest).includes('secret'))

  // ---- filters
  assert.deepEqual(mine(await stream.activityStream(viewer(stranger.id), { filter: 'topics' })), [['topic', 'public topic']])
  assert.deepEqual(mine(await stream.activityStream(viewer(stranger.id), { filter: 'replies' })), [['reply', 'public topic']])
  assert.deepEqual(mine(await stream.activityStream(viewer(stranger.id), { filter: 'posts' })), [['post', 'a public feed post']])
  assert.equal((await stream.activityStream(viewer(stranger.id), { filter: 'nonsense' })).filter, 'all')

  // ---- older than a moment: the cursor
  assert.deepEqual(mine(await stream.activityStream(viewer(stranger.id), { before: at(55).toISOString() })), [['reply', 'public topic'], ['topic', 'public topic']])
  assert.deepEqual(mine(await stream.activityStream(viewer(stranger.id), { before: 'not a date' })), mine(all))

  // ---- the feed switched off: forum only, and no "posts" tab
  community = false
  const forumOnly = await stream.activityStream(viewer(stranger.id))
  assert.deepEqual([mine(forumOnly), forumOnly.posts], [[['reply', 'public topic'], ['topic', 'public topic']], false])
  assert.deepEqual(mine(await stream.activityStream(viewer(stranger.id), { filter: 'posts' })), [])
  console.log('PostgreSQL activity stream: forum and feed merged newest first, limited to what each viewer may see, filters, cursor and the feed switch passed')
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => {
  try {
    const users = (await prisma.user.findMany({ where: { email: { startsWith: seed } }, select: { id: true } })).map(row => row.id)
    await prisma.communityPost.deleteMany({ where: { authorId: { in: users } } }); await prisma.userFollow.deleteMany({ where: { OR: [{ followerId: { in: users } }, { followingId: { in: users } }] } })
    await prisma.forumCategory.deleteMany({ where: { slug: { startsWith: seed } } }); await prisma.forumGroup.deleteMany({ where: { slug: seed } })
    await prisma.user.deleteMany({ where: { id: { in: users } } })
  } finally { await prisma.$disconnect() }
})
