// Real PostgreSQL forums, topics and assigned moderators. A member made moderator of one forum (or section) is
// asked to act inside it, under it and outside it: the same functions the pages and the API call.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript'), { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient(), seed = `fm${Date.now()}`
const cache = new Map()
function load(file) {
  const full = path.resolve(file.endsWith('.ts') || file.endsWith('.tsx') ? file : fs.existsSync(`${file}.ts`) ? `${file}.ts` : fs.existsSync(`${file}.tsx`) ? `${file}.tsx` : path.join(file, 'index.ts'))
  if (cache.has(full)) return cache.get(full).exports
  const mod = { exports: {} }; cache.set(full, mod)
  const source = ts.transpileModule(fs.readFileSync(full, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText
  new Function('require', 'module', 'exports', source)(name => {
    if (name === '@/platform/database/prisma') return { db: prisma }
    if (name === '@/platform/observability/logger') return { logEvent: () => {} }
    if (name === '@/modules/notifications/server/inbox') return { createInboxEvent: async () => {} }
    if (name === '@/modules/content/server/events') return { contentChanged: () => {} }
    if (name === '@/extensions/server/modules') return { isModuleEnabled: async () => true, getModuleSettings: async () => ({}), getModuleStates: async () => ({}) }
    // The session and the request cache belong to the web server; here a viewer is resolved by user id.
    if (name === 'react') return { ...require('react'), cache: fn => fn }
    if (name === '@/modules/membership/server/membership') return { getViewer: async () => null, isMember: async () => false }
    if (name.endsWith('.json')) return JSON.parse(fs.readFileSync(name.startsWith('@/') ? `src/${name.slice(2)}` : path.join(path.dirname(full), name), 'utf8'))
    if (name.startsWith('@/')) return load(`src/${name.slice(2)}`)
    if (name.startsWith('.')) return load(path.join(path.dirname(full), name))
    return require(name)
  }, mod, mod.exports)
  return mod.exports
}
const community = load('src/modules/forum/server/community.ts'), actions = load('src/modules/forum/server/actions.ts')
const moderation = load('src/modules/forum/server/moderation.ts'), forum = load('src/modules/forum/server/forum.ts'), board = load('src/modules/forum/server/board.ts')
const refused = async (promise, status, why) => { const error = await promise.then(() => null, caught => caught); assert.equal(error?.status, status, `${why}: expected ${status}, got ${error ? `${error.status} ${error.message}` : 'success'}`) }

async function main() {
  const users = {}
  for (const name of ['boss', 'local', 'member', 'gone']) {
    users[name] = await prisma.user.create({ data: { email: `${seed}-${name}@example.invalid`, passwordHash: 'test-only', name: `${seed} ${name}`, status: name === 'gone' ? 'SUSPENDED' : 'ACTIVE' } })
    await prisma.forumProfile.create({ data: { userId: users[name].id, username: `${seed}${name}`.slice(0, 20), trustLevel: 2 } })
  }
  const group = await prisma.forumGroup.create({ data: { slug: seed, name: seed } })
  const category = (name, data = {}) => prisma.forumCategory.create({ data: { slug: `${seed}-${name}`, title: `${seed} ${name}`, sortOrder: 9000, ...data } })
  const section = await category('section')
  const a = await category('a', { parentId: section.id }), b = await category('b', { parentId: section.id })
  const a1 = await category('a1', { parentId: a.id })
  const lone = await category('lone')
  const closed = await category('closed', { permissions: { create: [{ groupId: group.id, level: 'CREATE' }] } })
  await prisma.forumCategoryModerator.createMany({ data: [{ categoryId: section.id, userId: users.boss.id }, { categoryId: a.id, userId: users.local.id }, { categoryId: a.id, userId: users.gone.id }] })

  const topic = async (cat, title, status = 'VISIBLE') => {
    const thread = await prisma.forumThread.create({ data: { categoryId: cat.id, userId: users.member.id, title, status, postCount: 2 } })
    const first = await prisma.forumPost.create({ data: { threadId: thread.id, userId: users.member.id, postNumber: 1, content: `${title} opening`, status } })
    const reply = await prisma.forumPost.create({ data: { threadId: thread.id, userId: users.member.id, postNumber: 2, content: `${title} reply` } })
    return { ...thread, first, reply }
  }
  const [tA, tA1, tB, tLone] = [await topic(a, 'in a'), await topic(a1, 'in a1'), await topic(b, 'in b'), await topic(lone, 'in lone')]
  const [waitA, waitB] = [await topic(a, 'waiting a', 'PENDING'), await topic(b, 'waiting b', 'PENDING')]

  const [boss, local, member] = [await community.viewerFor(users.boss.id), await community.viewerFor(users.local.id), await community.viewerFor(users.member.id)]
  // ---- who moderates what: the forum and everything under it, nothing else
  assert.deepEqual([local.moderator, [...local.moderates].sort()], [false, [a.id, a1.id].sort()], 'a forum moderator moderates the forum and its subforums')
  assert.deepEqual([boss.moderator, [...boss.moderates].sort()], [false, [section.id, a.id, b.id, a1.id].sort()], 'a section moderator moderates every forum of the section')
  assert.deepEqual([member.moderator, member.moderates], [false, []])
  assert.deepEqual((await board.forumModerators([section.id, a.id])).map(row => row.name.split(' ')[1]), ['boss', 'local'], 'named on the forum page; a suspended account is not')

  // ---- inside the forum: pin, lock, hide, delete a post
  assert.equal((await actions.moderateThread(local, tA.id, { pinned: true, locked: true })).pinned, true)
  await actions.moderatePost(local, tA1.reply.id, 'hide')
  assert.equal((await prisma.forumPost.findUnique({ where: { id: tA1.reply.id } })).status, 'HIDDEN')
  await moderation.topicSettings(local, tA.id, { slowMode: 0, listed: true })
  // ---- outside it: an ordinary member
  await refused(actions.moderateThread(local, tB.id, { locked: true }), 403, 'another forum of the same section')
  await refused(actions.deleteThread(local, tLone.id), 403, 'a forum elsewhere')
  await refused(actions.moderatePost(local, tB.reply.id, 'hide'), 403, 'a post in another forum')
  await refused(moderation.topicSettings(local, tB.id, { listed: false }), 403, 'topic settings elsewhere')
  await refused(actions.resolveFlags(local, tB.reply.id, 'delete'), 403, 'flags elsewhere')
  await refused(actions.moderateThread(member, tA.id, { pinned: false }), 403, 'a member moderates nothing')
  assert.equal((await prisma.forumThread.findUnique({ where: { id: tB.id } })).locked, false)
  assert.ok(await prisma.forumThread.findUnique({ where: { id: tLone.id } }))
  // the section's moderator reaches the other forum
  assert.equal((await actions.moderateThread(boss, tB.id, { pinned: true })).pinned, true)

  // ---- what they see on the page: moderator tools and hidden posts in their own forum only
  const seenA = await forum.getTopic(tA1.id, local), seenB = await forum.getTopic(tB.id, local)
  assert.deepEqual([seenA.moderator, seenA.posts.length, seenB.moderator], [true, 2, false], 'the hidden reply is shown to the forum\'s moderator')
  assert.equal((await forum.getTopic(tA1.id, member)).posts.length, 1)
  assert.equal(await forum.getTopic(waitB.id, local), null, 'a topic waiting for review elsewhere stays out of sight')
  assert.ok(await forum.getTopic(waitA.id, local))

  // ---- moving: into a forum they moderate or may post in; never into a hidden forum or onto a section
  await actions.moderateThread(local, tA.id, { categoryId: a1.id })
  assert.equal((await prisma.forumThread.findUnique({ where: { id: tA.id } })).categoryId, a1.id)
  await actions.moderateThread(local, tA.id, { categoryId: lone.id })
  assert.equal((await prisma.forumThread.findUnique({ where: { id: tA.id } })).categoryId, lone.id, 'out to a forum open to everyone')
  await refused(actions.moderateThread(local, tA.id, { categoryId: a.id }), 403, 'once it left, it is no longer theirs to bring back')
  await refused(actions.moderateThread(local, tA1.id, { categoryId: closed.id }), 403, 'into a forum they cannot post in')
  await refused(actions.moderateThread(local, tA1.id, { categoryId: section.id }), 409, 'onto a section')
  await refused(moderation.movePosts(local, tA1.id, { postNumbers: [2], target: tB.id }), 403, 'posts into a topic of another forum')

  // ---- the review queue: their own forums
  assert.deepEqual((await moderation.reviewQueue(local)).map(row => row.thread.title).filter(title => title.startsWith('waiting')), ['waiting a'])
  assert.deepEqual((await moderation.reviewQueue(boss)).map(row => row.thread.title).filter(title => title.startsWith('waiting')).sort(), ['waiting a', 'waiting b'])
  await refused(moderation.reviewQueue(member), 403, 'the queue is closed to members')
  await refused(moderation.reviewPost(local, waitB.first.id, 'approve'), 403, 'approving elsewhere')
  await moderation.reviewPost(local, waitA.first.id, 'approve')
  assert.equal((await prisma.forumThread.findUnique({ where: { id: waitA.id } })).status, 'VISIBLE')

  // ---- a section takes no topics, from anyone
  const everyone = { ...member, moderator: true }
  const cats = await forum.visibleCategories(member), flag = slug => cats.find(row => row.slug === slug).access.create
  assert.deepEqual([flag(section.slug), flag(a.slug), flag(lone.slug)], [false, true, true], 'the composer is not offered a section')
  await refused(actions.createTopic(member, { categoryId: section.id, title: 'a topic on a section', content: 'this should not be accepted here' }), 409, 'a member')
  await refused(actions.createTopic(everyone, { categoryId: section.id, title: 'a topic on a section', content: 'this should not be accepted here' }), 409, 'nor staff')
  await refused(actions.moderateThread(everyone, tB.id, { categoryId: section.id }), 409, 'nor by moving')
  console.log('PostgreSQL forum moderators: a forum or section moderator acts inside it and under it only; moves, the review queue and hidden posts follow the same line; a section takes no topics passed')
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => {
  try {
    await prisma.forumCategory.deleteMany({ where: { slug: { startsWith: seed } } }); await prisma.forumGroup.deleteMany({ where: { slug: seed } })
    await prisma.user.deleteMany({ where: { email: { startsWith: seed } } })
  } finally { await prisma.$disconnect() }
})
