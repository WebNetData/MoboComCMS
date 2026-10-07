// Real PostgreSQL forums, topics, posts and profiles. The board index is asked as three different viewers;
// only this script's forums are looked at, whatever else the database holds.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript'), { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient(), seed = `board-${Date.now()}`
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
    if (name.endsWith('.json')) return JSON.parse(fs.readFileSync(name.startsWith('@/') ? `src/${name.slice(2)}` : path.join(path.dirname(full), name), 'utf8'))
    if (name.startsWith('@/')) return load(`src/${name.slice(2)}`)
    if (name.startsWith('.')) return load(path.join(path.dirname(full), name))
    return require(name)
  }, mod, mod.exports)
  return mod.exports
}
const board = load('src/modules/forum/server/board.ts'), forum = load('src/modules/forum/server/forum.ts')
const now = new Date(), ago = minutes => new Date(now.getTime() - minutes * 60_000)

async function main() {
  const [writer, replier, lurker, insider] = await Promise.all(['writer', 'replier', 'lurker', 'insider'].map(name => prisma.user.create({ data: { email: `${seed}-${name}@example.invalid`, passwordHash: 'test-only', name: `${seed} ${name}` } })))
  const profile = (user, data = {}) => prisma.forumProfile.create({ data: { userId: user.id, username: `${seed}-${user.id}`.replace(/[^a-z0-9-]/g, ''), ...data } })
  await profile(writer, { lastSeenAt: ago(2) }); await profile(replier, { lastSeenAt: ago(60) }); await profile(lurker, { lastSeenAt: ago(1) }); await profile(insider)
  const group = await prisma.forumGroup.create({ data: { slug: seed, name: seed } })
  const category = (name, data = {}) => prisma.forumCategory.create({ data: { slug: `${seed}-${name}`, title: `${seed} ${name}`, sortOrder: 9000, ...data } })
  const parent = await category('games', { description: 'section' })
  const [pc, consoleForum] = [await category('pc', { parentId: parent.id, threadCount: 2, postCount: 5 }), await category('console', { parentId: parent.id })]
  // Subforums of a forum: one open, one for the private group only.
  const mods = await category('pc-mods', { parentId: pc.id, threadCount: 3, postCount: 4 })
  const lone = await category('lounge', { threadCount: 1, postCount: 1 })
  const secret = await category('staff-room', { permissions: { create: [{ groupId: group.id, level: 'CREATE' }] } })
  const topic = (cat, title, user, minutes, data = {}) => prisma.forumThread.create({ data: { categoryId: cat.id, userId: user.id, title, lastPostAt: ago(minutes), replyCount: 1, ...data } })
  const older = await topic(pc, 'older topic', writer, 600)
  const newer = await topic(pc, 'newer topic', writer, 30, { lastPostUserId: replier.id })
  await topic(pc, 'hidden topic', writer, 1, { status: 'HIDDEN' }); await topic(pc, 'unlisted topic', writer, 1, { listed: false })
  const stale = await topic(lone, 'stale topic', writer, 60 * 24 * 45)
  const classified = await topic(secret, 'classified topic', writer, 5)
  const vault = await category('pc-vault', { parentId: pc.id, threadCount: 9, postCount: 9, permissions: { create: [{ groupId: group.id, level: 'CREATE' }] } })
  const modTopic = await topic(mods, 'mod topic', writer, 10); await topic(vault, 'vault topic', writer, 3)
  const post = (thread, user, n, data = {}) => prisma.forumPost.createMany({ data: Array.from({ length: n }, () => ({ threadId: thread.id, userId: user.id, content: 'x', ...data })) })
  // Enough posts to lead the site-wide list whatever else the database holds.
  await post(newer, writer, 60); await post(older, replier, 50); await post(classified, lurker, 90); await post(newer, lurker, 80, { status: 'HIDDEN' }); await post(stale, insider, 70, { createdAt: ago(60 * 24 * 45) })

  const viewer = (userId, groupIds = []) => ({ userId, member: false, moderator: false, staff: false, trustLevel: 0, groupIds, silenced: false, suspended: false })
  const mine = result => ({
    sections: result.sections.map(section => ({ ...section, forums: section.forums.filter(forum => forum.slug.startsWith(seed)) })).filter(section => section.forums.length),
    topics: result.topics.filter(row => row.forum.slug.startsWith(seed)).map(row => row.title),
    contributors: result.contributors.filter(row => row.author.name.startsWith(seed)).map(row => [row.author.name.split(' ')[1], row.posts]),
    online: result.online.filter(row => row.name.startsWith(seed)).map(row => row.name.split(' ')[1]).sort(),
    text: JSON.stringify(result),
  })

  // ---- a member outside the private group
  const member = mine(await board.boardIndex(viewer(lurker.id), now))
  const section = member.sections.find(row => row.slug === parent.slug)
  assert.deepEqual(section.forums.map(forum => forum.slug), [pc.slug, consoleForum.slug], 'a section lists its subforums in order')
  const first = section.forums[0]
  assert.deepEqual([first.threadCount, first.postCount, first.topics, first.posts, first.last.topicId, first.last.title, first.quiet], [2, 5, 5, 9, modTopic.id, 'mod topic', false], 'a forum is sized and dated over itself and the subforums the viewer may see')
  assert.deepEqual(first.subforums.map(sub => [sub.slug, sub.topics, sub.quiet]), [[mods.slug, 3, false]], 'its subforums, without the private one')
  assert.deepEqual([section.topics, section.posts], [5, 9], 'a section adds up its forums')
  const rows = await board.subforumRows(viewer(lurker.id), pc.id, now)
  assert.deepEqual(rows.map(row => [row.slug, row.last.title]), [[mods.slug, 'mod topic']], 'the forum page lists the same subforums')
  const listed = await forum.topicList({ viewer: viewer(lurker.id), categorySlug: pc.slug })
  assert.deepEqual(listed.rows.map(row => row.title).sort(), ['mod topic', 'newer topic', 'older topic'], 'a forum lists its own topics and those of visible subforums')
  assert.deepEqual((await forum.topicList({ viewer: viewer(lurker.id), categorySlug: parent.slug })).rows.map(row => row.title).sort(), ['mod topic', 'newer topic', 'older topic'], 'a section reaches down through both levels')
  assert.deepEqual([section.forums[1].last, section.forums[1].quiet], [null, true], 'an empty forum has no last post')
  const shared = member.sections.find(row => row.id === 0)
  assert.ok(shared.forums.some(forum => forum.slug === lone.slug), 'a forum without subforums sits in the shared section')
  assert.equal(member.sections[member.sections.length - 1].id, 0, 'which comes after the real sections')
  assert.equal(shared.forums.find(forum => forum.slug === lone.slug).quiet, true, 'nothing for a month: quiet')
  assert.ok(!member.text.includes('classified topic') && !member.text.includes(secret.slug) && !member.text.includes('vault') && !member.text.includes('hidden topic') && !member.text.includes('unlisted topic'), 'nothing of a forum the viewer cannot see, nor hidden or unlisted topics')
  // The six most recent topics of the whole site: on a busy database the 45-day-old one has fallen off the list, on an empty one it is the fourth.
  assert.deepEqual(member.topics.slice(0, 3), ['mod topic', 'newer topic', 'older topic'])
  assert.deepEqual(member.topics.slice(3).filter(title => title !== 'stale topic'), [])
  assert.deepEqual(member.contributors, [['writer', 60], ['replier', 50]], 'posts of the last 30 days in visible forums; hidden posts and private forums do not count')
  assert.deepEqual(member.online, ['lurker', 'writer'], 'seen in the last ten minutes')

  // ---- a member of the private group
  const inside = mine(await board.boardIndex(viewer(insider.id, [group.id]), now))
  assert.ok(inside.sections.some(row => row.forums.some(forum => forum.slug === secret.slug && forum.last.title === 'classified topic')))
  assert.equal(inside.topics[0], 'vault topic')
  const insidePc = inside.sections.find(row => row.slug === parent.slug).forums[0]
  assert.deepEqual([insidePc.topics, insidePc.last.title, insidePc.subforums.map(sub => sub.slug)], [14, 'vault topic', [mods.slug, vault.slug]], 'a member of the group gets the private subforum counted in')
  assert.equal((await board.subforumRows(viewer(insider.id, [group.id]), pc.id, now)).length, 2)
  assert.deepEqual(inside.contributors[0], ['lurker', 90])

  // ---- a visitor: the same public forums, and no names of who is online
  const guest = mine(await board.boardIndex(viewer(null), now))
  assert.deepEqual(guest.topics.slice(0, 3), ['mod topic', 'newer topic', 'older topic'])
  assert.deepEqual(guest.online, [])
  assert.ok(!guest.text.includes('classified topic') && !guest.text.includes('vault'))
  assert.equal(board.isQuiet(ago(60 * 24 * 29), now), false); assert.equal(board.isQuiet(ago(60 * 24 * 31), now), true); assert.equal(board.isQuiet(null, now), true)
  console.log('PostgreSQL forum board index: sections and forums, last post, quiet forums, contributors, presence, and nothing from forums a viewer cannot see passed')
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => {
  try {
    await prisma.forumCategory.deleteMany({ where: { slug: { startsWith: seed } } }); await prisma.forumGroup.deleteMany({ where: { slug: seed } })
    await prisma.user.deleteMany({ where: { email: { startsWith: seed } } })
  } finally { await prisma.$disconnect() }
})
