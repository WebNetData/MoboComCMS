// Real PostgreSQL posts and reactions. The forum's settings row and the job queue are kept in memory and the
// recount is narrowed to this script's members, so the local site's settings, jobs and members are not touched.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript-api'), { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient(), seed = `rep${Date.now()}`
const state = { settings: null, jobs: [], users: [] }
const profiles = new Proxy(prisma.forumProfile, { get: (target, key) => key === 'findMany' ? args => target.findMany({ ...args, where: { AND: [args.where || {}, { userId: { in: state.users } }] } }) : typeof target[key] === 'function' ? target[key].bind(target) : target[key] })
const db = new Proxy(prisma, { get: (target, key) =>
  key === 'forumProfile' ? profiles
  : key === 'setting' ? { findUnique: async () => state.settings ? { value: state.settings } : null, upsert: async ({ update }) => { state.settings = update.value } }
  : key === 'backgroundJob' ? { create: async ({ data }) => { state.jobs.push(data); return data } }
  : typeof target[key] === 'function' ? target[key].bind(target) : target[key] })
const cache = new Map()
function load(file) {
  const full = path.resolve(file.endsWith('.ts') || file.endsWith('.tsx') ? file : fs.existsSync(`${file}.ts`) ? `${file}.ts` : fs.existsSync(`${file}.tsx`) ? `${file}.tsx` : path.join(file, 'index.ts'))
  if (cache.has(full)) return cache.get(full).exports
  const mod = { exports: {} }; cache.set(full, mod)
  const source = ts.transpileModule(fs.readFileSync(full, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText
  new Function('require', 'module', 'exports', source)(name => {
    if (name === '@/platform/database/prisma') return { db }
    if (name === '@/platform/observability/logger') return { logEvent: () => {} }
    if (name === '@/modules/settings/server') return { readJsonSetting: async () => JSON.parse(state.settings || '{}'), updateJsonSetting: async (_key, mutate) => { const stored = JSON.parse(state.settings || '{}'); const result = await mutate(stored, db); state.settings = JSON.stringify(stored); return result } }
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
// A moment years ahead, so the board's window holds only these fixtures.
const NOW = new Date('2033-05-10T09:00:00.000Z'), hoursAgo = n => new Date(NOW.getTime() - n * 3_600_000)

async function main() {
  const community = load('src/modules/forum/server/community.ts'), board = load('src/modules/forum/server/leaderboard.ts'), people = load('src/modules/forum/server/people.ts')
  assert.equal(await prisma.forumReaction.count({ where: { createdAt: { gte: new Date('2033-01-01T00:00:00Z') } } }), 0, 'the future window must be empty before the test')
  const users = {}
  for (const name of ['ana', 'bob', 'cyd']) {
    users[name] = await prisma.user.create({ data: { email: `${seed}-${name}@example.invalid`, passwordHash: 'test-only', name: `${seed} ${name}` } })
    await prisma.forumProfile.create({ data: { userId: users[name].id, username: `${seed}${name}`.slice(0, 20), daysVisited: 1 } })
  }
  state.users = Object.values(users).map(user => user.id)
  const forum = await prisma.forumCategory.create({ data: { slug: `${seed}-open`, title: `${seed} open`, sortOrder: 9100 } })
  const thread = await prisma.forumThread.create({ data: { categoryId: forum.id, userId: users.ana.id, title: 'topic' } })
  let number = 0
  const post = who => prisma.forumPost.create({ data: { threadId: thread.id, userId: users[who].id, postNumber: ++number, content: `${who} writes`, createdAt: hoursAgo(30) } })
  const react = (target, who, emoji) => prisma.forumReaction.create({ data: { postId: target.id, userId: users[who].id, emoji, createdAt: hoursAgo(26) } })
  const anaPost = await post('ana'), bobPost = await post('bob')
  // ana: a heart and two claps from others, and (stored by hand; the site refuses it) her own heart. bob: one heart.
  await react(anaPost, 'bob', 'heart'); await react(anaPost, 'bob', 'clap'); await react(anaPost, 'cyd', 'clap'); await react(anaPost, 'ana', 'heart'); await react(bobPost, 'ana', 'heart')
  const ids = [users.ana.id, users.bob.id, users.cyd.id]
  const of = async weights => { const totals = await community.reputationOf(ids, { reactionWeights: weights }); return ids.map(id => totals.get(id)) }
  const stored = async () => (await prisma.forumProfile.findMany({ where: { userId: { in: ids } }, orderBy: { userId: 'asc' } })).map(row => row.reputation)

  // ---- reputation is counted from the reactions, each by the weight of its kind; one's own reaction is worth nothing
  assert.deepEqual(await of({}), [3, 1, 0], 'unset, every kind counts one')
  assert.deepEqual(await of({ clap: 3 }), [7, 1, 0])
  assert.deepEqual(await of({ clap: 0, heart: 2 }), [2, 2, 0], 'a kind may be worth nothing')
  assert.deepEqual([...(await community.reputationOf([], { reactionWeights: {} }))], [])
  // The migration's first value is the same count: history is carried over as it stands.
  const migrated = await prisma.$queryRaw`SELECT fp."userId" AS uid, COUNT(*)::int AS n FROM "ForumReaction" r JOIN "ForumPost" fp ON fp."id" = r."postId" WHERE r."userId" <> fp."userId" AND fp."userId" = ANY(${ids}) GROUP BY fp."userId" ORDER BY 1`
  assert.deepEqual(migrated.map(row => [row.uid, row.n]), [[users.ana.id, 3], [users.bob.id, 1]])

  // ---- changing a weight recounts everybody, over every reaction already given
  assert.deepEqual(await stored(), [0, 0, 0])
  let saved = await community.saveForumSettings({ reactionWeights: { clap: 3, heart: 1, nonsense: 9, fire: 99 } })
  assert.deepEqual([saved.reactionWeights, state.jobs.map(job => [job.kind, JSON.parse(job.payload)])], [{ clap: 3, fire: 10 }, [['forum.reputation-recount', { cursor: 0 }]]], 'only known kinds, cut to the bounds; one stays unwritten; the recount is queued')
  await community.saveForumSettings({ ...saved, maxTagsPerTopic: 4 })
  assert.equal(state.jobs.length, 1, 'saving other settings recounts nobody')
  const first = await community.recountReputation(0, 2)
  assert.deepEqual([first.changed, first.next, await stored()], [2, users.bob.id, [7, 1, 0]], 'a batch, and where to go on from')
  assert.deepEqual(await community.recountReputation(first.next, 2), { changed: 0, next: null })
  assert.deepEqual(await community.recountReputation(0), { changed: 0, next: null }, 'repeating it changes nothing')
  saved = await community.saveForumSettings({ ...saved, reactionWeights: { clap: 0, heart: 2 } })
  assert.equal(state.jobs.length, 2)
  await community.recountReputation(0)
  assert.deepEqual(await stored(), [2, 2, 0], 'the past is weighed again, not only what comes after')

  // ---- a member's own recount writes the same number; the plain count of reactions received is kept beside it
  await prisma.forumProfile.updateMany({ where: { userId: { in: ids } }, data: { reputation: 99 } })
  await community.refreshStats(users.ana.id)
  const ana = await prisma.forumProfile.findUniqueOrThrow({ where: { userId: users.ana.id } })
  assert.deepEqual([ana.reputation, ana.likesReceived], [2, 4])
  await community.recountReputation(0)

  // ---- the board and the profile read it
  const viewer = { userId: users.cyd.id, member: false, moderator: false, staff: false, trustLevel: 0, groupIds: [], moderates: [], silenced: false, suspended: false }
  const names = rows => rows.filter(row => row.author.name.startsWith(seed)).map(row => [row.author.name.split(' ')[1], row.points])
  await community.saveForumSettings({ ...saved, reactionWeights: { clap: 3 } }); await community.recountReputation(0)
  const week = await board.leaderboard(viewer, { period: 'week' }, NOW)
  assert.deepEqual([names(week.reputation), names(week.posts.map(row => ({ author: row.author, points: row.points })))], [[['ana', 7], ['bob', 1]], [['ana', 3], ['bob', 1]]], 'the period weighs each reaction by its kind; "most liked" stays a count')
  // All time is ordered by reputation, whatever the plain count of reactions says.
  await prisma.forumProfile.update({ where: { userId: users.bob.id }, data: { likesReceived: 50 } })
  assert.deepEqual(names((await board.leaderboard(viewer, { period: 'all' }, NOW)).reputation).slice(0, 2), [['ana', 7], ['bob', 1]])
  const profile = await people.getProfile(`${seed}ana`.slice(0, 20), viewer)
  assert.deepEqual([profile.profile.stats.reputation, profile.profile.stats.likesReceived], [7, 4])
  console.log('PostgreSQL forum reputation: reactions weighed by kind, own reactions worth nothing, a changed weight recounts all history in batches, and the board and profile read it passed')
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => {
  try {
    await prisma.forumCategory.deleteMany({ where: { slug: { startsWith: seed } } })
    await prisma.user.deleteMany({ where: { email: { startsWith: seed } } })
  } finally { await prisma.$disconnect() }
})
