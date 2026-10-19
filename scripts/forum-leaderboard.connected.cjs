// Real PostgreSQL posts and reactions, dated around a moment years ahead so that nothing else in the database
// falls inside the board's window: what the board shows is then exactly these fixtures.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript-api'), { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient(), seed = `lb${Date.now()}`
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
    if (name === '@/extensions/server/modules') return { isModuleEnabled: async () => true, getModuleSettings: async () => ({}), getModuleStates: async () => ({}) }
    if (name === 'react') return { ...require('react'), cache: fn => fn }
    if (name === '@/modules/membership/server/membership') return { getViewer: async () => null, isMember: async () => false }
    if (name.endsWith('.json')) return JSON.parse(fs.readFileSync(name.startsWith('@/') ? `src/${name.slice(2)}` : path.join(path.dirname(full), name), 'utf8'))
    if (name.startsWith('@/')) return load(`src/${name.slice(2)}`)
    if (name.startsWith('.')) return load(path.join(path.dirname(full), name))
    return require(name)
  }, mod, mod.exports)
  return mod.exports
}
const board = load('src/modules/forum/server/leaderboard.ts')
// 12:30 in Tehran on a day far ahead; Tehran is UTC+3:30, so its midnight is 20:30 UTC of the day before.
const NOW = new Date('2031-03-10T09:00:00.000Z')
const at = (daysAgo, tehranHour = 10, minute = 0) => new Date(Date.UTC(2031, 2, 10 - daysAgo, tehranHour, minute) - 3.5 * 3_600_000)

async function main() {
  assert.equal(await prisma.forumReaction.count({ where: { createdAt: { gte: new Date('2031-01-01T00:00:00Z') } } }), 0, 'the future window must be empty before the test')
  const users = {}
  for (const name of ['ana', 'bob', 'cyd', 'dan', 'eve', 'gone']) {
    users[name] = await prisma.user.create({ data: { email: `${seed}-${name}@example.invalid`, passwordHash: 'test-only', name: `${seed} ${name}`, status: name === 'gone' ? 'SUSPENDED' : 'ACTIVE' } })
    await prisma.forumProfile.create({ data: { userId: users[name].id, username: `${seed}${name}`.slice(0, 20), reputation: { ana: 2_000_000_000, bob: 1_999_999_999, gone: 2_000_000_001 }[name] || 0, postCount: { bob: 2_000_000_000 }[name] || 0 } })
  }
  const group = await prisma.forumGroup.create({ data: { slug: seed, name: seed } })
  const open = await prisma.forumCategory.create({ data: { slug: `${seed}-open`, title: `${seed} open`, sortOrder: 9000 } })
  const closed = await prisma.forumCategory.create({ data: { slug: `${seed}-closed`, title: `${seed} closed`, sortOrder: 9001, permissions: { create: [{ groupId: group.id, level: 'CREATE' }] } } })
  const topic = (cat, title) => prisma.forumThread.create({ data: { categoryId: cat.id, userId: users.ana.id, title } })
  const [pub, secret] = [await topic(open, 'public topic'), await topic(closed, 'secret topic')]
  let number = 0
  const post = (thread, who, content, when, data = {}) => prisma.forumPost.create({ data: { threadId: thread.id, userId: users[who].id, postNumber: ++number, content, createdAt: when, ...data } })
  const like = (target, who, when, emoji = 'heart') => prisma.forumReaction.create({ data: { postId: target.id, userId: users[who].id, emoji, createdAt: when } })
  const anaPost = await post(pub, 'ana', 'ana writes **well**', at(0, 9))
  const bobPost = await post(pub, 'bob', 'bob replies', at(3))
  const cydPost = await post(pub, 'cyd', 'cyd, long ago', at(20))
  const hiddenPost = await post(pub, 'dan', 'dan, hidden', at(0, 8), { status: 'HIDDEN' })
  const secretPost = await post(secret, 'dan', 'dan, in private', at(0, 8))
  await post(pub, 'bob', 'bob again', at(1)); await post(pub, 'bob', 'bob, older', at(10)); await post(pub, 'eve', 'eve, before the window', at(40))
  // today (Tehran): ana 2. A reaction at 23:50 last night belongs to yesterday, one at 00:10 to today.
  await like(anaPost, 'bob', at(0, 0, 10)); await like(anaPost, 'cyd', at(0, 11)); await like(bobPost, 'ana', at(1, 23, 50))
  // within the week: bob 3 more (two kinds of reaction from one member count twice), ana's own reaction counts for nothing
  await like(bobPost, 'cyd', at(2)); await like(bobPost, 'dan', at(2)); await like(bobPost, 'dan', at(2), 'thumbsup'); await like(anaPost, 'ana', at(2))
  // within the month only
  await like(cydPost, 'ana', at(15)); await like(cydPost, 'bob', at(15)); await like(cydPost, 'dan', at(15)); await like(cydPost, 'eve', at(16)); await like(cydPost, 'gone', at(16))
  // outside what an outsider may count: a hidden post, a private forum, and before the window
  for (const who of ['ana', 'bob', 'cyd', 'eve']) { await like(hiddenPost, who, at(0, 9)); await like(secretPost, who, at(0, 9)) }
  await like(cydPost, 'dan', at(45), 'laugh')

  const viewer = (userId, groupIds = []) => ({ userId, member: false, moderator: false, staff: false, trustLevel: 0, groupIds, silenced: false, suspended: false })
  const names = rows => rows.map(row => [row.author.name.split(' ')[1], row.points])
  const mine = rows => rows.filter(row => row.author.name.startsWith(seed))

  const today = await board.leaderboard(viewer(users.ana.id), { period: 'today' }, NOW)
  assert.deepEqual([names(today.reputation), today.mine], [[['ana', 2]], { place: 1, points: 2 }], 'today in Tehran: last night\'s reaction is yesterday\'s')
  assert.deepEqual(names(today.writers), [['ana', 1]], 'a hidden post is not a post written')
  const week = await board.leaderboard(viewer(users.cyd.id), {}, NOW)
  assert.deepEqual([week.period, names(week.reputation), week.mine], ['week', [['bob', 4], ['ana', 2]], { place: null, points: 0 }], 'the default is the week; a member\'s own reaction earns nothing')
  assert.deepEqual(names(week.writers), [['bob', 2], ['ana', 1]])
  assert.deepEqual(week.posts.map(row => [row.author.name.split(' ')[1], row.points, row.excerpt, row.topic.title]), [['bob', 4, 'bob replies', 'public topic'], ['ana', 2, 'ana writes well', 'public topic']], 'the most liked posts, as plain excerpts')
  const month = await board.leaderboard(viewer(null), { period: 'month' }, NOW)
  assert.deepEqual([names(month.reputation), month.mine], [[['cyd', 5], ['bob', 4], ['ana', 2]], null], 'a visitor has no standing of their own')
  assert.deepEqual(names(month.writers), [['bob', 3], ['ana', 1], ['cyd', 1]])
  assert.ok(!JSON.stringify(month).includes('private') && !JSON.stringify(month).includes('hidden') && !JSON.stringify(month).includes('secret'))
  // past leaders: yesterday bob (the 23:50 reaction), two days ago bob; today is not a past day
  assert.deepEqual(month.past.map(row => [row.day, row.author.name.split(' ')[1], row.points]), [['2031-03-09', 'bob', 1], ['2031-03-08', 'bob', 3]])

  // ---- a member of the private forum's group counts what is in it
  const inside = await board.leaderboard(viewer(users.eve.id, [group.id]), { period: 'today' }, NOW)
  assert.deepEqual(names(inside.reputation), [['dan', 4], ['ana', 2]], 'the private forum\'s reactions count for those who may see it; the hidden post still does not')
  assert.equal(inside.posts[0].excerpt, 'dan, in private')

  // ---- all time comes from what the profiles carry, active accounts only
  const all = await board.leaderboard(viewer(users.bob.id), { period: 'all' }, NOW)
  assert.deepEqual(names(mine(all.reputation)).slice(0, 2), [['ana', 2_000_000_000], ['bob', 1_999_999_999]], 'a suspended account is not on the board')
  assert.deepEqual([names(mine(all.writers))[0], all.mine.points], [['bob', 2_000_000_000], 1_999_999_999])
  assert.equal((await board.leaderboard(viewer(null), { period: 'nonsense' }, NOW)).period, 'week')
  assert.deepEqual([board.leaderDay(new Date('2031-03-09T20:29:00Z')), board.leaderDay(new Date('2031-03-09T20:31:00Z'))], ['2031-03-09', '2031-03-10'], 'the day turns at midnight in Tehran')
  console.log('PostgreSQL forum leaderboard: reputation and posts per period in Tehran days, own reactions, hidden posts and private forums left out, past leaders, and all-time from profiles passed')
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => {
  try {
    await prisma.forumCategory.deleteMany({ where: { slug: { startsWith: seed } } }); await prisma.forumGroup.deleteMany({ where: { slug: seed } })
    await prisma.user.deleteMany({ where: { email: { startsWith: seed } } })
  } finally { await prisma.$disconnect() }
})
